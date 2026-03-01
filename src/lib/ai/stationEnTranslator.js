import { postLLMChat } from "./openrouterClient";
import { getAiConfig } from "./aiConfig";
import { toFiniteNumber } from "../async/utils";

const TRANSLATION_BATCH_SIZE = 10;
const STATIONS_PER_REQUEST = 4;

// Few-shot 示例：中文站名 → 英文站名
const TRANSLATION_FEW_SHOT_EXAMPLES = [
  ["创新谷", "Innovation Valley"],
  ["大学城", "University Town"],
  ["玉符河", "Yufu River"],
  ["济南站", "Jinan Railway Station"],
  ["长途汽车站", "Coach Station"],
  ["紫薇路", "Ziwei Road"],
  ["遥墙机场南", "Jinan International Airport South"],
  ["奥体中心", "Olympic Sports Center"],
  ["龙奥大厦", "Long'ao Building"],
  ["济南西站西广场", "Jinanxi Railway Station West Square"],
  ["八一立交桥", "Bayi Interchange"],
  ["黄金产业园", "Gold Industrial Park"],
  ["玉函小区", "Yuhan Xiaoqu"],
  ["齐鲁软件园", "Qilu Software Park"],
  ["世纪大道", "Century Avenue"],
  ["超算中心", "Supercomputer Center"],
  ["经七纬二", "Jingqi Weier"],
  ["彩虹湖", "Rainbow Lake"],
  ["飞跃大道东", "Feiyue Avenue East"],
  ["济北小学", "Jibei Primary School"],
  ["杆石桥", "Ganshiqiao"],
];

const ENGLISH_NAMING_STANDARD = `
## 一、专名翻译规则
- 使用汉语拼音，不标声调
- 多音节连写，各词首字母大写
- 示例：二环南路 → Erhuan Nanlu

## 二、通名翻译规则
道路类：
  - 路/马路 → Road
  - 大道 → Avenue
  - 街 → Street
  - 立交桥 → Interchange

公共设施类：
  - 公园 → Park
  - 医院 → Hospital
  - 妇幼保健院 → Maternal and Child Health Hospital
  - 学校 → School
  - 体育中心 → Sports Center
  - 机场 → Airport
  - 小区 Xiaoqu（中国特有名词）
## 三、方位词处理
- 如果方位词是道路专名的固有组成部分，保留拼音
  示例：二环南路 → Erhuan Nanlu（不是 Erhuan South Road）
  示例：山师东路 → Shanshi Donglu（不是 Shanshi East Road）
- 仅在表达独立方位修饰时才使用 East/West/South/North
  示例：机场南 → Airport South

## 四、Station 后缀规则
必须保留 Station 的情况：
  - 火车站 → Railway Station
  - 汽车站 → Bus Station
  - 长途汽车站 → Coach Station
  示例：济南站 → Jinan Railway Station

禁止添加 Station 的情况：
  - 普通地名、道路、建筑、区域等
  - 不得添加 Metro Station / Subway Station
  示例：大学城 → University Town（不是 University Town Station）

## 五、特殊规则
- 公共机构名称必须意译通名，不得整词音译
- 多线换乘站中英文统一
- 特有地名直接用罗马字转写
`.trim();
const CHINESE_STATION_SUFFIX_REGEX = /(地铁站|车站|站)$/u;

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

function toTitleWords(text) {
  return String(text || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function stripChineseStationSuffix(text) {
  return String(text || "")
    .trim()
    .replace(CHINESE_STATION_SUFFIX_REGEX, "")
    .trim();
}

function sanitizeEnglishStationName(text) {
  return String(text || "")
    .trim()
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fallbackNameEn(nameZh, previousNameEn = "") {
  const previous = sanitizeEnglishStationName(previousNameEn);
  if (previous) return previous;
  const zh = stripChineseStationSuffix(nameZh);
  if (!zh) return "";
  if (!hasCjk(zh)) return toTitleWords(zh);
  return zh;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || !items.length) return [];
  const normalizedSize = Math.max(
    1,
    Math.floor(toFiniteNumber(size, TRANSLATION_BATCH_SIZE)),
  );
  const chunks = [];
  for (let i = 0; i < items.length; i += normalizedSize) {
    chunks.push(items.slice(i, i + normalizedSize));
  }
  return chunks;
}

function normalizeInputStations(stations) {
  if (!Array.isArray(stations)) return [];
  return stations
    .map((station) => ({
      stationId: String(station?.stationId || station?.id || "").trim(),
      nameZh: String(station?.nameZh || "").trim(),
      previousNameEn: String(
        station?.nameEn || station?.previousNameEn || "",
      ).trim(),
    }))
    .filter((station) => station.stationId && station.nameZh);
}

function isResponseFormatError(error) {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("response_format") ||
    text.includes("json_schema") ||
    text.includes("structured")
  );
}

async function postLLMChatWithFallback(payload, signal) {
  try {
    return await postLLMChat(payload, signal);
  } catch (error) {
    if (!payload?.response_format || !isResponseFormatError(error)) {
      throw error;
    }
    const degradedPayload = { ...payload };
    delete degradedPayload.response_format;
    return postLLMChat(degradedPayload, signal);
  }
}

/**
 * 将 few-shot 示例按每组 STATIONS_PER_REQUEST 个合并
 */
function buildFewShotMessages() {
  const messages = [];
  for (let i = 0; i < TRANSLATION_FEW_SHOT_EXAMPLES.length; i += STATIONS_PER_REQUEST) {
    const group = TRANSLATION_FEW_SHOT_EXAMPLES.slice(i, i + STATIONS_PER_REQUEST);
    const userContent = group.map(([zh]) => zh).join("\n");
    const assistantContent = group.map(([, en]) => en).join("\n");
    messages.push(
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    );
  }
  return messages;
}

/**
 * 翻译一批站点（最多 STATIONS_PER_REQUEST 个）
 * @param {{stationId: string, nameZh: string, previousNameEn?: string}[]} stations
 * @param {string} model
 * @param {AbortSignal} signal
 * @param {{name: string, nameEn?: string}} cityContext
 * @returns {Promise<Array<{stationId: string, nameEn: string}>>}
 */
async function translateStationBatch(stations, model, signal, cityContext) {
  const systemPrompt = [
    "# 角色",
    "你是轨道交通英文站名规范翻译助手。",
    "",
    "# 任务",
    "根据输入的中文站名，生成符合规范的英文站名。",
    "",
    "# 翻译规范",
    ENGLISH_NAMING_STANDARD,
    "",
    "# 输出要求",
    "- 每行一个英文站名，顺序与输入对应",
    "- 不要包含任何其他内容（不要引号、编号、解释）",
    "",
    "# 禁止事项",
    "- 不得凭空添加不在中文名中的地名",
    "- 不得对公共机构名称整词音译（必须意译通名）",
    "- 不得使用生僻缩写或不规范拼写",
    ...(cityContext
      ? [
          "",
          "# 城市上下文",
          `当前城市：${cityContext.name}${cityContext.nameEn ? `（${cityContext.nameEn}）` : ""}`,
          "请根据该城市的地理和文化背景进行翻译，例如涉及当地地名、机场、火车站等应使用该城市对应的英文名。",
        ]
      : []),
  ].join("\n");

  // 构建 few-shot 对话
  const fewShotMessages = buildFewShotMessages();

  const userContent = stations.map((s) => s.nameZh).join("\n");

  const payload = {
    model,
    stream: false,
    temperature: 0,
    top_p: 0.8,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...fewShotMessages,
      {
        role: "user",
        content: userContent,
      },
    ],
  };

  const response = await postLLMChat(payload, signal);
  const content = sanitizeEnglishStationName(
    response?.choices?.[0]?.message?.content || "",
  );
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

  const results = [];
  for (let i = 0; i < stations.length && i < lines.length; i++) {
    results.push({ stationId: stations[i].stationId, nameEn: lines[i] });
  }

  return results;
}

/** @param {{stations?: Array<{id?: string, stationId?: string, nameZh: string, nameEn?: string}>, model?: string, signal?: AbortSignal, onProgress?: function, cityContext?: {name: string, nameEn?: string}}} options @returns {Promise<{updates: Array<{stationId: string, nameEn: string}>, failed: Array<{stationId: string, reason: string}>}>} */
export async function retranslateStationEnglishNames({
  stations,
  model,
  signal,
  onProgress,
  cityContext,
} = {}) {
  const normalizedStations = normalizeInputStations(stations);
  const total = normalizedStations.length;
  if (!total) {
    return { updates: [], failed: [] };
  }

  let resolvedModel = model;
  if (!resolvedModel) {
    resolvedModel = getAiConfig().model;
  }
  if (!resolvedModel) {
    throw new Error("请先在「设置 → AI 配置」中填写模型名称");
  }

  const updates = [];
  const failed = [];

  let done = 0;
  onProgress?.({ done, total, percent: 0, message: "准备翻译任务..." });

  // 将站点按 STATIONS_PER_REQUEST 分组
  const stationBatches = [];
  for (let i = 0; i < normalizedStations.length; i += STATIONS_PER_REQUEST) {
    stationBatches.push(normalizedStations.slice(i, i + STATIONS_PER_REQUEST));
  }

  // 将批次按 TRANSLATION_BATCH_SIZE 分组（并行控制）
  const parallelChunks = chunkArray(stationBatches, TRANSLATION_BATCH_SIZE);

  // 并行处理所有chunk
  const chunkPromises = parallelChunks.map(async (batches) => {
    if (signal?.aborted) {
      throw new Error("重译任务已取消");
    }

    // chunk内每个批次独立请求
    const batchPromises = batches.map((batch) =>
      translateStationBatch(batch, resolvedModel, signal, cityContext)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    const chunkUpdates = [];
    const chunkFailed = [];

    for (let i = 0; i < batchResults.length; i++) {
      const batch = batches[i];
      const result = batchResults[i];

      if (result.status === "fulfilled" && result.value?.length > 0) {
        const translatedIds = new Set(result.value.map((r) => r.stationId));
        chunkUpdates.push(...result.value);

        // 处理该批次中未翻译的站点
        for (const station of batch) {
          if (!translatedIds.has(station.stationId)) {
            const fallback = fallbackNameEn(station.nameZh, station.previousNameEn);
            if (fallback) {
              chunkUpdates.push({ stationId: station.stationId, nameEn: fallback });
            } else {
              chunkFailed.push({ stationId: station.stationId, reason: "模型未返回该站点翻译" });
            }
          }
        }
      } else {
        // 整个批次失败，fallback所有站点
        for (const station of batch) {
          const fallback = fallbackNameEn(station.nameZh, station.previousNameEn);
          if (fallback) {
            chunkUpdates.push({ stationId: station.stationId, nameEn: fallback });
          } else {
            const reason = result.status === "rejected"
              ? result.reason?.message || "翻译失败"
              : "模型未返回可用翻译结果";
            chunkFailed.push({ stationId: station.stationId, reason });
          }
        }
      }
    }

    const totalStations = batches.reduce((sum, b) => sum + b.length, 0);
    return { updates: chunkUpdates, failed: chunkFailed, chunkLength: totalStations };
  });

  // 等待所有chunk完成
  const results = await Promise.allSettled(chunkPromises);

  // 收集结果并更新进度
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const expectedChunkLength = (parallelChunks[index] || []).reduce(
      (sum, batch) => sum + batch.length,
      0,
    );

    if (signal?.aborted) {
      throw new Error("重译任务已取消");
    }

    if (result.status === "fulfilled") {
      const { updates: chunkUpdates, failed: chunkFailed, chunkLength } = result.value;
      updates.push(...chunkUpdates);
      failed.push(...chunkFailed);
      done += chunkLength;
    } else {
      done += expectedChunkLength;
    }
    done = Math.min(done, total);

    onProgress?.({
      done,
      total,
      percent: total ? (done / total) * 100 : 100,
      message: done >= total ? "翻译完成" : `已完成 ${done}/${total} 站`,
    });
  }

  const dedupedUpdates = [];
  const seen = new Set();
  for (const item of updates) {
    const nameEn = sanitizeEnglishStationName(item?.nameEn);
    if (!item?.stationId || !nameEn) continue;
    if (seen.has(item.stationId)) continue;
    seen.add(item.stationId);
    dedupedUpdates.push({ stationId: item.stationId, nameEn });
  }

  return {
    updates: dedupedUpdates,
    failed,
  };
}

/**
 * 翻译单个站名（内部调用批量翻译）
 * @param {{stationId?: string, nameZh: string, nameEn?: string, model?: string, signal?: AbortSignal, cityContext?: {name: string, nameEn?: string}}} options
 * @returns {Promise<string>} 返回英文站名
 */
export async function translateStationEnglishName({
  stationId,
  nameZh,
  nameEn,
  model,
  signal,
  cityContext,
} = {}) {
  const id = String(stationId || "single").trim();
  const result = await retranslateStationEnglishNames({
    stations: [{ stationId: id, nameZh, nameEn }],
    model,
    signal,
    cityContext,
  });

  if (result.updates.length > 0) {
    return result.updates[0].nameEn;
  }

  if (result.failed.length > 0) {
    throw new Error(result.failed[0].reason || "翻译失败");
  }

  throw new Error("未返回翻译结果");
}
