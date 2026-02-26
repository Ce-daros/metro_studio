const AI_CONFIG_STORAGE_KEY = 'metro_studio_ai_config'

const DEFAULT_CONFIG = {
  baseUrl: import.meta.env.VITE_BLTCY_API_BASE || 'https://api.bltcy.ai',
  apiKey: '',
  model: '',
}

function normalizeBaseUrl(url) {
  const trimmed = String(url || '').trim()
  if (!trimmed) return DEFAULT_CONFIG.baseUrl
  return trimmed.replace(/\/+$/, '')
}

function normalizeApiKey(key) {
  return String(key || '').trim()
}

export function getAiConfig() {
  try {
    const saved = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        baseUrl: normalizeBaseUrl(parsed.baseUrl),
        apiKey: normalizeApiKey(parsed.apiKey),
        model: String(parsed.model || '').trim(),
      }
    }
  } catch {
  }
  return {
    baseUrl: DEFAULT_CONFIG.baseUrl,
    apiKey: '',
    model: '',
  }
}

export function setAiConfig({ baseUrl, apiKey, model }) {
  try {
    const config = {
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKey: normalizeApiKey(apiKey),
      model: String(model || '').trim(),
    }
    window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}

export function clearAiConfig() {
  try {
    window.localStorage.removeItem(AI_CONFIG_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function hasAiConfig() {
  const config = getAiConfig()
  return Boolean(config.apiKey)
}

export async function testAiConnection() {
  const config = getAiConfig()
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先填写 API Base URL、API Key 和模型名称')
  }

  const endpoint = `${config.baseUrl}/chat/completions`

  const payload = {
    model: config.model,
    messages: [{ role: 'user', content: 'Hello' }],
    stream: false,
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    let errorInfo = `HTTP ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json.error?.message) {
        errorInfo = json.error.message
      }
    } catch {
    }
    throw new Error(`连接测试失败: ${errorInfo}`)
  }

  const json = await response.json()
  if (!json.choices?.[0]?.message?.content) {
    throw new Error('API 返回了无效响应')
  }

  return true
}

export { AI_CONFIG_STORAGE_KEY }
