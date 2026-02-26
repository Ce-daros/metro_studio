<script setup>
import { computed, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { collectProjectBounds } from './map-editor/dataBuilders'
import { TILE_SOURCES } from './map-editor/mapStyle'

const store = useProjectStore()

const MIN_EXPORT_EDGE = 2048
const MAX_EXPORT_EDGE = 16384

const BASEMAP_LABELS = {
  osm: 'OpenStreetMap 标准',
  satellite: 'Esri 卫星影像',
  topo: 'OpenTopo 地形图',
  positron: 'CARTO Positron 浅色',
  dark: 'CARTO Dark 深色',
  voyager: 'CARTO Voyager 彩色',
  esriWorldStreet: 'Esri World Street',
  esriWorldTopo: 'Esri World Topo',
  wikimedia: 'Wikimedia 地图',
}

const basemapOptions = computed(() =>
  Object.keys(TILE_SOURCES).map((key) => ({
    value: key,
    label: BASEMAP_LABELS[key] || key,
  })),
)

const visible = computed(() => store.actualRouteExportDialogVisible)
const isExporting = computed(() => store.isActualRouteExporting)
const exportProgress = computed(() => store.actualRouteExportProgress || null)
const exportPercent = computed(() => {
  const p = Number(exportProgress.value?.percent)
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(100, Math.round(p)))
})
const exportEtaText = computed(() => {
  const eta = Number(exportProgress.value?.etaSeconds)
  if (!Number.isFinite(eta) || eta <= 0) return ''
  if (eta < 60) return `预计剩余 ${eta} 秒`
  const min = Math.floor(eta / 60)
  const sec = eta % 60
  return `预计剩余 ${min} 分 ${sec} 秒`
})
const exportSummaryText = computed(() => {
  const progress = exportProgress.value
  if (!progress) return ''
  const done = Number(progress.done) || 0
  const total = Number(progress.total) || 0
  const workerCount = Number(progress.workerCount) || 1
  const doneText = total > 0 ? `分块 ${done}/${total}` : '准备中'
  return `${doneText} · 并行 ${workerCount} 路`
})

const resolutionPreset = ref(String(store.actualRouteExportResolutionPreset || 4096))
const basemap = ref('dark')

function clampResolution(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return MIN_EXPORT_EDGE
  return Math.max(MIN_EXPORT_EDGE, Math.min(MAX_EXPORT_EDGE, Math.round(numeric)))
}

function roundResolution(value) {
  return Math.round(clampResolution(value) / 256) * 256
}

function estimateReadableMinResolution(project) {
  if (!project) return 4096
  const stations = Array.isArray(project.stations) ? project.stations : []
  const lines = Array.isArray(project.lines) ? project.lines : []
  const bounds = collectProjectBounds(project)

  let score = 2800
  const stationCount = stations.length
  const interchangeCount = stations.filter((station) => station?.isInterchange).length
  const maxNameLength = stations.reduce((maxLength, station) => {
    const zhLength = String(station?.nameZh || '').trim().length
    const enLength = String(station?.nameEn || '').trim().length
    return Math.max(maxLength, zhLength, enLength)
  }, 0)

  score += stationCount * 16
  score += interchangeCount * 48
  score += lines.length * 80
  score += maxNameLength * 120

  if (bounds) {
    const lngSpan = Math.max(0.01, Math.abs(bounds.maxLng - bounds.minLng))
    const latSpan = Math.max(0.01, Math.abs(bounds.maxLat - bounds.minLat))
    const area = lngSpan * latSpan
    const density = stationCount / Math.max(0.02, area)
    score += Math.min(4200, density * 95)
  }

  return roundResolution(score * 1.24)
}

function buildResolutionOptions(minReadableResolution) {
  const factors = [1, 1.35, 1.75, 2.2]
  const labels = ['估算最小（推荐）', '增强清晰', '高清', '超清']
  const values = []

  for (let i = 0; i < factors.length; i += 1) {
    const value = roundResolution(minReadableResolution * factors[i])
    if (values.length === 0 || value > values[values.length - 1]) values.push(value)
  }

  if (values.length < 3) {
    const fallback = [
      minReadableResolution,
      roundResolution(minReadableResolution * 1.5),
      roundResolution(minReadableResolution * 2),
    ]
    for (const value of fallback) {
      if (!values.includes(value)) values.push(value)
    }
  }

  return values.slice(0, 4).map((value, index) => ({
    value: String(value),
    px: value,
    label: `${labels[index] || `档位 ${index + 1}`}（长边 ${value} 像素）`,
  }))
}

function normalizeResolutionSelection(value, options) {
  const numeric = clampResolution(value)
  if (!options.length) return String(4096)
  let candidate = options[0]
  for (const option of options) {
    if (option.px >= numeric) {
      candidate = option
      break
    }
    candidate = option
  }
  return candidate.value
}

const estimatedMinResolution = computed(() => estimateReadableMinResolution(store.project))

const resolutionOptions = computed(() => buildResolutionOptions(estimatedMinResolution.value))

const stationVisibilityMode = computed({
  get: () => store.exportStationVisibilityMode || 'all',
  set: (value) => store.setExportStationVisibilityMode(value),
})

watch(
  visible,
  (nextVisible) => {
    if (!nextVisible) return
    resolutionPreset.value = normalizeResolutionSelection(store.actualRouteExportResolutionPreset, resolutionOptions.value)
    basemap.value = store.actualRouteExportBasemap || store.mapTileType || 'dark'
  },
  { immediate: true },
)

function closeDialog() {
  if (isExporting.value) return
  store.closeActualRouteExportDialog()
}

async function startExport() {
  if (!store.project || isExporting.value) return
  store.setActualRouteExportResolutionPreset(Number(resolutionPreset.value))
  store.setActualRouteExportBasemap(basemap.value)
  try {
    await store.exportActualRouteHighResPng()
    store.closeActualRouteExportDialog()
  } catch {
  }
}
</script>

<template>
  <NModal
    :show="visible"
    preset="card"
    title="导出大图"
    style="width: 560px; max-width: calc(100vw - 32px)"
    @close="closeDialog"
    @mask-click="closeDialog"
  >
    <div class="export-route-dialog">
      <label class="export-route-dialog__label" for="actual-route-resolution">导出分辨率（高清）</label>
      <select id="actual-route-resolution" v-model="resolutionPreset" class="export-route-dialog__input" :disabled="isExporting">
        <option v-for="item in resolutionOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>

      <label class="export-route-dialog__label" for="actual-route-basemap">底图</label>
      <select id="actual-route-basemap" v-model="basemap" class="export-route-dialog__input" :disabled="isExporting">
        <option v-for="item in basemapOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>

      <label class="export-route-dialog__label" for="actual-route-station-mode">站点显示</label>
      <select id="actual-route-station-mode" v-model="stationVisibilityMode" class="export-route-dialog__input" :disabled="isExporting">
        <option value="interchange">仅显示换乘站</option>
        <option value="none">隐藏所有站点</option>
        <option value="all">显示所有站点</option>
      </select>

      <p class="export-route-dialog__hint">
        已根据当前线网估算可读字最小分辨率：长边 {{ estimatedMinResolution }} 像素（含保守冗余），适合打印与细节检查。
      </p>

      <div v-if="isExporting || exportProgress?.active" class="export-route-dialog__progress-wrap">
        <div class="export-route-dialog__progress-head">
          <span class="export-route-dialog__progress-title">{{ exportProgress?.message || '正在导出' }}</span>
          <span class="export-route-dialog__progress-percent">{{ exportPercent }}%</span>
        </div>
        <div class="export-route-dialog__progress-track">
          <div class="export-route-dialog__progress-fill" :style="{ width: `${exportPercent}%` }" />
        </div>
        <div class="export-route-dialog__progress-meta">
          <span>{{ exportSummaryText }}</span>
          <span v-if="exportEtaText">{{ exportEtaText }}</span>
        </div>
      </div>

      <div class="export-route-dialog__actions">
        <button class="export-route-dialog__btn" type="button" :disabled="isExporting" @click="closeDialog">取消</button>
        <button
          class="export-route-dialog__btn export-route-dialog__btn--primary"
          type="button"
          :disabled="isExporting"
          @click="startExport"
        >
          {{ isExporting ? '导出中…' : '开始导出高清图' }}
        </button>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.export-route-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-route-dialog__label {
  font-size: 12px;
  color: var(--ark-text-dim, #c3a0ff);
  font-weight: 600;
}

.export-route-dialog__input {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(188, 31, 255, 0.35);
  background: rgba(15, 10, 28, 0.85);
  color: #f3e9ff;
  padding: 8px 10px;
  font-size: 13px;
}

.export-route-dialog__input:focus {
  outline: none;
  border-color: rgba(249, 0, 191, 0.9);
}

.export-route-dialog__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: #c9a8ef;
  line-height: 1.5;
}

.export-route-dialog__actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.export-route-dialog__progress-wrap {
  margin-top: 2px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(188, 31, 255, 0.3);
  background: rgba(20, 8, 28, 0.7);
}

.export-route-dialog__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.export-route-dialog__progress-title {
  color: #f1ddff;
  font-size: 12px;
}

.export-route-dialog__progress-percent {
  color: #ffa3ef;
  font-size: 12px;
  font-weight: 700;
}

.export-route-dialog__progress-track {
  margin-top: 6px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(188, 31, 255, 0.18);
}

.export-route-dialog__progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ark-purple, #bc1fff), var(--ark-pink, #f900bf));
  box-shadow: 0 0 10px rgba(249, 0, 191, 0.45);
  transition: width 0.18s ease;
}

.export-route-dialog__progress-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #c6a4eb;
  font-size: 11px;
}

.export-route-dialog__btn {
  border: 1px solid rgba(188, 31, 255, 0.35);
  background: rgba(25, 12, 39, 0.84);
  color: #f3e9ff;
  border-radius: 8px;
  font-size: 13px;
  padding: 7px 14px;
  cursor: pointer;
}

.export-route-dialog__btn:hover {
  border-color: rgba(249, 0, 191, 0.78);
}

.export-route-dialog__btn--primary {
  border-color: rgba(249, 0, 191, 0.7);
  background: linear-gradient(135deg, rgba(130, 24, 170, 0.94), rgba(249, 0, 191, 0.94));
  color: #fff2ff;
}

.export-route-dialog__btn--primary:hover {
  border-color: rgba(255, 136, 230, 0.95);
}

.export-route-dialog__btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}
</style>
