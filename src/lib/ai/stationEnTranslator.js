import { postLLMChat } from "./openrouterClient";
import { getAiConfig } from "./aiConfig";
import { extractJsonObject } from "./jsonUtils";
import { toFiniteNumber } from "../async/utils";

const TRANSLATION_BATCH_SIZE = 30;

// Few-shot 示例：中文站名 → 英文站名
const TRANSLATION_FEW_SHOT_EXAMPLES = [
  ["创新谷", "Innovation Valley"],
  ["大学城", "University Town"],
  ["玉符河", "Yufu River"],
  ["济南西站", "Jinanxi Railway Station"],
  ["济南站", "Jinan Railway Station"],
  ["长途汽车站", "Long-distance Bus Station"],
  ["紫薇路", "Ziwei Road"],
  ["遥墙机场南", "Jinan International Airport South"],
  ["奥体中心", "Olympic Sports Center"],
  ["龙奥大厦", "Long'ao Building"],
  ["济南西站西广场", "Jinanxi Railway Station West Square"],
  ["八一立交桥", "Bayi Interchange"],
  ["黄金产业园", "Gold Industrial Park"],
  ["玉函小区", "Yuhanxiaoqu"],
  ["齐鲁软件园", "Qilu Software Park"],
  ["世纪大道", "Century Avenue"],
  ["超算中心", "Supercomputer Center"],
  ["世纪大道春喧路", "Century Avenue · Chunxuan Road"],
  ["彩虹湖", "Rainbow Lake"],
  ["飞跃大道东", "Feiyue Avenue East"],
  ["济北小学", "Jibei Primary School"],
  ["杆石桥", "Ganshiqiao"],
];

const STATION_TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 0,
      maxItems: TRANSLATION_BATCH_SIZE,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stationId: { type: "string", minLength: 1, maxLength: 64 },
          nameEn: { type: "string", minLength: 1, maxLength: 96 },
        },
        required: ["stationId", "nameEn"],
      },
    },
  },
  required: ["items"],
};

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

function extractItemsFromChatResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (content && typeof content === "object") {
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => {
          if (typeof part === "string") return part;
          return String(part?.text || "");
        })
        .join("");
      const parsed = extractJsonObject(joined);
      return parsed && Array.isArray(parsed.items) ? parsed.items : [];
    }
    return Array.isArray(content.items) ? content.items : [];
  }
  if (typeof content === "string") {
    const parsed = extractJsonObject(content);
    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  }
  return [];
}

function normalizeTranslationItems(rawItems, stationMap) {
  const updates = [];
  const seen = new Set();

  for (const item of rawItems || []) {
    const stationId = String(item?.stationId || "").trim();
    if (!stationId || seen.has(stationId)) continue;
    const station = stationMap.get(stationId);
    if (!station) continue;

    const nameEn = sanitizeEnglishStationName(item?.nameEn);
    if (!nameEn) continue;

    seen.add(stationId);
    updates.push({ stationId, nameEn });
  }

  return updates;
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

async function translateStationChunk(chunk, model, signal) {
  const fewShotExamples = TRANSLATION_FEW_SHOT_EXAMPLES.map(
    ([zh, en]) => `  ${zh} → ${en}`
  ).join("\n");

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
    "# 参考示例",
    fewShotExamples,
    "",
    "# 输出要求",
    "- 仅输出 JSON 格式",
    "- 仅返回输入的 stationId，不得添加或删除",
    "- 所有输出必须可直接用于站名标签",
    "",
    "# 禁止事项",
    "- 不得凭空添加不在中文名中的地名",
    "- 不得对公共机构名称整词音译（必须意译通名）",
    "- 不得使用生僻缩写或不规范拼写",
  ].join("\n");

  const payload = {
    model,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "station_translation_batch",
        strict: true,
        schema: STATION_TRANSLATION_SCHEMA,
      },
    },
    temperature: 0,
    top_p: 0.8,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "将输入列表中的中文站名翻译为符合规范的英文站名。",
            output: "返回 { items: [{ stationId, nameEn }] }",
            stations: chunk.map((item) => ({
              stationId: item.stationId,
              nameZh: item.nameZh, // 保留完整站名，让 AI 判断是否是火车站
            })),
          },
          null,
          2,
        ),
      },
    ],
  };

  const response = await postLLMChatWithFallback(payload, signal);
  const stationMap = new Map(
    chunk.map((station) => [station.stationId, station]),
  );
  const modelItems = normalizeTranslationItems(
    extractItemsFromChatResponse(response),
    stationMap,
  );
  const translatedIdSet = new Set(modelItems.map((item) => item.stationId));

  const fallbackItems = chunk
    .filter((station) => !translatedIdSet.has(station.stationId))
    .map((station) => ({
      stationId: station.stationId,
      nameEn: fallbackNameEn(station.nameZh, station.previousNameEn),
    }))
    .filter((item) => item.nameEn);

  return [...modelItems, ...fallbackItems];
}

/** @param {{stations?: Array<{id?: string, stationId?: string, nameZh: string, nameEn?: string}>, model?: string, signal?: AbortSignal, onProgress?: function}} options @returns {Promise<{updates: Array<{stationId: string, nameEn: string}>, failed: Array<{stationId: string, reason: string}>}>} */
export async function retranslateStationEnglishNames({
  stations,
  model,
  signal,
  onProgress,
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
    throw new Error('请先在「设置 → AI 配置」中填写模型名称');
  }

  const updates = [];
  const failed = [];
  const chunks = chunkArray(normalizedStations, TRANSLATION_BATCH_SIZE);

  let done = 0;
  onProgress?.({ done, total, percent: 0, message: "准备翻译任务..." });

  // 并行处理所有chunk
  const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
    if (signal?.aborted) {
      throw new Error("重译任务已取消");
    }

    try {
      const chunkUpdates = await translateStationChunk(chunk, resolvedModel, signal);
      const foundIds = new Set(chunkUpdates.map((item) => item.stationId));

      const chunkFailed = [];
      for (const station of chunk) {
        if (!foundIds.has(station.stationId)) {
          chunkFailed.push({
            stationId: station.stationId,
            reason: "模型未返回可用翻译结果",
          });
        }
      }

      return { success: true, updates: chunkUpdates, failed: chunkFailed, chunk };
    } catch (error) {
      const chunkUpdates = [];
      const chunkFailed = [];

      for (const station of chunk) {
        const fallback = fallbackNameEn(station.nameZh, station.previousNameEn);
        if (fallback) {
          chunkUpdates.push({ stationId: station.stationId, nameEn: fallback });
        } else {
          chunkFailed.push({
            stationId: station.stationId,
            reason: String(error?.message || "翻译失败"),
          });
        }
      }

      return { success: false, updates: chunkUpdates, failed: chunkFailed, chunk };
    }
  });

  // 等待所有chunk完成
  const results = await Promise.allSettled(chunkPromises);

  // 收集结果并更新进度
  for (const result of results) {
    if (signal?.aborted) {
      throw new Error("重译任务已取消");
    }

    if (result.status === 'fulfilled') {
      const { updates: chunkUpdates, failed: chunkFailed, chunk } = result.value;
      updates.push(...chunkUpdates);
      failed.push(...chunkFailed);
      done += chunk.length;
    } else {
      // Promise被reject的情况(不应该发生,因为我们在内部catch了)
      // 但为了安全起见还是处理一下
      done += TRANSLATION_BATCH_SIZE;
    }

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
 * @param {{stationId?: string, nameZh: string, nameEn?: string, model?: string, signal?: AbortSignal}} options
 * @returns {Promise<string>} 返回英文站名
 */
export async function translateStationEnglishName({
  stationId,
  nameZh,
  nameEn,
  model,
  signal,
} = {}) {
  const id = String(stationId || "single").trim();
  const result = await retranslateStationEnglishNames({
    stations: [{ stationId: id, nameZh, nameEn }],
    model,
    signal,
  });

  if (result.updates.length > 0) {
    return result.updates[0].nameEn;
  }

  if (result.failed.length > 0) {
    throw new Error(result.failed[0].reason || "翻译失败");
  }

  throw new Error("未返回翻译结果");
}
