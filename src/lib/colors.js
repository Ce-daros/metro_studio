const DEFAULT_COLORS = [
  '#005BBB',
  '#D7263D',
  '#1D8348',
  '#F39C12',
  '#6C3483',
  '#0E7490',
  '#C0392B',
  '#2E86C1',
  '#16A085',
  '#2C3E50',
]

const TARGET_PALETTE_SIZE = 64
const PALETTE_LIGHTNESS_LEVELS = [0.5, 0.56, 0.62, 0.68, 0.74]
const PALETTE_CHROMA_LEVELS = [0.1, 0.14, 0.18, 0.22]
const PALETTE_HUE_STEP = 6
const WHITE_LUMINANCE = 1
const DARK_CANVAS_LUMINANCE = relativeLuminance({ r: 14, g: 23, b: 38 })

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, '')
  if (!normalized) return null
  const value = normalized.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const rr = clamp(Math.round(r), 0, 255)
  const gg = clamp(Math.round(g), 0, 255)
  const bb = clamp(Math.round(b), 0, 255)
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`.toUpperCase()
}

function srgbToLinear(channel) {
  const normalized = clamp(channel / 255, 0, 1)
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel) {
  const normalized = clamp(channel, 0, 1)
  return normalized <= 0.0031308
    ? normalized * 12.92 * 255
    : (1.055 * (normalized ** (1 / 2.4)) - 0.055) * 255
}

function rgbToOklab({ r, g, b }) {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl

  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  }
}

function oklabToRgb({ l, a, b }) {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b

  const ll = lRoot ** 3
  const mm = mRoot ** 3
  const ss = sRoot ** 3

  const r = +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss
  const g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss
  const blue = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss

  return {
    r: linearToSrgb(r),
    g: linearToSrgb(g),
    b: linearToSrgb(blue),
  }
}

function oklchToOklab({ l, c, h }) {
  const hue = ((h % 360) + 360) % 360
  const radians = (hue * Math.PI) / 180
  return {
    l,
    a: c * Math.cos(radians),
    b: c * Math.sin(radians),
  }
}

function oklchToRgb(color) {
  return oklabToRgb(oklchToOklab(color))
}

function isDisplayableRgb({ r, g, b }) {
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
    && r >= 0 && r <= 255
    && g >= 0 && g <= 255
    && b >= 0 && b <= 255
}

function relativeLuminance({ r, g, b }) {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

function contrastRatio(a, b) {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function oklabDistance(a, b) {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function hueDistance(a, b) {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180)
  return Math.min(delta, 180)
}

function createCandidateFromHex(hex, source = 'seed') {
  const normalized = normalizeHexColor(hex, '')
  if (!normalized) return null
  const rgb = hexToRgb(normalized)
  if (!rgb) return null
  const lab = rgbToOklab(rgb)
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
  const hue = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360
  return {
    hex: normalized,
    rgb,
    lab,
    l: lab.l,
    c: chroma,
    h: hue,
    source,
  }
}

function createCandidateFromOklch(l, c, h) {
  const rgb = oklchToRgb({ l, c, h })
  if (!isDisplayableRgb(rgb)) return null
  const luminance = relativeLuminance(rgb)
  if (contrastRatio(luminance, WHITE_LUMINANCE) < 1.55) return null
  if (contrastRatio(luminance, DARK_CANVAS_LUMINANCE) < 1.45) return null
  return createCandidateFromHex(rgbToHex(rgb), 'generated')
}

function buildCandidatePool() {
  const candidates = []
  const seen = new Set()

  function addCandidate(candidate) {
    if (!candidate || seen.has(candidate.hex)) return
    seen.add(candidate.hex)
    candidates.push(candidate)
  }

  DEFAULT_COLORS.forEach((color) => addCandidate(createCandidateFromHex(color)))

  for (let hue = 0; hue < 360; hue += PALETTE_HUE_STEP) {
    for (const lightness of PALETTE_LIGHTNESS_LEVELS) {
      for (const chroma of PALETTE_CHROMA_LEVELS) {
        addCandidate(createCandidateFromOklch(lightness, chroma, hue))
      }
    }
  }

  return candidates
}

function scoreCandidate(candidate, existingCandidates, seedIndex = 0) {
  if (!existingCandidates.length) {
    const hueSeed = (seedIndex * 137.508) % 360
    return 10 + hueDistance(candidate.h, hueSeed) / 180 + candidate.c * 0.1
  }

  let minPerceptualDistance = Number.POSITIVE_INFINITY
  let minHueGap = Number.POSITIVE_INFINITY
  let minLightnessGap = Number.POSITIVE_INFINITY
  let minChromaGap = Number.POSITIVE_INFINITY

  for (const existing of existingCandidates) {
    minPerceptualDistance = Math.min(minPerceptualDistance, oklabDistance(candidate.lab, existing.lab))
    minHueGap = Math.min(minHueGap, hueDistance(candidate.h, existing.h))
    minLightnessGap = Math.min(minLightnessGap, Math.abs(candidate.l - existing.l))
    minChromaGap = Math.min(minChromaGap, Math.abs(candidate.c - existing.c))
  }

  const seedHue = (seedIndex * 137.508) % 360
  const seedHueBonus = hueDistance(candidate.h, seedHue) / 180

  return minPerceptualDistance * 100
    + minHueGap * 0.35
    + minLightnessGap * 18
    + minChromaGap * 8
    + seedHueBonus
}

function buildExtendedPalette(size = TARGET_PALETTE_SIZE) {
  const pool = buildCandidatePool()
  const poolByHex = new Map(pool.map((candidate) => [candidate.hex, candidate]))
  const palette = []
  const selected = []
  const selectedHex = new Set()

  function select(hex) {
    const candidate = poolByHex.get(normalizeHexColor(hex, ''))
    if (!candidate || selectedHex.has(candidate.hex)) return
    selectedHex.add(candidate.hex)
    selected.push(candidate)
    palette.push(candidate.hex)
  }

  select(DEFAULT_COLORS[0])

  while (palette.length < size) {
    let bestCandidate = null
    let bestScore = -1

    for (const candidate of pool) {
      if (selectedHex.has(candidate.hex)) continue
      const score = scoreCandidate(candidate, selected, palette.length)
      if (score > bestScore) {
        bestScore = score
        bestCandidate = candidate
      }
    }

    if (!bestCandidate) break
    selectedHex.add(bestCandidate.hex)
    selected.push(bestCandidate)
    palette.push(bestCandidate.hex)
  }

  return { palette, pool }
}

const { palette: EXTENDED_PALETTE, pool: COLOR_CANDIDATES } = buildExtendedPalette()

/** @param {string} value @param {string} [fallback='#005BBB'] @returns {string} */
export function normalizeHexColor(value, fallback = '#005BBB') {
  if (!value || typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  const match = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) {
    return fallback
  }
  if (hex.length === 4) {
    const [, shortHex] = match
    return `#${shortHex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toUpperCase()}`
  }
  return hex.toUpperCase()
}

/** @param {number} [index=0] @returns {string} */
export function pickLineColor(index = 0) {
  return EXTENDED_PALETTE[index % EXTENDED_PALETTE.length] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
}

/** @param {string[]} [existingColors=[]] @param {number} [seedIndex=0] @returns {string} */
export function pickDistinctLineColor(existingColors = [], seedIndex = 0) {
  const normalizedExisting = [...new Set((existingColors || [])
    .map((color) => normalizeHexColor(color, ''))
    .filter(Boolean))]

  if (!normalizedExisting.length) {
    return pickLineColor(seedIndex)
  }

  const existingCandidates = normalizedExisting.map((color) => createCandidateFromHex(color)).filter(Boolean)
  if (!existingCandidates.length) {
    return pickLineColor(seedIndex)
  }

  let bestColor = pickLineColor(seedIndex)
  let bestScore = -1

  for (const candidate of COLOR_CANDIDATES) {
    if (normalizedExisting.includes(candidate.hex)) continue
    const score = scoreCandidate(candidate, existingCandidates, seedIndex)
    if (score > bestScore) {
      bestScore = score
      bestColor = candidate.hex
    }
  }

  return normalizeHexColor(bestColor, pickLineColor(seedIndex))
}
