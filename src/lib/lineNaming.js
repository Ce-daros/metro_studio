const LOOP_HINT_ZH = /环(?:线)?/u
const LOOP_HINT_EN = /\b(?:loop|circle)\b/i

const ZH_SUFFIX_PATTERNS = [
  /\s*[（(【\[][^）)】\]]*(?:[-—–~～→↔⇄⟷]|至|到)[^）)】\]]*[）)】\]]\s*$/u,
  /\s*[-—–~～→↔⇄⟷]\s*.+$/u,
  /\s*(?:至|到)\s*.+$/u,
]
const EN_SUFFIX_PATTERNS = [
  /\s*[（(【\[][^）)】\]]*(?:[-—–~～→↔⇄⟷]|\bto\b)[^）)】\]]*[）)】\]]\s*$/iu,
  /\s*[-—–~～→↔⇄⟷]\s*.+$/u,
  /\s+\bto\b\s+.+$/iu,
]

const TRAILING_PUNCTUATION = /[\s:：;；,，|/]+$/u

function cleanInput(value) {
  return String(value || '').trim()
}

export function stripLoopTerminusSuffix(name, isZh = true) {
  const raw = cleanInput(name)
  if (!raw) return raw

  const loopHint = isZh ? LOOP_HINT_ZH : LOOP_HINT_EN
  if (!loopHint.test(raw)) {
    return raw
  }

  const suffixPatterns = isZh ? ZH_SUFFIX_PATTERNS : EN_SUFFIX_PATTERNS
  for (const pattern of suffixPatterns) {
    if (!pattern.test(raw)) continue
    const stripped = raw.replace(pattern, '').replace(TRAILING_PUNCTUATION, '').trim()
    if (stripped && loopHint.test(stripped)) {
      return stripped
    }
  }

  return raw
}

export function normalizeLineNamesForLoop({ nameZh, nameEn, isLoop }) {
  const nextNameZh = cleanInput(nameZh)
  const nextNameEn = cleanInput(nameEn)
  if (!isLoop) {
    return {
      nameZh: nextNameZh,
      nameEn: nextNameEn,
    }
  }
  return {
    nameZh: stripLoopTerminusSuffix(nextNameZh, true),
    nameEn: stripLoopTerminusSuffix(nextNameEn, false),
  }
}

export function getDisplayLineName(line, locale = 'zh') {
  if (!line) return ''
  const raw = locale === 'en' ? cleanInput(line.nameEn) : cleanInput(line.nameZh)
  if (!raw) return ''
  const zhName = cleanInput(line.nameZh)
  const enName = cleanInput(line.nameEn)
  const isLoopByName = /环/u.test(zhName) || /\b(?:loop|circle)\b/i.test(enName)
  if (!isLoopByName) return raw
  return stripLoopTerminusSuffix(raw, locale !== 'en')
}
