<script setup>
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const emit = defineEmits(['year-change', 'play', 'pause', 'stop', 'speed-change'])

const isDragging = ref(false)
const dragYear = ref(null)

const years = computed(() => store.timelineYears)
const yearRange = computed(() => store.timelineYearRange)
const hasData = computed(() => store.timelineHasData)
const currentYear = computed(() => store.timelineFilterYear)
const playbackState = computed(() => store.timelinePlayback.state)
const playbackSpeed = computed(() => store.timelinePlayback.speed)

const stats = computed(() => store.timelineStatsAtYear)

const displayYear = computed(() => {
  if (isDragging.value && dragYear.value != null) return dragYear.value
  return currentYear.value
})

const sliderPercent = computed(() => {
  if (!yearRange.value) return 0
  const { min, max } = yearRange.value
  if (min === max) return 50
  const year = displayYear.value ?? min
  return ((year - min) / (max - min)) * 100
})

const yearMarkers = computed(() => {
  if (!yearRange.value || !years.value.length) return []
  const { min, max } = yearRange.value
  const range = max - min || 1
  return years.value.map((y) => ({
    year: y,
    percent: ((y - min) / range) * 100,
    isNew: store.project?.edges.some((e) => e.openingYear === y),
  }))
})

const speedOptions = [0.5, 1, 2, 3]

function onSliderInput(event) {
  if (!yearRange.value) return
  const percent = Number(event.target.value)
  const { min, max } = yearRange.value
  const year = Math.round(min + (percent / 100) * (max - min))
  dragYear.value = year
  emit('year-change', year)
}

function onSliderMouseDown() {
  isDragging.value = true
}

function onSliderMouseUp() {
  isDragging.value = false
  dragYear.value = null
}

function onPlayPause() {
  if (playbackState.value === 'playing') {
    emit('pause')
  } else {
    emit('play')
  }
}

function onStop() {
  emit('stop')
}

function onSpeedChange(speed) {
  emit('speed-change', speed)
}

function enableTimeline() {
  if (yearRange.value) {
    emit('year-change', yearRange.value.min)
  }
}

function disableTimeline() {
  emit('stop')
  emit('year-change', null)
}

const eventDescription = computed(() => {
  if (displayYear.value == null || !store.project?.timelineEvents) return null
  const evt = store.project.timelineEvents.find((e) => e.year === displayYear.value)
  return evt?.description || null
})
</script>

<template>
  <div v-if="hasData" class="timeline-slider">
    <div class="timeline-slider__controls">
      <button
        v-if="currentYear == null"
        class="timeline-slider__btn timeline-slider__btn--enable"
        type="button"
        title="启用时间轴"
        @click="enableTimeline"
      >
        <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
        <span>时间轴</span>
      </button>

      <template v-else>
        <button
          class="timeline-slider__btn"
          type="button"
          :title="playbackState === 'playing' ? '暂停' : '播放'"
          @click="onPlayPause"
        >
          <span style="font-size:14px;color:var(--ark-pink);line-height:1;">{{ playbackState === 'playing' ? '▨' : '▣' }}</span>
        </button>

        <button
          v-if="playbackState !== 'idle'"
          class="timeline-slider__btn"
          type="button"
          title="停止"
          @click="onStop"
        >
          <span style="font-size:12px;color:var(--ark-pink);line-height:1;">▣</span>
        </button>

        <div class="timeline-slider__track-wrapper">
          <div class="timeline-slider__markers">
            <div
              v-for="marker in yearMarkers"
              :key="marker.year"
              class="timeline-slider__marker"
              :class="{ 'timeline-slider__marker--active': marker.year <= (displayYear ?? 0) }"
              :style="{ left: `${marker.percent}%` }"
              :title="`${marker.year}`"
            />
          </div>
          <input
            type="range"
            class="timeline-slider__range"
            min="0"
            max="100"
            step="0.1"
            :value="sliderPercent"
            :disabled="playbackState === 'playing'"
            @input="onSliderInput"
            @mousedown="onSliderMouseDown"
            @mouseup="onSliderMouseUp"
            @touchstart="onSliderMouseDown"
            @touchend="onSliderMouseUp"
          />
        </div>

        <span class="timeline-slider__year">{{ displayYear }}</span>

        <div class="timeline-slider__speed">
          <button
            v-for="s in speedOptions"
            :key="s"
            class="timeline-slider__speed-btn"
            :class="{ 'timeline-slider__speed-btn--active': playbackSpeed === s }"
            type="button"
            @click="onSpeedChange(s)"
          >
            {{ s }}x
          </button>
        </div>

        <div v-if="stats" class="timeline-slider__stats">
          <span>{{ stats.lines }}线</span>
          <span>{{ stats.stations }}站</span>
          <span>{{ stats.km.toFixed(1) }}km</span>
        </div>

        <button
          class="timeline-slider__btn timeline-slider__btn--close"
          type="button"
          title="关闭时间轴"
          @click="disableTimeline"
        >
          <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
        </button>
      </template>
    </div>

    <div v-if="eventDescription && currentYear != null" class="timeline-slider__event">
      {{ eventDescription }}
    </div>
  </div>
</template>

<style scoped>
.timeline-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px;
  background: var(--workspace-panel-header-bg);
  border-top: 1px solid var(--workspace-panel-header-border);
  flex-shrink: 0;
}

.timeline-slider__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.timeline-slider__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  background: var(--toolbar-button-bg);
  color: var(--toolbar-muted);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 11px;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.timeline-slider__btn:hover {
  color: var(--toolbar-text);
  background: var(--toolbar-button-hover-bg);
}

.timeline-slider__btn--enable {
  padding: 4px 10px;
  background: var(--toolbar-primary-bg);
  color: var(--toolbar-primary-text, #fff);
}

.timeline-slider__btn--enable:hover {
  filter: brightness(1.1);
}

.timeline-slider__btn--close {
  margin-left: auto;
}

.timeline-slider__track-wrapper {
  flex: 1;
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
  min-width: 120px;
}

.timeline-slider__markers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.timeline-slider__marker {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--toolbar-muted);
  transform: translate(-50%, -50%);
  opacity: 0.5;
  transition: opacity var(--transition-normal), background var(--transition-normal);
}

.timeline-slider__marker--active {
  background: var(--toolbar-primary-bg);
  opacity: 1;
}

.timeline-slider__range {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--toolbar-input-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.timeline-slider__range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--toolbar-primary-bg);
  border: 2px solid var(--toolbar-card-bg);
  cursor: grab;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.timeline-slider__range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--toolbar-primary-bg);
  border: 2px solid var(--toolbar-card-bg);
  cursor: grab;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.timeline-slider__range:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.timeline-slider__year {
  font-size: 16px;
  font-weight: 700;
  color: var(--toolbar-text);
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', monospace;
}

.timeline-slider__speed {
  display: flex;
  gap: 2px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 4px;
  overflow: hidden;
}

.timeline-slider__speed-btn {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.timeline-slider__speed-btn:hover {
  color: var(--toolbar-text);
}

.timeline-slider__speed-btn--active {
  background: var(--toolbar-primary-bg);
  color: var(--toolbar-primary-text, #fff);
}

.timeline-slider__stats {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--toolbar-muted);
  white-space: nowrap;
}

.timeline-slider__event {
  font-size: 12px;
  color: var(--toolbar-text);
  padding: 2px 0;
  opacity: 0.85;
  text-align: center;
}
</style>
