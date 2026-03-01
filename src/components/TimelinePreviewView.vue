<script setup>
import { computed, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useTimelinePlayback } from '../composables/useTimelinePlayback'

const props = defineProps({
  active: { type: Boolean, default: false },
})

const store = useProjectStore()
const containerRef = ref(null)
const canvasRef = ref(null)

const hasData = computed(() => store.timelineHasData)

let _skipClickCount = 0
let _skipClickTimer = null
function onCanvasClick() {
  if (playbackState.value !== 'loading') return
  _skipClickCount++
  clearTimeout(_skipClickTimer)
  if (_skipClickCount >= 3) {
    _skipClickCount = 0
    onSkipLoading()
  } else {
    _skipClickTimer = setTimeout(() => { _skipClickCount = 0 }, 600)
  }
}

const {
  pseudoMode,
  playbackState,
  currentYear,
  totalYears,
  playbackSpeed,
  zoomOffset,
  isFullscreen,
  speedOptions,
  canUsePseudoMode,
  showToolbar,
  currentYearLabel,
  progressPercent,
  onPlay,
  onPause,
  onStop,
  onSkipLoading,
  onSpeedChange,
  onZoomOffsetChange,
  startPseudoPreview,
  exitPseudoMode,
  toggleFullscreen,
} = useTimelinePlayback(containerRef, canvasRef, {
  hasData,
  active: computed(() => props.active),
  store,
})
</script>

<template>
  <section class="preview-view">
    <header class="preview-view__header">
      <h2>
        {{ pseudoMode ? '线序预览' : '时间轴预览' }}
      </h2>

      <div v-if="showToolbar" class="preview-view__toolbar">
        <div class="preview-view__playback">
          <button
            class="preview-view__btn"
            type="button"
            :title="playbackState === 'idle' ? '播放' : playbackState === 'loading' ? '加载瓦片中…' : '暂停'"
            :disabled="playbackState === 'loading'"
            @click="playbackState === 'idle' ? onPlay() : playbackState === 'playing' ? onPause() : null"
          >
            <span style="font-size:14px;color:var(--ark-pink);line-height:1;">{{ playbackState === 'playing' ? '▨' : '▣' }}</span>
          </button>

          <button
            v-if="playbackState !== 'idle'"
            class="preview-view__btn"
            type="button"
            title="停止"
            @click="onStop"
          >
            <span style="font-size:12px;color:var(--ark-pink);line-height:1;">▣</span>
          </button>
        </div>

        <span v-if="currentYear != null" class="preview-view__year">{{ currentYearLabel }}</span>

        <div class="preview-view__speed">
          <button
            v-for="s in speedOptions"
            :key="s"
            class="preview-view__speed-btn"
            :class="{ 'preview-view__speed-btn--active': playbackSpeed === s }"
            type="button"
            @click="onSpeedChange(s)"
          >
            {{ s }}x
          </button>
        </div>

        <div class="preview-view__speed">
          <button
            v-for="z in [0, 1, 2, 2.5, 3, 4, 5]"
            :key="`z${z}`"
            class="preview-view__speed-btn"
            :class="{ 'preview-view__speed-btn--active': zoomOffset === z }"
            type="button"
            :title="`镜头缩放 +${z}`"
            @click="onZoomOffsetChange(z)"
          >
            {{ z === 0 ? '全景' : `+${z}` }}
          </button>
        </div>

        <button
          v-if="pseudoMode"
          class="preview-view__toggle-btn preview-view__toggle-btn--active"
          type="button"
          title="退出线序预览"
          @click="exitPseudoMode"
        >
          退出线序
        </button>

        <button
          class="preview-view__btn preview-view__btn--fullscreen"
          type="button"
          :title="isFullscreen ? '退出全屏' : '全屏'"
          @click="toggleFullscreen"
        >
          <span style="font-size:14px;color:var(--ark-pink);line-height:1;">{{ isFullscreen ? '▨' : '▣' }}</span>
        </button>
      </div>
    </header>

    <div ref="containerRef" class="preview-view__canvas-container">
      <canvas ref="canvasRef" class="preview-view__canvas" @click="onCanvasClick" />

      <div v-if="!hasData && !pseudoMode" class="preview-view__empty">
        <span style="font-size:32px;color:var(--ark-pink);line-height:1;">▣</span>
        <p>暂无标记年份的线段，无法预览时间轴动画</p>
        <p class="preview-view__empty-hint">在线段属性中设置"开通年份"后即可使用</p>
        <button
          v-if="canUsePseudoMode"
          class="preview-view__pseudo-btn"
          type="button"
          @click="startPseudoPreview"
        >
          <span style="font-size:12px;color:var(--ark-pink);line-height:1;">▣</span>
          按线路顺序预览伪"发展史"
        </button>
      </div>

      <div
        v-if="(hasData || pseudoMode) && playbackState !== 'idle' && totalYears > 1"
        class="preview-view__progress"
      >
        <div
          class="preview-view__progress-bar"
          :style="{ width: `${progressPercent}%` }"
        />
      </div>
    </div>

  </section>
</template>

<style scoped>
.preview-view {
  border: 1px solid var(--workspace-panel-border);
  border-radius: 12px;
  background: var(--workspace-panel-bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-view__header {
  padding: 8px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--workspace-panel-header-border);
  background: var(--workspace-panel-header-bg);
  color: var(--workspace-panel-text);
  flex-shrink: 0;
  gap: 12px;
}

.preview-view__header h2 {
  margin: 0;
  font-size: 16px;
  color: var(--workspace-panel-text);
  white-space: nowrap;
}

.preview-view__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

.preview-view__playback {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-view__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--toolbar-button-bg);
  color: var(--toolbar-muted);
  border-radius: 4px;
  padding: 5px 7px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.preview-view__btn:hover {
  color: var(--toolbar-text);
  background: var(--toolbar-button-hover-bg);
}

.preview-view__btn--fullscreen {
  margin-left: auto;
}

.preview-view__year {
  font-size: 16px;
  font-weight: 700;
  color: var(--toolbar-text);
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', monospace;
}

.preview-view__speed {
  display: flex;
  gap: 2px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 4px;
  overflow: hidden;
}

.preview-view__speed-btn {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.preview-view__speed-btn:hover {
  color: var(--toolbar-text);
}

.preview-view__speed-btn--active {
  background: var(--toolbar-primary-bg);
  color: var(--toolbar-primary-text, #fff);
}

.preview-view__toggle-btn {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.preview-view__toggle-btn:hover {
  color: var(--toolbar-text);
}

.preview-view__toggle-btn--active {
  background: var(--toolbar-primary-bg);
  color: var(--toolbar-primary-text, #fff);
}

.preview-view__canvas-container {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #ECEFF1;
}

.preview-view__canvas-container:fullscreen {
  background: #ECEFF1;
}

.preview-view__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.preview-view__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--workspace-panel-muted);
  background: var(--workspace-canvas-bg);
}

.preview-view__empty p {
  margin: 0;
  font-size: 14px;
}

.preview-view__empty-hint {
  font-size: 12px !important;
  opacity: 0.7;
}

.preview-view__pseudo-btn {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid var(--toolbar-primary-bg, #ff2d78);
  border-radius: 6px;
  background: transparent;
  color: var(--toolbar-primary-bg, #ff2d78);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-normal), color var(--transition-normal);
}

.preview-view__pseudo-btn:hover {
  background: var(--toolbar-primary-bg, #ff2d78);
  color: #fff;
}

.preview-view__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(0, 0, 0, 0.15);
}

.preview-view__progress-bar {
  height: 100%;
  background: var(--toolbar-primary-bg);
  transition: width var(--transition-slow);
  border-radius: 0 2px 2px 0;
}

</style>
