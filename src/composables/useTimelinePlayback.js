import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createTimelinePreviewRenderer } from '../lib/timeline/timelinePreviewRenderer'

/**
 * Composable that provides play/pause/stop/speed control, renderer lifecycle
 * management, and fullscreen toggle for the timeline preview.
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef - Ref to the container element
 * @param {import('vue').Ref<HTMLCanvasElement|null>} canvasRef - Ref to the canvas element
 * @param {Object} options
 * @param {import('vue').ComputedRef<boolean>} options.hasData - Whether the project has real timeline data
 * @param {import('vue').Ref<boolean>} options.active - Whether the view tab is currently active
 * @param {Object} options.store - The project store instance
 * @returns Playback state, controls, renderer helpers, and fullscreen toggle
 */
export function useTimelinePlayback(containerRef, canvasRef, { hasData, active, store }) {
  let renderer = null
  let resizeObserver = null

  const pseudoMode = ref(false)
  const playbackState = ref('idle')
  const currentYear = ref(null)
  const yearIndex = ref(0)
  const totalYears = ref(0)
  const playbackSpeed = ref(1.5)
  const zoomOffset = ref(1)
  const isFullscreen = ref(false)
  const loadingProgress = ref({ loaded: 0, total: 0 })

  const speedOptions = [1, 1.5, 2.5, 3,  5]

  /** Whether the project has edges (lines with geometry) at all -- needed for pseudo mode. */
  const hasEdges = computed(() => (store.project?.edges?.length || 0) > 0)

  /** Whether the project has multiple lines with edges -- pseudo mode needs at least 1 line with edges. */
  const canUsePseudoMode = computed(() => {
    if (!store.project) return false
    const edgeLineIds = new Set()
    for (const edge of store.project.edges || []) {
      for (const lid of edge.sharedByLineIds || []) edgeLineIds.add(lid)
    }
    return edgeLineIds.size > 0
  })

  /** Whether the toolbar should be shown (real data or active pseudo mode). */
  const showToolbar = computed(() => hasData.value || pseudoMode.value)

  /** Current year display label -- in pseudo mode, show line name from renderer. */
  const currentYearLabel = computed(() => {
    if (currentYear.value == null) return null
    // Format year only (without phase), regardless of whether year is an object or number
    const yearNum = typeof currentYear.value === 'object' ? currentYear.value.year : currentYear.value
    const formattedYear = `${yearNum}`
    if (!pseudoMode.value) return formattedYear
    const labels = renderer?.lineLabels
    if (labels && labels.has(currentYear.value)) {
      return labels.get(currentYear.value).nameZh
    }
    return `#${formattedYear}`
  })

  const progressPercent = computed(() => {
    if (playbackState.value === 'loading') {
      const { loaded, total } = loadingProgress.value
      if (total === 0) return 0
      return (loaded / total) * 100
    }
    if (totalYears.value <= 1) return 0
    return (yearIndex.value / (totalYears.value - 1)) * 100
  })

  // ── Renderer lifecycle ──

  function createRenderer() {
    if (!canvasRef.value || !store.project) return
    if (!hasData.value && !pseudoMode.value) return
    destroyRenderer()

    renderer = createTimelinePreviewRenderer(canvasRef.value, store.project, {
      title: store.project.name || 'Metro Studio',
      author: '',
      pseudoMode: pseudoMode.value,
      basemapMode: store.timelinePreviewBasemapMode,
      onStateChange(state, info) {
        playbackState.value = state
        if (info) {
          currentYear.value = info.year
          yearIndex.value = info.yearIndex
          totalYears.value = info.totalYears
          if (info.loadingProgress) {
            loadingProgress.value = info.loadingProgress
          }
        }
      },
      onYearChange(year, idx, total) {
        currentYear.value = year
        yearIndex.value = idx
        totalYears.value = total
      },
    })

    renderer.setSpeed(playbackSpeed.value)
    renderer.setZoomOffset(zoomOffset.value)

    // Initial sizing — ensure container is laid out first
    if (containerRef.value) {
      const rect = containerRef.value.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        renderer.resize(rect.width, rect.height)
      } else {
        // Fallback: use nextTick to ensure layout is complete
        Promise.resolve().then(() => {
          if (containerRef.value && renderer) {
            const newRect = containerRef.value.getBoundingClientRect()
            if (newRect.width > 0 && newRect.height > 0) {
              renderer.resize(newRect.width, newRect.height)
            }
          }
        })
      }
    }
  }

  function destroyRenderer() {
    if (renderer) {
      renderer.destroy()
      renderer = null
    }
  }

  // ── Playback controls ──

  function onPlay() {
    if (!renderer) createRenderer()
    renderer?.play()
  }

  function onPause() {
    renderer?.pause()
  }

  function onSkipLoading() {
    renderer?.skipLoading()
  }

  function onStop() {
    renderer?.stop()
  }

  function onSpeedChange(speed) {
    playbackSpeed.value = speed
    renderer?.setSpeed(speed)
  }

  function onZoomOffsetChange(offset) {
    zoomOffset.value = offset
    renderer?.setZoomOffset(offset)
  }

  /** Enter pseudo mode and start playback. */
  function startPseudoPreview() {
    pseudoMode.value = true
    destroyRenderer()
    createRenderer()
    // Delay play() to ensure renderer is fully initialized
    Promise.resolve().then(() => {
      renderer?.play()
    })
  }

  /** Exit pseudo mode and return to normal empty state. */
  function exitPseudoMode() {
    pseudoMode.value = false
    destroyRenderer()
    playbackState.value = 'idle'
    currentYear.value = null
    yearIndex.value = 0
    totalYears.value = 0
  }

  // ── Fullscreen ──

  async function toggleFullscreen() {
    if (!containerRef.value) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.value.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch { /* noop */ }
  }

  function onFullscreenChange() {
    isFullscreen.value = !!document.fullscreenElement
  }

  // ── Resize observer ──

  function setupResizeObserver() {
    if (!containerRef.value) return
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0 && renderer) {
          renderer.resize(width, height)
        }
      }
    })
    resizeObserver.observe(containerRef.value)
  }

  // ── Watchers ──

  // Pause rAF when view is not active
  watch(
    () => active.value,
    (isActive) => {
      if (isActive && (hasData.value || pseudoMode.value)) {
        if (!renderer) createRenderer()
      } else if (!isActive && renderer) {
        if (playbackState.value !== 'idle') {
          renderer.stop()
        }
      }
    },
  )

  // Rebuild when project data changes (edges, line names, colors, etc.)
  watch(
    () => [
      store.project?.edges?.length,
      store.project?.lines?.map(l => `${l.nameZh}|${l.nameEn}|${l.color}`).join(','),
    ],
    () => {
      if (active.value && renderer) {
        renderer.rebuild()
      }
    },
  )

  // When real timeline data appears, exit pseudo mode automatically
  watch(hasData, (has) => {
    if (has && pseudoMode.value) {
      pseudoMode.value = false
      destroyRenderer()
      createRenderer()
    }
  })

  watch(
    () => store.timelinePreviewBasemapMode,
    () => {
      if (!renderer) return
      destroyRenderer()
      createRenderer()
    },
  )

  // ── Lifecycle ──

  onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    setupResizeObserver()
    if (active.value && hasData.value) {
      createRenderer()
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    destroyRenderer()
  })

  return {
    pseudoMode,
    playbackState,
    currentYear,
    yearIndex,
    totalYears,
    playbackSpeed,
    zoomOffset,
    isFullscreen,
    speedOptions,
    hasEdges,
    canUsePseudoMode,
    showToolbar,
    currentYearLabel,
    progressPercent,
    loadingProgress,
    onPlay,
    onPause,
    onStop,
    onSkipLoading,
    onSpeedChange,
    onZoomOffsetChange,
    startPseudoPreview,
    exitPseudoMode,
    toggleFullscreen,
  }
}
