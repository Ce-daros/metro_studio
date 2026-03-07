import { createId } from '../ids'

const PRESET_FILE_VERSION = '1.0.0'
const PRESET_FILE_EXTENSION = '.layout-preset.json'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function cloneDisplayConfig(displayConfig = {}) {
  return {
    showStationNumbers: Boolean(displayConfig.showStationNumbers),
    showInterchangeMarkers: displayConfig.showInterchangeMarkers ?? true,
    stationIconSize: clamp(Number(displayConfig.stationIconSize ?? 1), 0.5, 2),
    stationIconStyle: ['circle', 'square'].includes(displayConfig.stationIconStyle) ? displayConfig.stationIconStyle : 'circle',
    showLineBadges: displayConfig.showLineBadges ?? true,
    edgeWidthScale: clamp(Number(displayConfig.edgeWidthScale ?? 1), 0.5, 2),
    edgeOpacity: clamp(Number(displayConfig.edgeOpacity ?? 1), 0.3, 1),
    cornerRadius: clamp(Number(displayConfig.cornerRadius ?? 10), 0, 30),
  }
}

function cloneParamReduction(paramReduction = {}) {
  return {
    enabled: Boolean(paramReduction.enabled),
    deltas: Array.isArray(paramReduction.deltas)
      ? paramReduction.deltas
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
          .map((value) => clamp(value, -3, 3))
      : [],
  }
}

function normalizeLayoutPreset(rawPreset, index = 0) {
  if (!rawPreset || typeof rawPreset !== 'object') return null
  const name = String(rawPreset.name || '').trim() || `参数预设 ${index + 1}`
  return {
    id: String(rawPreset.id || createId('layout_preset')),
    name,
    geoSeedScale: clamp(Number(rawPreset.geoSeedScale ?? 6), 0.1, 16),
    displayConfig: cloneDisplayConfig(rawPreset.displayConfig),
    paramReduction: cloneParamReduction(rawPreset.paramReduction),
  }
}

function cloneLayoutConfigForPreset(layoutConfig = {}) {
  return {
    geoSeedScale: clamp(Number(layoutConfig.geoSeedScale ?? 6), 0.1, 16),
    displayConfig: cloneDisplayConfig(layoutConfig.displayConfig),
    paramReduction: cloneParamReduction(layoutConfig.paramReduction),
  }
}

function createLayoutPresetFromConfig(layoutConfig, name, existingId = null) {
  return {
    id: String(existingId || createId('layout_preset')),
    name: String(name || '未命名预设').trim() || '未命名预设',
    ...cloneLayoutConfigForPreset(layoutConfig),
  }
}

function applyLayoutPresetToConfig(layoutConfig, preset) {
  const normalizedPreset = normalizeLayoutPreset(preset)
  if (!normalizedPreset) return layoutConfig
  return {
    ...layoutConfig,
    geoSeedScale: normalizedPreset.geoSeedScale,
    displayConfig: cloneDisplayConfig(normalizedPreset.displayConfig),
    paramReduction: cloneParamReduction(normalizedPreset.paramReduction),
  }
}

function buildLayoutPresetFileName(presetName) {
  const safeName = String(presetName || 'layout-preset').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'layout-preset'
  return `${safeName}${PRESET_FILE_EXTENSION}`
}

function serializeLayoutPreset(preset) {
  const normalizedPreset = normalizeLayoutPreset(preset)
  if (!normalizedPreset) {
    throw new Error('预设格式不正确')
  }
  return JSON.stringify(
    {
      type: 'railmap-layout-preset',
      version: PRESET_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      preset: normalizedPreset,
    },
    null,
    2,
  )
}

async function parseLayoutPresetFile(file) {
  const text = await file.text()
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || raw.type !== 'railmap-layout-preset') {
    throw new Error('不是有效的排版预设文件')
  }
  const preset = normalizeLayoutPreset(raw.preset)
  if (!preset) {
    throw new Error('预设内容无效')
  }
  return preset
}

export {
  applyLayoutPresetToConfig,
  buildLayoutPresetFileName,
  cloneLayoutConfigForPreset,
  createLayoutPresetFromConfig,
  normalizeLayoutPreset,
  parseLayoutPresetFile,
  serializeLayoutPreset,
}
