<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { buildSchematicRenderModel } from '../lib/schematic/renderModel'
import { useProjectStore } from '../stores/projectStore'
import TimelineSlider from './TimelineSlider.vue'
import { createTimelinePlayer } from '../lib/timeline/timelinePlayer.js'

const store = useProjectStore()
const svgRef = ref(null)
const viewport = reactive({
  scale: 1,
  tx: 0,
  ty: 0,
})
const panState = reactive({
  active: false,
  lastClientX: 0,
  lastClientY: 0,
})

const latestSnapshot = computed(() => {
  const snapshots = store.project?.snapshots || []
  return snapshots.length ? snapshots[snapshots.length - 1] : null
})

const renderModel = computed(() =>
  buildSchematicRenderModel(store.project, {
    mirrorVertical: true,
    filterYear: store.timelineFilterYear,
  }),
)
const viewportTransform = computed(() => `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`)

function getStationNameZh(station) {
  return station.nameZh || ''
}

function getLineNameZh(label) {
  return label.nameZh || ''
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function resetViewport() {
  viewport.scale = 1
  viewport.tx = 0
  viewport.ty = 0
}

function toSvgPoint(clientX, clientY) {
  if (!svgRef.value) return null
  const ctm = svgRef.value.getScreenCTM()
  if (!ctm) return null
  const point = svgRef.value.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(ctm.inverse())
}

function onCanvasWheel(event) {
  const focus = toSvgPoint(event.clientX, event.clientY)
  if (!focus) return

  const oldScale = viewport.scale
  const zoomFactor = Math.exp(-event.deltaY * 0.0017)
  const nextScale = clamp(oldScale * zoomFactor, 0.35, 7)
  if (Math.abs(nextScale - oldScale) < 1e-6) return

  viewport.tx += (oldScale - nextScale) * focus.x
  viewport.ty += (oldScale - nextScale) * focus.y
  viewport.scale = nextScale
}

function onCanvasMouseDown(event) {
  if (event.button !== 1) return
  event.preventDefault()
  panState.active = true
  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onCanvasAuxClick(event) {
  if (event.button === 1) {
    event.preventDefault()
  }
}

function endMiddlePan() {
  panState.active = false
}

function onGlobalMouseMove(event) {
  if (!panState.active) return

  const previous = toSvgPoint(panState.lastClientX, panState.lastClientY)
  const current = toSvgPoint(event.clientX, event.clientY)
  if (previous && current) {
    viewport.tx += current.x - previous.x
    viewport.ty += current.y - previous.y
  }

  panState.lastClientX = event.clientX
  panState.lastClientY = event.clientY
}

function onGlobalMouseUp(event) {
  if (!panState.active) return
  if (event.type === 'mouseup' && event.button !== 1) return
  endMiddlePan()
}

// Timeline player
let timelinePlayer = null
function ensureTimelinePlayer() {
  if (timelinePlayer) return timelinePlayer
  timelinePlayer = createTimelinePlayer({
    onYearChange(year) {
      store.setTimelineFilterYear(year)
    },
    onStateChange(state) {
      store.setTimelinePlaybackState(state)
    },
    onPlaybackEnd() {
      store.setTimelinePlaybackState('idle')
    },
  })
  return timelinePlayer
}

function onTimelineYearChange(year) {
  store.setTimelineFilterYear(year)
  if (timelinePlayer) timelinePlayer.seekTo(year)
}

function onTimelinePlay() {
  const player = ensureTimelinePlayer()
  player.setYears(store.timelineYears)
  player.setSpeed(store.timelinePlayback.speed)
  player.play(store.timelinePlayback.state === 'idle')
}

function onTimelinePause() {
  timelinePlayer?.pause()
}

function onTimelineStop() {
  timelinePlayer?.stop()
  store.setTimelineFilterYear(null)
}

function onTimelineSpeedChange(speed) {
  store.setTimelinePlaybackSpeed(speed)
  if (timelinePlayer) timelinePlayer.setSpeed(speed)
}

watch(
  () => [store.project?.id || '', renderModel.value.width, renderModel.value.height],
  async () => {
    await nextTick()
    resetViewport()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
  window.addEventListener('blur', onGlobalMouseUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup', onGlobalMouseUp)
  window.removeEventListener('blur', onGlobalMouseUp)
  timelinePlayer?.destroy()
  timelinePlayer = null
})
</script>

<template>
  <section class="schematic-view">
    <header class="schematic-view__header">
      <h2>示意图</h2>
      <div class="schematic-view__stats">
        <span v-if="latestSnapshot">评分: {{ latestSnapshot.score.toFixed(2) }}</span>
        <span>快照: {{ store.project?.snapshots.length || 0 }}</span>
      </div>
    </header>

    <div
      class="schematic-view__canvas"
      :class="{ 'schematic-view__canvas--panning': panState.active }"
      :style="{ background: renderModel.theme.background }"
      @wheel.prevent="onCanvasWheel"
      @mousedown="onCanvasMouseDown"
      @auxclick="onCanvasAuxClick"
    >
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${renderModel.width} ${renderModel.height}`"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect :width="renderModel.width" :height="renderModel.height" :fill="renderModel.theme.background" />

        <g :transform="viewportTransform">
          <g class="schematic-view__edges-halo">
            <path
              v-for="edge in renderModel.edgePaths"
              :key="`halo_${edge.id}`"
              :d="edge.pathD"
              fill="none"
              stroke="#d9e2ec"
              :stroke-width="edge.width + 2.2"
              :stroke-linecap="edge.lineCap || 'round'"
              stroke-linejoin="round"
              :stroke-dasharray="edge.dasharray || null"
              :opacity="Math.min(0.36, edge.opacity * 0.38)"
            />
          </g>

          <g class="schematic-view__edges-core">
            <path
              v-for="edge in renderModel.edgePaths"
              :key="edge.id"
              :d="edge.pathD"
              fill="none"
              :stroke="edge.color"
              :stroke-width="edge.width"
              :stroke-linecap="edge.lineCap || 'round'"
              stroke-linejoin="round"
              :stroke-dasharray="edge.dasharray || null"
              :opacity="edge.opacity"
            />
          </g>

          <g class="schematic-view__transfers">
            <path
              v-for="tp in renderModel.transferPaths"
              :key="`transfer_${tp.id}`"
              :d="tp.pathD"
              fill="none"
              stroke="#64748B"
              stroke-width="2.4"
              stroke-dasharray="6 4"
              stroke-linecap="round"
              opacity="0.7"
            />
          </g>

          <g class="schematic-view__stations">
            <g v-for="station in renderModel.stations" :key="station.id">
              <rect
                v-if="station.isInterchange"
                :x="station.x - 5.8"
                :y="station.y - 3.6"
                width="11.6"
                height="7.2"
                rx="3.5"
                ry="3.5"
                fill="#ffffff"
                :stroke="renderModel.theme.interchangeStroke"
                stroke-width="1.7"
              />
              <circle
                v-else
                :cx="station.x"
                :cy="station.y"
                r="4.1"
                fill="#ffffff"
                :stroke="renderModel.theme.stationStroke"
                stroke-width="1.7"
              />

              <text
                class="schematic-view__label-zh"
                :x="station.labelX"
                :y="station.labelY"
                :text-anchor="station.labelAnchor"
              >
                {{ getStationNameZh(station) }}
              </text>
              <text
                v-if="station.nameEn"
                class="schematic-view__label-en"
                :x="station.labelX"
                :y="station.labelY + 11"
                :text-anchor="station.labelAnchor"
              >
                {{ station.nameEn }}
              </text>
            </g>
          </g>

          <g class="schematic-view__line-labels">
            <g v-for="label in renderModel.lineLabels" :key="`linelabel_${label.id}`">
              <template v-if="label.number">
                <rect
                  :x="label.x - 34"
                  :y="label.y - 18"
                  width="72"
                  height="44"
                  rx="7"
                  :fill="label.color"
                />
                <text
                  class="schematic-view__line-number"
                  :x="label.x - 12"
                  :y="label.y + 6"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {{ label.number }}
                </text>
                <text
                  class="schematic-view__line-suffix-zh"
                  :x="label.x + 16"
                  :y="label.y - 2"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  号线
                </text>
                <text
                  class="schematic-view__line-suffix-en"
                  :x="label.x + 16"
                  :y="label.y + 12"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  Line {{ label.number }}
                </text>
              </template>
              <template v-else>
                <rect
                  :x="label.x - 42"
                  :y="label.y - 16"
                  width="84"
                  height="32"
                  rx="6"
                  :fill="label.color"
                />
                <text
                  class="schematic-view__line-fullname-zh"
                  :x="label.x"
                  :y="label.y - 3"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {{ getLineNameZh(label) }}
                </text>
                <text
                  class="schematic-view__line-fullname-en"
                  :x="label.x"
                  :y="label.y + 10"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {{ label.nameEn }}
                </text>
              </template>
            </g>
          </g>

        </g>
      </svg>
    </div>

    <TimelineSlider
      @year-change="onTimelineYearChange"
      @play="onTimelinePlay"
      @pause="onTimelinePause"
      @stop="onTimelineStop"
      @speed-change="onTimelineSpeedChange"
    />
  </section>
</template>

<style scoped>
.schematic-view {
  border: 1px solid var(--workspace-panel-border);
  border-radius: 12px;
  background: var(--workspace-panel-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.schematic-view__header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--workspace-panel-header-border);
  background: var(--workspace-panel-header-bg);
  color: var(--workspace-panel-text);
}

.schematic-view__header h2 {
  margin: 0;
  font-size: 16px;
  color: var(--workspace-panel-text);
}

.schematic-view__stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--workspace-panel-muted);
}

.schematic-view__canvas {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--workspace-canvas-bg);
  user-select: none;
  cursor: default;
}

.schematic-view__canvas--panning {
  cursor: grabbing;
}

.schematic-view__canvas svg {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.schematic-view__label-zh {
  font-size: 11.8px;
  fill: #111827;
}

.schematic-view__label-en {
  font-size: 9.3px;
  letter-spacing: 0.015em;
  fill: #7b8794;
}

.schematic-view__line-number {
  fill: #ffffff;
  font-size: 28px;
  font-weight: 800;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}

.schematic-view__line-suffix-zh {
  fill: #ffffff;
  font-size: 10px;
  font-weight: 700;
  font-family: 'Source Han Sans SC', 'Noto Sans CJK SC', '微软雅黑', 'Microsoft YaHei', sans-serif;
}

.schematic-view__line-suffix-en {
  fill: rgba(255, 255, 255, 0.8);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}

.schematic-view__line-fullname-zh {
  fill: #ffffff;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Source Han Sans SC', 'Noto Sans CJK SC', '微软雅黑', 'Microsoft YaHei', sans-serif;
}

.schematic-view__line-fullname-en {
  fill: rgba(255, 255, 255, 0.8);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}
</style>
