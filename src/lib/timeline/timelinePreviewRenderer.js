/**
 * Real-time timeline preview renderer — geographic edition.
 *
 * Drives live playback on an OSM tile background using real lngLat
 * coordinates with CONTINUOUS line drawing from first station to last.
 *
 * This module is a thin factory that wires together:
 * - timelinePreviewBounds: geographic bounds collection & continuous plan building
 * - timelinePreviewStateMachine: the TimelinePreviewEngine class (state, rendering, camera)
 *
 * The factory preserves the original public API surface for backward compatibility.
 */

import { collectBounds, buildContinuousPlan } from './timelinePreviewBounds'
import { TimelinePreviewEngine } from './timelinePreviewStateMachine'

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} project
 * @param {Object} options
 */
export function createTimelinePreviewRenderer(canvas, project, options = {}) {
  const {
    title = project?.name || 'Metro Studio',
    author = '',
    pseudoMode: initialPseudoMode = false,
    basemapMode = 'light',
    onStateChange,
    onYearChange,
  } = options

  const engine = new TimelinePreviewEngine({
    canvas,
    project,
    title,
    author,
    pseudoMode: initialPseudoMode,
    basemapMode,
    onStateChange,
    onYearChange,
  })

  return {
    skipLoading: () => engine.skipLoading(),
    play: () => engine.play(),
    pause: () => engine.pause(),
    stop: () => engine.stop(),
    seekToYear: (year) => engine.seekToYear(year),
    setSpeed: (s) => engine.setSpeed(s),
    setZoomOffset: (v) => engine.setZoomOffset(v),
    setPseudoMode: (v) => engine.setPseudoMode(v),
    setBasemapMode: (v) => engine.setBasemapMode(v),
    resize: (w, h) => engine.resize(w, h),
    rebuild: () => engine.rebuild(),
    destroy: () => engine.destroy(),
    getState: () => engine.getState(),
    get state() { return engine.state },
    get years() { return engine.years },
    get currentYearIndex() { return engine.currentYearIndex },
    get pseudoMode() { return engine.pseudoMode },
    get lineLabels() { return engine.lineLabels },
  }
}

// Re-export sub-module helpers for direct access
export { collectBounds, buildContinuousPlan } from './timelinePreviewBounds'
export { TimelinePreviewEngine } from './timelinePreviewStateMachine'
