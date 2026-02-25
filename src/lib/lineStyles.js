/** @typedef {'metro'|'commuter'|'light-rail'|'tram'} LineStyleId */

/** @type {LineStyleId} */
export const DEFAULT_LINE_STYLE = 'metro'

/** @type {{id: LineStyleId, label: string}[]} */
export const LINE_STYLE_OPTIONS = [
  { id: 'metro', label: '地铁' },
  { id: 'commuter', label: '市郊铁路' },
  { id: 'light-rail', label: '轻轨' },
  { id: 'tram', label: '有轨电车' },
]

const lineStyleById = new Map(LINE_STYLE_OPTIONS.map((item) => [item.id, item]))

/** @param {string} value @returns {boolean} */
export function isLineStyle(value) {
  return lineStyleById.has(String(value || ''))
}

/** @param {string} value @returns {LineStyleId} */
export function normalizeLineStyle(value) {
  const normalized = String(value || '')
  if (isLineStyle(normalized)) return normalized
  // 旧数据迁移：无语义化线形降级到最接近的制式
  if (normalized === 'double-solid' || normalized === 'double-dashed' || normalized === 'double-dotted-square') return 'commuter'
  if (normalized === 'dashed' || normalized === 'dotted') return 'metro'
  return DEFAULT_LINE_STYLE
}

/**
 * @param {string} styleId
 * @returns {{dasharray: string, lineCap: string, trackOffsets: number[], trackWidthScale: number, trackDasharrays?: string[]}}
 * trackDasharrays: per-track dasharray overrides (same length as trackOffsets); if absent, all tracks use dasharray
 */
export function getLineStyleSchematic(styleId) {
  switch (normalizeLineStyle(styleId)) {
    case 'metro':
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [0],
        trackWidthScale: 1,
      }
    case 'commuter':
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [-4.2, 4.2],
        trackWidthScale: 0.38,
      }
    case 'light-rail':
    case 'tram':
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [-3.6, 0, 3.6],
        trackWidthScale: 0.38,
        trackDasharrays: ['', '8 6', ''],
      }
    default:
      return {
        dasharray: '',
        lineCap: 'round',
        trackOffsets: [0],
        trackWidthScale: 1,
      }
  }
}

/** @param {string} styleId @returns {{dasharray: number[], lineCap: string, lineWidth: number, lineGapWidth: number}} */
export function getLineStyleMap(styleId) {
  switch (normalizeLineStyle(styleId)) {
    case 'metro':
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 5,
        lineGapWidth: 0,
      }
    case 'commuter':
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 2.0,
        lineGapWidth: 5.0,
      }
    case 'light-rail':
    case 'tram':
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 1.8,
        lineGapWidth: 3.6,
      }
    default:
      return {
        dasharray: [1, 0],
        lineCap: 'round',
        lineWidth: 5,
        lineGapWidth: 0,
      }
  }
}
