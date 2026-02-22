
import { postLLMChat } from './openrouterClient'
import { getAiConfig } from './aiConfig'
import { extractJsonObject } from './jsonUtils'

// ── 工具函数 ────────────────────────────────────────────────

function isResponseFormatError(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('response_format') || text.includes('json_schema') || text.includes('structured')
}

async function postWithFallback(payload, signal, timeoutMs) {
  try {
    return await postLLMChat(payload, signal, timeoutMs)
  } catch (error) {
    console.warn('[stationNaming] postWithFallback first attempt failed:', error?.message)
    const degraded = { ...payload }
    let changed = false
    if (degraded.thinking) {
      delete degraded.thinking
      changed = true
    }
    if (degraded.response_format && isResponseFormatError(error)) {
      delete degraded.response_format
      changed = true
    }
    if (!changed) throw error
    return postLLMChat(degraded, signal, timeoutMs)
  }
}

function extractContentText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') {
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === 'string' ? p : String(p?.text || ''))).join('')
    }
    return JSON.stringify(content)
  }
  return ''
}

function parseJsonResponse(payload) {
  const text = extractContentText(payload)
  return extractJsonObject(text)
}

// ── 翻译英文站名 ────────────────────────────────────────────

const TRANSLATION_SYSTEM_PROMPT = '将中文地铁站名翻译为英文。'

const TRANSLATION_FEW_SHOT = [
  ['创新谷', 'Innovation Valley'],
  ['大学城', 'University Town'],
  ['玉符河', 'Yufu River'],
  ['济南西站', 'Jinanxi Railway Station'],
  ['紫薇路', 'Ziwei Road'],
  ['机场南', 'Jinan International Airport South'],
  ['奥体中心', 'Olympic Sports Center'],
  ['龙奥大厦', "Long'ao Building"],
  ['济南西站西广场', 'Jinanxi Railway Station West Square'],
  ['八一立交桥', 'Bayi Interchange'],
  ['黄金产业园', 'Gold Industrial Park'],
  ['中央商务区', 'Central Business District'],
  ['齐鲁软件园', 'Qilu Software Park'],
  ['世纪大道', 'Century Avenue'],
  ['超算中心', 'Supercomputer Center'],
  ['世纪大道春喧路', 'Century Avenue · Chunxuan Road'],
  ['彩虹湖', 'Rainbow Lake'],
  ['飞跃大道东', 'Feiyue Avenue East'],
  ['济北小学', 'Jibei Primary School'],
]

function buildFewShotMessages() {
  return TRANSLATION_FEW_SHOT.flatMap(([zh, en]) => [
    { role: 'user', content: zh },
    { role: 'assistant', content: `{"nameEn":"${en}"}` },
  ])
}

const ENGLISH_NAME_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nameEn: { type: 'string', minLength: 1, maxLength: 96 },
  },
  required: ['nameEn'],
}

/** @param {{nameZh: string, model: string, signal?: AbortSignal}} options @returns {Promise<string>} */
export async function translateToEnglish({ nameZh, model, signal }) {
  const payload = {
    model,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'station_english_name', strict: true, schema: ENGLISH_NAME_RESPONSE_SCHEMA },
    },
    temperature: 0.1,
    top_p: 0.8,
    messages: [
      { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
      ...buildFewShotMessages(),
      { role: 'user', content: nameZh },
    ],
  }

  const response = await postWithFallback(payload, signal)
  const parsed = parseJsonResponse(response)
  const nameEn = String(parsed?.nameEn || '').trim()
  if (!nameEn) throw new Error('AI 未返回有效英文站名')
  return nameEn
}

/** @param {{stations: Array<{stationId: string, nameZh: string}>, model: string, signal?: AbortSignal}} options @returns {Promise<Map<string, string>>} */
export async function translateToEnglishBatch({ stations, model, signal }) {
  if (!stations || !stations.length) return new Map()

  const stationDescriptions = stations.map((item) => `【${item.stationId}】${item.nameZh}`).join('\n')

  const payload = {
    model,
    stream: false,
    temperature: 0.1,
    top_p: 0.8,
    messages: [
      { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
      ...buildFewShotMessages(),
      { role: 'user', content: `批量翻译，返回{"translations":[{"stationId":"...","nameEn":"..."},...]}：\n${stationDescriptions}` },
    ],
  }

  const response = await postWithFallback(payload, signal)
  const parsed = parseJsonResponse(response)
  const translations = Array.isArray(parsed?.translations) ? parsed.translations : []

  const enMap = new Map()
  for (const t of translations) {
    const id = String(t?.stationId || '').trim()
    if (!id) continue
    const nameEn = String(t?.nameEn || '').trim()
    if (!nameEn) continue
    enMap.set(id, nameEn)
  }

  return enMap
}

/** @param {string} [model] @returns {string} */
export function resolveTranslationModel(model) {
  return model || getAiConfig().model || ''
}
