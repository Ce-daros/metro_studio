/**
 * Safely parse a JSON string, returning null on failure.
 */
export function safeJsonParse(text) {
  if (typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * 清理常见的 JSON 格式问题
 */
function cleanJsonText(text) {
  return text
    .replace(/,\s*([}\]])/g, '$1')       // 尾部逗号
    .replace(/'/g, '"')                    // 单引号→双引号
    .replace(/\/\/[^\n]*/g, '')            // 单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '')      // 多行注释
}

/**
 * 从 markdown code block 中提取内容
 */
function extractFromCodeBlock(text) {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  return match ? match[1].trim() : null
}

/**
 * 尝试找到最外层的 { } 配对并解析
 */
function extractBracePair(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

/**
 * 多层兜底提取 JSON 对象
 * 第 1 层：直接 parse
 * 第 2 层：提取 code block 后 parse
 * 第 3 层：找 { } 配对后 parse
 * 第 4 层：清理常见格式问题后重试 2/3 层
 * 第 5 层：正则逐字段提取
 */
export function extractJsonObject(text) {
  if (typeof text !== 'string' || !text.trim()) return null

  // 第 1 层：直接 parse
  const direct = safeJsonParse(text)
  if (direct && typeof direct === 'object') return direct

  // 第 2 层：code block
  const codeBlock = extractFromCodeBlock(text)
  if (codeBlock) {
    const parsed = safeJsonParse(codeBlock)
    if (parsed && typeof parsed === 'object') return parsed
  }

  // 第 3 层：{ } 配对
  const braceText = extractBracePair(text)
  if (braceText) {
    const parsed = safeJsonParse(braceText)
    if (parsed && typeof parsed === 'object') return parsed
  }

  // 第 4 层：清理后重试
  const cleaned = cleanJsonText(codeBlock || braceText || text)
  const cleanBrace = extractBracePair(cleaned)
  if (cleanBrace) {
    const parsed = safeJsonParse(cleanBrace)
    if (parsed && typeof parsed === 'object') return parsed
  }

  // 第 5 层：正则兜底
  return null
}
