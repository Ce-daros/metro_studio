<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { calculateNetworkMetrics } from '../lib/network/networkStatistics'
import { getDisplayLineName } from '../lib/lineNaming'
import IconBase from './IconBase.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'show-reachability'])

const store = useProjectStore()
const activeTab = ref('basics')
const loading = ref(false)
const stats = ref(null)

const tabs = [
  { key: 'network', label: '线网概况', icon: 'bar-chart-2' },
  { key: 'basics', label: '基础概况', icon: 'grid' },
  { key: 'paths', label: '最长路径', icon: 'route' },
  { key: 'interchanges', label: '换乘枢纽', icon: 'git-branch' },
  { key: 'lines', label: '线路分析', icon: 'git-branch' },
  { key: 'reachability', label: '可达性', icon: 'target' },
]

function doClose() {
  emit('close')
}

function formatDistance(meters) {
  if (!meters && meters !== 0) return '-'
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${Math.round(meters)} m`
}

function getStationName(id) {
  return store.stationById.get(id)?.nameZh || id
}

function formatLineNames(lineIds) {
  return (lineIds || [])
    .map(lid => store.lineById.get(lid)?.nameZh)
    .filter(Boolean)
    .join('、')
}

function resolveEdgeLengthMeters(edge) {
  if (Number.isFinite(edge?.lengthMeters) && edge.lengthMeters > 0) return edge.lengthMeters
  return 0
}

function formatKm(meters) {
  return (meters / 1000).toFixed(1)
}

const lines = computed(() => store.project?.lines || [])
const edges = computed(() => store.project?.edges || [])
const stations = computed(() => store.project?.stations || [])

const edgeByIdMap = computed(() => {
  const map = new Map()
  for (const edge of edges.value) map.set(edge.id, edge)
  return map
})

const lineCountByStatus = computed(() => {
  let open = 0
  let construction = 0
  let proposed = 0
  for (const line of lines.value) {
    if (line.status === 'open') open += 1
    else if (line.status === 'construction') construction += 1
    else if (line.status === 'proposed') proposed += 1
  }
  return { open, construction, proposed }
})

function effectiveLines(station) {
  return station.transferLineIds?.length ? station.transferLineIds : (station.lineIds || [])
}

const interchangeStations = computed(() => stations.value.filter((station) => effectiveLines(station).length >= 2))

const maxInterchangeStation = computed(() => {
  let best = null
  let bestCount = 0
  for (const station of stations.value) {
    const count = effectiveLines(station).length
    if (count > bestCount) {
      best = station
      bestCount = count
    }
  }
  return best
})

const maxInterchangeLineCount = computed(() => {
  const station = maxInterchangeStation.value
  return station ? effectiveLines(station).length : 0
})

const maxInterchangeLineNames = computed(() => {
  const station = maxInterchangeStation.value
  if (!station) return ''
  return effectiveLines(station)
    .map((lineId) => store.lineById.get(lineId))
    .filter(Boolean)
    .map((line) => getDisplayLineName(line, 'zh') || line.nameZh)
    .filter(Boolean)
    .join('、')
})

const totalMileageMeters = computed(() => edges.value.reduce((sum, edge) => sum + resolveEdgeLengthMeters(edge), 0))

function computeLineMileageMeters(line) {
  let total = 0
  for (const edgeId of (line.edgeIds || [])) {
    const edge = edgeByIdMap.value.get(edgeId)
    if (edge) total += resolveEdgeLengthMeters(edge)
  }
  return total
}

const mileageByStatus = computed(() => {
  let open = 0
  let construction = 0
  let proposed = 0
  for (const line of lines.value) {
    const mileage = computeLineMileageMeters(line)
    if (line.status === 'open') open += mileage
    else if (line.status === 'construction') construction += mileage
    else if (line.status === 'proposed') proposed += mileage
  }
  return { open, construction, proposed }
})

const lineDetails = computed(() => {
  return lines.value.map((line) => {
    const mileageMeters = computeLineMileageMeters(line)
    const stationIdSet = new Set()
    for (const edgeId of (line.edgeIds || [])) {
      const edge = edgeByIdMap.value.get(edgeId)
      if (!edge) continue
      stationIdSet.add(edge.fromStationId)
      stationIdSet.add(edge.toStationId)
    }
    return {
      id: line.id,
      name: getDisplayLineName(line, 'zh') || line.nameZh || '未命名',
      color: line.color,
      status: line.status,
      stationCount: stationIdSet.size,
      mileageMeters,
      mileageKm: formatKm(mileageMeters),
    }
  }).sort((a, b) => b.mileageMeters - a.mileageMeters)
})

const averageInterStationKm = computed(() => {
  if (!edges.value.length) return '0.0'
  let totalMeters = 0
  let count = 0
  for (const edge of edges.value) {
    const len = resolveEdgeLengthMeters(edge)
    if (len <= 0) continue
    totalMeters += len
    count += 1
  }
  if (!count) return '0.0'
  return (totalMeters / count / 1000).toFixed(1)
})

const longestLine = computed(() => (lineDetails.value.length ? lineDetails.value[0] : null))

const shortestLine = computed(() => {
  if (!lineDetails.value.length) return null
  const withEdges = lineDetails.value.filter((line) => line.mileageMeters > 0)
  if (!withEdges.length) return null
  return withEdges[withEdges.length - 1]
})

const STATUS_LABELS = { open: '运营', construction: '在建', proposed: '规划' }

const reachStation = ref(null)
const reachThreshold = ref(20000)
const thresholdOptions = [
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
  { label: '20 km', value: 20000 },
  { label: '50 km', value: 50000 },
  { label: '100 km', value: 100000 },
  { label: '不限', value: Infinity },
]

const stationOptions = computed(() => {
  return (store.project?.stations || [])
    .map(s => ({ id: s.id, name: s.nameZh || s.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
})

function applyReachability() {
  if (!reachStation.value) return
  emit('show-reachability', { stationId: reachStation.value, thresholdMeters: reachThreshold.value })
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      loading.value = true
      stats.value = null
      await nextTick()
      // Double rAF ensures the loading spinner is painted before heavy work
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (!props.visible) return
      // Run calculation in a macrotask so the browser can paint the loading state
      stats.value = await new Promise((resolve) => {
        setTimeout(() => {
          resolve(store.project ? calculateNetworkMetrics(store.project) : null)
        }, 0)
      })
      loading.value = false
    }
  }
)
</script>

<template>
  <NModal :show="visible" preset="card" title="统计信息" style="width:800px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="stats-dialog__tabs">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              :class="['stats-dialog__tab', { 'stats-dialog__tab--active': activeTab === tab.key }]"
              type="button"
              @click="activeTab = tab.key"
            >
              <IconBase :name="tab.icon" :size="14" />
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <div class="stats-dialog__body">
            <div v-if="loading" class="stats-dialog__loading">
              计算中...
            </div>
            
            <div v-else-if="!stats" class="stats-dialog__empty">
              暂无数据，请先创建或导入工程
            </div>

            <template v-else>
              <div v-show="activeTab === 'network'" class="stats__section">
                <div class="stats-group">
                  <h3 class="stats-group__title">线网概况</h3>
                  <table class="stats-table">
                    <tbody>
                      <tr>
                        <td class="stats-label">线路总数</td>
                        <td class="stats-value">
                          {{ lines.length }} 条
                          <span v-if="lines.length > 0" class="stats-sub">
                            （运营 {{ lineCountByStatus.open }}
                            <template v-if="lineCountByStatus.construction"> / 在建 {{ lineCountByStatus.construction }}</template>
                            <template v-if="lineCountByStatus.proposed"> / 规划 {{ lineCountByStatus.proposed }}</template>）
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td class="stats-label">车站总数</td>
                        <td class="stats-value">{{ stations.length }} 座</td>
                      </tr>
                      <tr>
                        <td class="stats-label">换乘站</td>
                        <td class="stats-value">{{ interchangeStations.length }} 座</td>
                      </tr>
                      <tr>
                        <td class="stats-label">总里程</td>
                        <td class="stats-value">{{ formatKm(totalMileageMeters) }} km</td>
                      </tr>
                      <tr v-if="mileageByStatus.open > 0">
                        <td class="stats-label stats-label--indent">运营里程</td>
                        <td class="stats-value">{{ formatKm(mileageByStatus.open) }} km</td>
                      </tr>
                      <tr v-if="mileageByStatus.construction > 0">
                        <td class="stats-label stats-label--indent">在建里程</td>
                        <td class="stats-value">{{ formatKm(mileageByStatus.construction) }} km</td>
                      </tr>
                      <tr v-if="mileageByStatus.proposed > 0">
                        <td class="stats-label stats-label--indent">规划里程</td>
                        <td class="stats-value">{{ formatKm(mileageByStatus.proposed) }} km</td>
                      </tr>
                      <tr>
                        <td class="stats-label">平均站间距</td>
                        <td class="stats-value">{{ averageInterStationKm }} km</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="longestLine || shortestLine || maxInterchangeStation" class="stats-group">
                  <h3 class="stats-group__title">关键节点</h3>
                  <div v-if="longestLine" class="stats-highlight-row">
                    <span class="stats-label">最长线路</span>
                    <span class="stats-value">
                      <span class="line-swatch" :style="{ backgroundColor: longestLine.color }" />
                      {{ longestLine.name }}（{{ longestLine.mileageKm }} km）
                    </span>
                  </div>
                  <div v-if="shortestLine && shortestLine.id !== longestLine?.id" class="stats-highlight-row">
                    <span class="stats-label">最短线路</span>
                    <span class="stats-value">
                      <span class="line-swatch" :style="{ backgroundColor: shortestLine.color }" />
                      {{ shortestLine.name }}（{{ shortestLine.mileageKm }} km）
                    </span>
                  </div>
                  <div v-if="maxInterchangeStation && maxInterchangeLineCount >= 2" class="stats-highlight-row">
                    <span class="stats-label">最大换乘站</span>
                    <span class="stats-value">
                      {{ maxInterchangeStation.nameZh }}（{{ maxInterchangeLineCount }} 线：{{ maxInterchangeLineNames }}）
                    </span>
                  </div>
                </div>

                <div class="stats-group">
                  <h3 class="stats-group__title">各线路排行</h3>
                  <div v-if="!lineDetails.length" class="stats-dialog__empty stats-dialog__empty--compact">
                    暂无线路数据
                  </div>
                  <ul v-else class="line-ranking">
                    <li v-for="(detail, index) in lineDetails" :key="detail.id" class="line-ranking-item">
                      <span class="line-ranking-index">{{ index + 1 }}</span>
                      <span class="line-swatch" :style="{ backgroundColor: detail.color }" />
                      <span class="line-ranking-name">{{ detail.name }}</span>
                      <span class="line-ranking-badge">{{ statusLabel(detail.status) }}</span>
                      <span class="line-ranking-stat">{{ detail.stationCount }} 站</span>
                      <span class="line-ranking-stat">{{ detail.mileageKm }} km</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div v-show="activeTab === 'basics'" class="stats__section">
                <div class="stats-grid">
                  <div class="stats-card">
                    <div class="stats-card__label">线路总数</div>
                    <div class="stats-card__value">{{ stats.basics.lineCount }}</div>
                    <div class="stats-card__sub">运营线路</div>
                  </div>
                  <div class="stats-card">
                    <div class="stats-card__label">站点总数</div>
                    <div class="stats-card__value">{{ stats.basics.stationCount }}</div>
                    <div class="stats-card__sub">{{ stats.basics.interchangeCount }} 换乘站</div>
                  </div>
                  <div class="stats-card">
                    <div class="stats-card__label">线段总数</div>
                    <div class="stats-card__value">{{ stats.basics.edgeCount }}</div>
                    <div class="stats-card__sub">含曲线段</div>
                  </div>
                  <div class="stats-card">
                    <div class="stats-card__label">总里程</div>
                    <div class="stats-card__value">{{ stats.basics.totalKm.toFixed(1) }} km</div>
                    <div class="stats-card__sub">{{ formatDistance(stats.basics.totalMeters) }}</div>
                  </div>
                </div>

                <div v-if="stats.interchanges.total > 0" class="stats-group">
                  <h3 class="stats-group__title">换乘站分布</h3>
                  <div class="stats-row">
                    <span class="stats-row__label">N线换乘站</span>
                    <div class="stats-row__value">
                      <span
                        v-for="(count, n) in stats.interchanges.byLineCount"
                        :key="n"
                        class="stats-tag"
                      >
                        {{ n }}线: {{ count }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-show="activeTab === 'paths'" class="stats__section">
                <div class="stats-group" v-if="stats.paths.longestDistance">
                  <h3 class="stats-group__title">最长距离路径</h3>
                  <div class="path-info">
                    <div class="path-info__route">
                      {{ getStationName(stats.paths.longestDistance.fromStationId) }}
                      →
                      {{ getStationName(stats.paths.longestDistance.toStationId) }}
                    </div>
                    <div class="path-info__metrics">
                      <span class="path-metric">
                        <IconBase name="map" :size="12" />
                        {{ formatDistance(stats.paths.longestDistance.metrics.maxDistance) }}
                      </span>
                      <span class="path-metric">
                        <IconBase name="circle" :size="12" />
                        {{ stats.paths.longestDistance.metrics.stationCount }} 站
                      </span>
                      <span class="path-metric">
                        <IconBase name="shuffle" :size="12" />
                        {{ stats.paths.longestDistance.metrics.transferCount }} 次换乘
                      </span>
                    </div>
                  </div>
                </div>

                <div class="stats-group" v-if="stats.paths.maxTransfers">
                  <h3 class="stats-group__title">最多换乘路径</h3>
                  <div class="path-info">
                    <div class="path-info__route">
                      {{ getStationName(stats.paths.maxTransfers.fromStationId) }}
                      →
                      {{ getStationName(stats.paths.maxTransfers.toStationId) }}
                    </div>
                    <div class="path-info__metrics">
                      <span class="path-metric">
                        <IconBase name="shuffle" :size="12" />
                        {{ stats.paths.maxTransfers.metrics.transferCount }} 次换乘
                      </span>
                      <span class="path-metric">
                        <IconBase name="map" :size="12" />
                        {{ formatDistance(stats.paths.maxTransfers.metrics.totalMeters) }}
                      </span>
                      <span class="path-metric">
                        <IconBase name="git-branch" :size="12" />
                        {{ stats.paths.maxTransfers.metrics.uniqueLinesCount }} 条线路
                      </span>
                    </div>
                  </div>
                </div>

                <div class="stats-group" v-if="stats.paths.maxLines">
                  <h3 class="stats-group__title">最多线路路径</h3>
                  <div class="path-info">
                    <div class="path-info__route">
                      {{ getStationName(stats.paths.maxLines.fromStationId) }}
                      →
                      {{ getStationName(stats.paths.maxLines.toStationId) }}
                    </div>
                    <div class="path-info__metrics">
                      <span class="path-metric">
                        <IconBase name="git-branch" :size="12" />
                        {{ stats.paths.maxLines.metrics.uniqueLinesCount }} 条线路
                      </span>
                      <span class="path-metric">
                        <IconBase name="map" :size="12" />
                        {{ formatDistance(stats.paths.maxLines.metrics.totalMeters) }}
                      </span>
                      <span class="path-metric">
                        <IconBase name="shuffle" :size="12" />
                        {{ stats.paths.maxLines.metrics.transferCount }} 次换乘
                      </span>
                    </div>
                  </div>
                </div>

                <div class="stats-group" v-if="stats.paths.maxStations">
                  <h3 class="stats-group__title">最多站点路径</h3>
                  <div class="path-info">
                    <div class="path-info__route">
                      {{ getStationName(stats.paths.maxStations.fromStationId) }}
                      →
                      {{ getStationName(stats.paths.maxStations.toStationId) }}
                    </div>
                    <div class="path-info__metrics">
                      <span class="path-metric">
                        <IconBase name="circle" :size="12" />
                        {{ stats.paths.maxStations.metrics.stationCount }} 站
                      </span>
                      <span class="path-metric">
                        <IconBase name="map" :size="12" />
                        {{ formatDistance(stats.paths.maxStations.metrics.totalMeters) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-show="activeTab === 'interchanges'" class="stats__section">
                <div v-if="stats.interchanges.ranking.length === 0" class="stats-dialog__empty">
                  暂无换乘站
                </div>
                <div v-else class="interchange-list">
                  <div
                    v-for="(item, index) in stats.interchanges.ranking"
                    :key="item.stationId"
                    class="interchange-item"
                  >
                    <div class="interchange-item__rank">{{ index + 1 }}</div>
                    <div class="interchange-item__info">
                      <div class="interchange-item__name">{{ item.stationName }}</div>
                      <div class="interchange-item__lines">{{ formatLineNames(item.lineIds) }}</div>
                    </div>
                    <div class="interchange-item__count">{{ item.lineCount }}线</div>
                  </div>
                </div>
              </div>

              <div v-show="activeTab === 'lines'" class="stats__section">
                <div class="line-table">
                  <div class="line-table__header">
                    <div class="line-table__cell">线路</div>
                    <div class="line-table__cell">站点</div>
                    <div class="line-table__cell">线段</div>
                    <div class="line-table__cell">里程</div>
                    <div class="line-table__cell">类型</div>
                  </div>
                  <div
                    v-for="line in stats.lines"
                    :key="line.lineId"
                    class="line-table__row"
                  >
                    <div class="line-table__cell line-table__cell--name">{{ line.lineName }}</div>
                    <div class="line-table__cell">{{ line.stationCount }}</div>
                    <div class="line-table__cell">{{ line.edgeCount }}</div>
                    <div class="line-table__cell">{{ formatDistance(line.meters) }}</div>
                    <div class="line-table__cell">{{ line.isLoop ? '环线' : '普线' }}</div>
                  </div>
                </div>
              </div>
            </template>

            <div v-show="activeTab === 'reachability'" class="stats__section">
              <div class="reach-controls">
                <label class="reach-controls__label">
                  起始站
                  <select v-model="reachStation" class="reach-controls__select">
                    <option :value="null" disabled>选择站点…</option>
                    <option v-for="s in stationOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </label>
                <label class="reach-controls__label">
                  距离阈值
                  <select v-model.number="reachThreshold" class="reach-controls__select">
                    <option v-for="opt in thresholdOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </label>
                <button class="stats-dialog__btn stats-dialog__btn--primary" :disabled="!reachStation" type="button" @click="applyReachability">分析</button>
              </div>

              <template v-if="store.reachability.active && store.reachability.result">
                <div class="reach-summary">
                  共可达 <strong>{{ store.reachability.result.totalCount }}</strong> 个站点
                </div>
                <div v-for="band in store.reachability.result.bands" :key="band.label" class="reach-band">
                  <div class="reach-band__header">
                    <span class="reach-band__dot" :style="{ background: band.color }" />
                    {{ band.label }}（{{ band.stations.length }} 站）
                  </div>
                  <ul class="reach-band__list">
                    <li v-for="s in band.stations" :key="s.id" class="reach-band__item">
                      {{ s.name }}
                      <span class="reach-band__dist">{{ formatDistance(s.distance) }}</span>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </div>

    <template #footer>
      <div class="stats-dialog__footer">
        <button
          class="stats-dialog__btn stats-dialog__btn--primary"
          type="button"
          @click="doClose"
        >
          关闭
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.stats-dialog__tabs {
  display: flex;
  gap: 0;
  padding: 0 20px;
  border-bottom: 1px solid var(--toolbar-divider);
}

.stats-dialog__tab {
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid transparent;
  transition: all var(--transition-normal);
}

.stats-dialog__tab:hover {
  color: var(--toolbar-text);
}

.stats-dialog__tab--active {
  color: var(--toolbar-text);
  border-bottom-color: var(--ark-pink);
}

.stats-dialog__body {
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;
}

.stats-dialog__loading,
.stats-dialog__empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--toolbar-muted);
  font-size: 13px;
}

.stats-dialog__empty--compact {
  padding: 10px 0;
}

.stats__section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.stats-card {
  padding: 16px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
}

.stats-card__label {
  font-size: 12px;
  color: var(--toolbar-muted);
  margin-bottom: 6px;
}

.stats-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--toolbar-text);
  margin-bottom: 4px;
}

.stats-card__sub {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.stats-group {
  padding: 16px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
}

.stats-group__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--toolbar-text);
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stats-row__label {
  font-size: 12px;
  color: var(--toolbar-muted);
  min-width: 80px;
}

.stats-row__value {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.stats-table td {
  padding: 3px 0;
  vertical-align: top;
}

.stats-label--indent {
  padding-left: 12px;
}

.stats-tag {
  padding: 3px 8px;
  background: var(--toolbar-button-bg);
  border: 1px solid var(--toolbar-button-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--toolbar-button-text);
}

.stats-highlight-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
}

.path-info {
  padding: 14px;
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-divider);
  border-radius: 6px;
  min-width: 0;
}

.path-info__route {
  display: block;
  max-width: 100%;
  font-size: 14px;
  font-weight: 600;
  color: var(--toolbar-text);
  margin-bottom: 10px;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.path-info__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.path-metric {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--toolbar-muted);
}

.interchange-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.interchange-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
}

.interchange-item__rank {
  font-size: 20px;
  font-weight: 700;
  color: var(--toolbar-text);
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.interchange-item__rank--1 {
  font-size: 24px;
}

.interchange-item__rank--2 {
  font-size: 22px;
}

.interchange-item__rank--3 {
  font-size: 20px;
}

.interchange-item__info {
  flex: 1;
  min-width: 0;
}

.interchange-item__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--toolbar-text);
  margin-bottom: 4px;
}

.interchange-item__lines {
  font-size: 12px;
  color: var(--toolbar-muted);
}

.interchange-item__count {
  padding: 4px 10px;
  background: var(--ark-pink);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.line-ranking {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 340px;
  overflow-y: auto;
}

.line-ranking-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-input-bg);
  font-size: 12px;
  color: var(--toolbar-text);
}

.line-ranking-index {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 10px;
  font-weight: 600;
  min-width: 14px;
  text-align: center;
}

.line-ranking-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-ranking-badge {
  font-size: 10px;
  padding: 1px 5px;
  background: var(--toolbar-divider);
  color: var(--toolbar-muted);
  flex-shrink: 0;
}

.line-ranking-stat {
  color: var(--toolbar-hint);
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}

.line-swatch {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

.line-table {
  border: 1px solid var(--toolbar-divider);
  border-radius: 8px;
  overflow: hidden;
}

.line-table__header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.2fr 0.8fr;
  background: var(--toolbar-input-bg);
  border-bottom: 1px solid var(--toolbar-divider);
}

.line-table__cell {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--toolbar-text);
  border-bottom: 1px solid var(--toolbar-divider);
}

.line-table__cell--name {
  font-weight: 600;
}

.line-table__row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.2fr 0.8fr;
  background: var(--toolbar-card-bg);
}

.line-table__row:last-child .line-table__cell {
  border-bottom: none;
}

.line-table__row:hover .line-table__cell {
  background: var(--toolbar-button-bg);
}

.stats-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--toolbar-divider);
}

.stats-dialog__btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-normal);
  outline: none;
}

.stats-dialog__btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.stats-dialog__btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.stats-dialog__btn--primary:hover {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.stats-dialog__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.reach-controls {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.reach-controls__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--toolbar-muted);
}

.reach-controls__select {
  padding: 6px 8px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-text);
  font-size: 13px;
  min-width: 140px;
}

.reach-summary {
  font-size: 13px;
  color: var(--toolbar-text);
  padding: 8px 0;
}

.reach-band {
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  padding: 12px;
}

.reach-band__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--toolbar-text);
  margin-bottom: 8px;
}

.reach-band__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.reach-band__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  max-height: 120px;
  overflow-y: auto;
}

.reach-band__item {
  font-size: 12px;
  color: var(--toolbar-text);
  display: flex;
  align-items: center;
  gap: 4px;
}

.reach-band__dist {
  font-size: 11px;
  color: var(--toolbar-muted);
}
</style>
