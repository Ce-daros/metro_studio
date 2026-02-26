/**
 * Timeline Preview Engine — state machine and rendering logic.
 *
 * Encapsulates all internal state, animation phases, camera tracking,
 * and rendering orchestration for the timeline preview.
 *
 * State machine: idle → loading → playing → idle
 */

import { TileCache, renderTiles, lngLatToPixel } from './timelineTileRenderer'
import { buildTimelineAnimationPlan, buildPseudoTimelineAnimationPlan, slicePolylineByProgress } from './timelineAnimationPlan'
import {
  computeGeoCamera,
  computeStatsForYear,
  easeOutCubic,
  easeOutBack,
  loadSourceHanSans,
  renderOverlayBranding,
  renderOverlayEvent,
  renderOverlayLineInfo,
  renderOverlayYear,
  renderPrevEdges,
  renderStations,
  renderTipGlow,
  renderScanLineLoading,
} from './timelineCanvasRenderer'
import { collectBounds, buildContinuousPlan } from './timelinePreviewBounds'

const MS_PER_KM = 1600 // 1.6 seconds per kilometer at 1x speed
const MIN_TOTAL_DRAW_MS = 3000 // minimum total draw time to avoid ultra-short animations
const MAX_TOTAL_DRAW_MS = 300000 // 5 minute cap

export class TimelinePreviewEngine {
  /**
   * @param {Object} params
   * @param {HTMLCanvasElement} params.canvas
   * @param {Object} params.project
   * @param {string} params.title
   * @param {string} params.author
   * @param {boolean} params.pseudoMode
   * @param {'dark'|'light'} [params.basemapMode]
   * @param {Function} [params.onStateChange]
   * @param {Function} [params.onYearChange]
   */
  constructor({ canvas, project, title, author, pseudoMode, basemapMode = 'light', onStateChange, onYearChange }) {
    this._canvas = canvas
    this._project = project
    this._title = title
    this._author = author
    this._pseudoMode = pseudoMode
    this._basemapMode = basemapMode === 'dark' ? 'dark' : 'light'
    this._onStateChange = onStateChange
    this._onYearChange = onYearChange

    this._speed = 1.5
    this._zoomOffset = 2.5
    this._state = 'idle'
    this._rafId = null
    this._phaseStart = 0

    // Timeline data
    this._years = []
    this._eventMap = new Map()
    this._lineLabels = new Map()
    this._animationPlan = null
    this._continuousPlan = null
    this._currentYearIndex = 0

    // Geographic data
    this._tileCache = new TileCache(this._basemapMode)
    this._stationMap = new Map()
    this._lineMap = new Map()
    this._fullBounds = null

    // Camera — tip-tracking system
    this._camera = { centerLng: 116.99, centerLat: 36.65, zoom: 11 }
    this._fullCamera = null
    this._smoothCamera = null
    this._lastFrameTime = 0
    this._CAMERA_SMOOTH_HALF_LIFE = 800

    // Station pop-in & interchange morph
    this._stationAnimState = new Map()
    this._STATION_POP_DURATION = 0.005
    this._STATION_LABEL_DELAY = 0.0017
    this._STATION_LABEL_DURATION = 0.0033
    this._INTERCHANGE_MORPH_DURATION = 0.004

    // Year transition animation
    this._prevYearLabel = null
    this._yearTransitionT = 1
    this._yearTransitionStart = 0
    this._YEAR_TRANSITION_DURATION = 0.0075
    this._yearPauseUntil = 0
    this._yearPauseLastIndex = -1
    this._pauseLastLineId = null
    this._isLinePaused = false
    // Camera travel phase (after hold, before new line draws)
    this._camTravelUntil = 0
    this._camTravelFrom = null
    this._camTravelStart = 0
    this._camTravelTarget = null

    // Outro: holdLast → zoomOut → holdFull → idle
    this._outroPhase = null
    this._outroStart = 0

    // Stats counting-up animation
    this._displayStats = null
    this._targetStats = null
    this._STATS_LERP_SPEED = 0.08

    // Per-line stats counting-up
    this._displayLineStats = new Map()
    this._targetLineStats = new Map()

    // Event banner slide-in
    this._bannerSlideT = 0
    this._bannerSlideYear = null
    this._bannerSlideStartTime = 0
    this._bannerSlideStartTime = 0
    this._BANNER_SLIDE_DURATION = 0.01

    // Tip glow pulse
    this._tipGlowPhase = 0

    // Loading animation state
    this._loadingProgress = { loaded: 0, total: 0 }
    this._loadingStartTime = 0
    this._loadingThemeColor = '#2563EB'
    this._loadingSmoothedProgress = 0
    this._loadingComplete = false
    this._loadingCompleteTime = 0
    this._lastLoadingFrameTime = 0

    // Canvas
    this._ctx = canvas.getContext('2d')
    this._logicalWidth = canvas.width
    this._logicalHeight = canvas.height
    this._dpr = window.devicePixelRatio || 1

    // Tile reload trigger
    this._tileCache.onTileLoaded = () => {
      if (this._state === 'idle' && this._fullBounds) {
        this._scheduleFrame()
      }
    }

    // Bind tick so it can be used as RAF callback
    this._tick = this._tick.bind(this)

    // Initialize
    this._buildData()
    loadSourceHanSans()
  }

  // ─── Canvas helpers ──────────────────────────────────────────

  _applyCanvasSize(w, h) {
    this._logicalWidth = w
    this._logicalHeight = h
    this._canvas.width = Math.round(w * this._dpr)
    this._canvas.height = Math.round(h * this._dpr)
    this._canvas.style.width = `${w}px`
    this._canvas.style.height = `${h}px`
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
  }

  // ─── Data preparation ──────────────────────────────────────────

  _buildData() {
    const project = this._project
    this._stationMap = new Map((project?.stations || []).map(s => [s.id, s]))
    this._lineMap = new Map((project?.lines || []).map(l => [l.id, l]))
    this._fullBounds = collectBounds(project)

    if (this._pseudoMode) {
      const pseudoPlan = buildPseudoTimelineAnimationPlan(project)
      this._years = pseudoPlan.years
      this._animationPlan = pseudoPlan
      this._lineLabels = pseudoPlan.lineLabels || new Map()
      this._eventMap = new Map()
    } else {
      this._eventMap = new Map()
      for (const evt of project?.timelineEvents || []) {
        this._eventMap.set(evt.year, evt.description)
      }

      this._lineLabels = new Map()
      this._animationPlan = buildTimelineAnimationPlan(project)
      this._years = this._animationPlan.years
    }

    this._continuousPlan = buildContinuousPlan(this._animationPlan, this._years)

    this._fullCamera = computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)
    this._camera = this._fullCamera
    this._smoothCamera = null

    // Prefetch tiles at multiple zoom levels
    if (this._fullBounds) {
      const baseZoom = Math.round(this._fullCamera.zoom)
      for (let z = baseZoom; z <= baseZoom + 4; z++) {
        this._tileCache.prefetchForBounds(this._fullBounds, z)
      }
    }
  }

  // ─── Timing helpers ─────────────────────────────────────────────

  _getTotalDrawMs() {
    const totalKm = (this._continuousPlan?.totalLengthMeters || 0) / 1000
    const baseMs = Math.max(MIN_TOTAL_DRAW_MS, Math.min(MAX_TOTAL_DRAW_MS, totalKm * MS_PER_KM))
    return baseMs / this._speed
  }

  // ─── Tip-tracking camera ──────────────────────────────────────

  _computeTipCamera(globalProgress) {
    const cp = this._continuousPlan
    if (!cp || !cp.segments.length) return this._fullCamera

    let tipLng = null, tipLat = null

    for (const seg of cp.segments) {
      if (seg.globalStart >= globalProgress) break
      if (globalProgress <= seg.globalStart) continue

      const pts = seg.waypoints
      if (!pts || pts.length < 2) continue

      const segSpan = seg.globalEnd - seg.globalStart
      if (segSpan <= 0) continue

      const localEnd = Math.min(1, (globalProgress - seg.globalStart) / segSpan)

      const idx = Math.min(Math.floor(localEnd * (pts.length - 1)), pts.length - 2)
      const frac = localEnd * (pts.length - 1) - idx
      tipLng = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * frac
      tipLat = pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * frac
    }

    if (tipLng == null) return this._fullCamera

    const fixedZoom = this._fullCamera.zoom + this._zoomOffset

    return {
      centerLng: tipLng,
      centerLat: tipLat,
      zoom: fixedZoom,
    }
  }

  _computeCameraAtProgress(globalProgress, now) {
    if (!this._continuousPlan?.segments?.length) {
      return this._fullCamera || computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)
    }

    const target = this._computeTipCamera(globalProgress)

    if (!this._smoothCamera || !this._lastFrameTime) {
      this._smoothCamera = { ...target }
      this._lastFrameTime = now || performance.now()
      return this._smoothCamera
    }

    const dt = Math.min((now || performance.now()) - this._lastFrameTime, 100)
    this._lastFrameTime = now || performance.now()
    const t = 1 - Math.pow(2, -dt / (this._CAMERA_SMOOTH_HALF_LIFE / this._speed))

    this._smoothCamera = {
      centerLng: this._smoothCamera.centerLng + (target.centerLng - this._smoothCamera.centerLng) * t,
      centerLat: this._smoothCamera.centerLat + (target.centerLat - this._smoothCamera.centerLat) * t,
      zoom: this._smoothCamera.zoom + (target.zoom - this._smoothCamera.zoom) * t,
    }

    return this._smoothCamera
  }

  // ─── Stats helpers ──────────────────────────────────────────────

  _findCurrentYear(globalProgress) {
    if (!this._continuousPlan?.yearMarkers?.length) return { year: null, index: 0 }
    let idx = 0
    for (let i = this._continuousPlan.yearMarkers.length - 1; i >= 0; i--) {
      if (globalProgress >= this._continuousPlan.yearMarkers[i].globalStart) {
        idx = i
        break
      }
    }
    return { year: this._continuousPlan.yearMarkers[idx].year, index: idx }
  }

  _computePseudoStats(yearPlan) {
    if (!yearPlan) return null
    const lineIds = new Set()
    const allEdges = [...(yearPlan.prevEdges || [])]
    for (const lp of yearPlan.lineDrawPlans || []) {
      lineIds.add(lp.lineId)
      for (const seg of lp.segments) {
        const edge = (this._project?.edges || []).find(e => e.id === seg.edgeId)
        if (edge) allEdges.push(edge)
      }
    }
    for (const e of allEdges) {
      for (const lid of e.sharedByLineIds || []) lineIds.add(lid)
    }
    let totalMeters = 0
    for (const e of allEdges) totalMeters += e.lengthMeters || 0
    return {
      lines: lineIds.size,
      stations: yearPlan.cumulativeStationIds?.size || 0,
      km: totalMeters / 1000,
    }
  }

  _computeStatsAtProgress(globalProgress) {
    const { year, index } = this._findCurrentYear(globalProgress)
    if (year == null) return null
    const marker = this._continuousPlan.yearMarkers[index]
    if (!marker?.yearPlan) return null
    return this._pseudoMode
      ? this._computePseudoStats(marker.yearPlan)
      : computeStatsForYear(this._project, year)
  }

  _computeLiveLineStats(globalProgress, yearMarkerIndex) {
    const cp = this._continuousPlan
    if (!cp?.segments?.length) return []
    const totalM = cp.totalLengthMeters
    const lineKm = new Map()
    const lineStations = new Map()
    const lineInfo = new Map()

    for (const seg of cp.segments) {
      if (seg.globalStart >= globalProgress) break
      if (!lineInfo.has(seg.lineId)) {
        const line = this._lineMap.get(seg.lineId)
        lineInfo.set(seg.lineId, { name: seg.nameZh || seg.lineId, color: seg.color || '#2563EB' })
        lineKm.set(seg.lineId, 0)
        lineStations.set(seg.lineId, new Set())
      }
      const segSpan = seg.globalEnd - seg.globalStart
      const segProgress = segSpan > 0 ? Math.min(1, (globalProgress - seg.globalStart) / segSpan) : 1
      const segM = (seg.globalEnd - seg.globalStart) * totalM
      lineKm.set(seg.lineId, lineKm.get(seg.lineId) + segM * segProgress)
      const stSet = lineStations.get(seg.lineId)
      if (segProgress >= 1) { stSet.add(seg.fromStationId); stSet.add(seg.toStationId) }
      else if (segProgress > 0) stSet.add(seg.fromStationId)
    }

    const orderedLineIds = (this._project?.lines || []).map(l => l.id)
    const result = []
    for (const lid of orderedLineIds) {
      if (lineInfo.has(lid)) {
        const info = lineInfo.get(lid)
        result.push({ lineId: lid, name: info.name, color: info.color, km: (lineKm.get(lid) || 0) / 1000, stations: lineStations.get(lid)?.size || 0 })
      }
    }
    return result
  }

  _computeCumulativeLineStats(yearMarkerIndex) {
    if (!this._continuousPlan?.yearMarkers?.length) return []
    const lineKm = new Map()
    const lineStations = new Map()
    const lineInfo = new Map()

    for (let i = 0; i <= yearMarkerIndex && i < this._continuousPlan.yearMarkers.length; i++) {
      const marker = this._continuousPlan.yearMarkers[i]
      const yp = marker?.yearPlan
      if (!yp) continue
      for (const lp of yp.lineDrawPlans) {
        if (!lineInfo.has(lp.lineId)) {
          const line = this._lineMap.get(lp.lineId)
          lineInfo.set(lp.lineId, {
            name: lp.nameZh || lp.nameEn || (line?.nameZh) || lp.lineId,
            color: lp.color || line?.color || '#2563EB',
          })
        }
        lineKm.set(lp.lineId, (lineKm.get(lp.lineId) || 0) + (lp.totalLength || 0))
        if (!lineStations.has(lp.lineId)) lineStations.set(lp.lineId, new Set())
        const stSet = lineStations.get(lp.lineId)
        for (const seg of lp.segments) {
          stSet.add(seg.fromStationId)
          stSet.add(seg.toStationId)
        }
      }
    }

    const orderedLineIds = (this._project?.lines || []).map(l => l.id)
    const result = []
    for (const lid of orderedLineIds) {
      if (lineInfo.has(lid)) {
        const info = lineInfo.get(lid)
        result.push({ lineId: lid, name: info.name, color: info.color, km: (lineKm.get(lid) || 0) / 1000, stations: lineStations.get(lid)?.size || 0 })
      }
    }
    for (const [lid, info] of lineInfo) {
      if (!result.find(r => r.lineId === lid)) {
        result.push({ lineId: lid, name: info.name, color: info.color, km: (lineKm.get(lid) || 0) / 1000, stations: lineStations.get(lid)?.size || 0 })
      }
    }
    return result
  }

  _getCurrentYearLineInfo(yearMarkerIndex, globalProgress) {
    if (!this._continuousPlan?.yearMarkers?.length) return null
    const marker = this._continuousPlan.yearMarkers[yearMarkerIndex]
    const yp = marker?.yearPlan
    if (!yp?.lineDrawPlans?.length) return null

    // Find the line currently being drawn based on globalProgress
    let activeLp = yp.lineDrawPlans[0]
    if (globalProgress != null) {
      const markerYearNum = typeof marker.year === 'object' ? marker.year.year : marker.year
      // 找到当前正在绘制的 segment
      let currentSeg = null
      for (const seg of this._continuousPlan.segments) {
        if (seg.globalStart <= globalProgress && seg.globalEnd > globalProgress) {
          if (seg.year === markerYearNum) {
            currentSeg = seg
            break
          }
        }
      }
      // 如果找到了当前正在绘制的 segment，使用它的线路
      if (currentSeg) {
        activeLp = yp.lineDrawPlans.find(lp => lp.lineId === currentSeg.lineId) || activeLp
      } else {
        // 否则找到这一年最后绘制的 segment
        for (const seg of this._continuousPlan.segments) {
          if (seg.globalStart > globalProgress) break
          if (seg.year === markerYearNum) {
            activeLp = yp.lineDrawPlans.find(lp => lp.lineId === seg.lineId) || activeLp
          }
        }
      }
    }

    let totalNewKm = 0
    for (const lp of yp.lineDrawPlans) totalNewKm += (lp.totalLength || 0) / 1000

    return {
      nameZh: activeLp.nameZh || '',
      nameEn: activeLp.nameEn || '',
      color: activeLp.color || '#2563EB',
      phase: activeLp.phase || '',
      deltaKm: totalNewKm,
      activeLineId: activeLp.lineId,
      intervalFrom: activeLp.intervalFrom || '',
      intervalTo: activeLp.intervalTo || '',
    }
  }

  // ─── State transitions ─────────────────────────────────────────

  _setState(next) {
    if (this._state === next) return
    this._state = next
    this._onStateChange?.(this._state, {
      year: this._years[this._currentYearIndex] ?? null,
      yearIndex: this._currentYearIndex,
      totalYears: this._years.length,
    })
  }

  _startPlaying(now) {
    this._currentYearIndex = 0
    this._phaseStart = now
    this._lastPlayingTick = now
    this._yearPauseUntil = 0
    this._yearPauseLastIndex = -1
    this._yearPauseProgress = 0
    this._pauseLastLineId = null
    this._isLinePaused = false
    this._camTravelUntil = 0
    this._camTravelFrom = null
    this._camTravelStart = 0
    this._camTravelTarget = null
    this._outroPhase = null
    this._outroStart = 0
    this._outroCamFrom = null
    this._smoothCamera = null
    this._stationAnimState.clear()
    this._lineFirstSeen = new Map()
    this._prevYearLabel = null
    this._yearTransitionT = 1
    this._displayStats = null
    this._targetStats = null
    this._displayLineStats = new Map()
    this._targetLineStats = new Map()
    this._bannerSlideT = 0
    this._bannerSlideYear = null
    this._bannerSlideStartTime = 0
    this._tipGlowPhase = 0
    this._setState('playing')
    this._emitYearChange()
  }

  _emitYearChange() {
    this._onYearChange?.(this._years[this._currentYearIndex], this._currentYearIndex, this._years.length)
  }

  // ─── Continuous rendering ───────────────────────────────────────

  /**
   * Render the network at a given global draw progress (0..1).
   * Draws all segments up to the progress point as a single continuous stroke.
   * Orchestrates all animation state: station pop-in, interchange morph,
   * year transition, stats counting, event banner slide-in, tip glow.
   */
  _renderContinuousFrame(globalProgress, now) {
    const cp = this._continuousPlan
    if (!cp || !cp.segments.length) return

    // Dynamic camera: track drawing tip (skip during outro zoom and line pause)
    if ((!this._outroPhase || this._outroPhase === 'holdLast') && !this._isLinePaused) {
      this._camera = this._computeCameraAtProgress(globalProgress, now)
    }

    // Tiles
    renderTiles(this._ctx, this._camera, this._logicalWidth, this._logicalHeight, this._tileCache)

    const lw = Math.max(2, 3.5 * Math.pow(2, (this._camera.zoom - 12) * 0.45))

    // Track the drawing tip for glow effect
    let tipLng = null, tipLat = null
    let tipColor = '#2563EB'

    // Draw all segments: fully drawn ones + the currently animating one
    for (const seg of cp.segments) {
      if (globalProgress <= seg.globalStart) break

      const segSpan = seg.globalEnd - seg.globalStart
      let segProgress = 1
      if (segSpan > 0 && globalProgress < seg.globalEnd) {
        segProgress = Math.max(0, Math.min(1, (globalProgress - seg.globalStart) / segSpan))
      }

      let points = seg.waypoints
      if (segProgress < 1) {
        const sliced = slicePolylineByProgress(seg.waypoints, segProgress)
        points = sliced.points
        if (sliced.tipPoint) {
          tipLng = sliced.tipPoint[0]
          tipLat = sliced.tipPoint[1]
          tipColor = seg.color
        }
      } else {
        const lastPt = seg.waypoints[seg.waypoints.length - 1]
        if (lastPt) {
          tipLng = lastPt[0]
          tipLat = lastPt[1]
          tipColor = seg.color
        }
      }

      if (points.length >= 2) {
        this._drawGeoPolyline(this._ctx, points, this._camera, this._logicalWidth, this._logicalHeight, seg.color, lw, 1)
      }
    }

    // ─── Tip glow effect (disabled) ─────────────────────────

    // ─── Update station animation state ──────────────────────
    const stationLineIds = new Map()
    for (const seg of cp.segments) {
      if (globalProgress < seg.globalStart) break
      const segDone = globalProgress >= seg.globalEnd
      if (globalProgress >= seg.globalStart) {
        if (!stationLineIds.has(seg.fromStationId)) stationLineIds.set(seg.fromStationId, new Set())
        stationLineIds.get(seg.fromStationId).add(seg.lineId)
      }
      if (segDone) {
        if (!stationLineIds.has(seg.toStationId)) stationLineIds.set(seg.toStationId, new Set())
        stationLineIds.get(seg.toStationId).add(seg.lineId)
      }
    }

    const revealedIds = new Set()
    for (const reveal of cp.stationReveals) {
      if (globalProgress < reveal.triggerProgress) continue
      const sid = reveal.stationId
      revealedIds.add(sid)

      const elapsed = globalProgress - reveal.triggerProgress

      if (!this._stationAnimState.has(sid)) {
        this._stationAnimState.set(sid, { popT: 0, interchangeT: 0, labelAlpha: 0, lineCount: 0 })
      }
      const anim = this._stationAnimState.get(sid)

      if (globalProgress >= 1 || this._isLinePaused) {
        anim.popT = 1
        anim.labelAlpha = 1
      } else {
        anim.popT = Math.min(1, elapsed / this._STATION_POP_DURATION)
        const labelElapsed = elapsed - this._STATION_LABEL_DELAY
        anim.labelAlpha = labelElapsed > 0 ? Math.min(1, labelElapsed / this._STATION_LABEL_DURATION) : 0
      }

      const currentLineCount = stationLineIds.get(sid)?.size || 0
      if (currentLineCount >= 2 && anim.lineCount < 2) {
        anim.interchangeMorphStart = globalProgress
      }
      anim.lineCount = currentLineCount

      if (anim.interchangeMorphStart != null) {
        const morphElapsed = globalProgress - anim.interchangeMorphStart
        anim.interchangeT = Math.min(1, morphElapsed / this._INTERCHANGE_MORPH_DURATION)
      } else {
        anim.interchangeT = 0
      }
    }

    // Hide station labels during zoomOut and holdFull phases
    const hideLabels = this._outroPhase === 'zoomOut' || this._outroPhase === 'holdFull'
    renderStations(this._ctx, revealedIds, this._camera, this._logicalWidth, this._logicalHeight, this._stationMap, {
      alpha: 0.9,
      stationAnimState: this._stationAnimState,
      showLabels: !hideLabels,
    })

    // ─── Overlays ───────────────────────────────────────────────
    const { year, index } = this._findCurrentYear(globalProgress)
    if (year != null && year !== this._years[this._currentYearIndex]) {
      this._currentYearIndex = index
      this._emitYearChange()
    }

    // Format year label (only show year, not phase)
    const yearLabel = this._pseudoMode
      ? (this._lineLabels.get(year)?.nameZh || `#${year}`)
      : (typeof year === 'object' && year !== null
          ? `${year.year}`
          : `${year}`)

    // Year transition animation
    if (yearLabel !== this._prevYearLabel && this._prevYearLabel != null) {
      this._yearTransitionStart = globalProgress
      this._yearTransitionT = 0
    }
    if (this._yearTransitionT < 1) {
      this._yearTransitionT = Math.min(1, (globalProgress - this._yearTransitionStart) / this._YEAR_TRANSITION_DURATION)
    }
    const savedPrevYear = (this._yearTransitionT < 1) ? this._prevYearLabel : null
    if (yearLabel !== this._prevYearLabel) {
      this._prevYearLabel = yearLabel
    }

    // Stats counting-up animation — computed live from drawn segments
    const cumulativeLineStats = this._computeLiveLineStats(globalProgress, index)
    const rawStats = cumulativeLineStats.length > 0 ? {
      km: cumulativeLineStats.reduce((s, e) => s + e.km, 0),
      stations: cumulativeLineStats.reduce((s, e) => s + e.stations, 0),
      lines: cumulativeLineStats.length,
    } : this._computeStatsAtProgress(globalProgress)
    if (rawStats) {
      this._displayStats = rawStats
    }

    const overlayAlpha = globalProgress < 0.01 ? globalProgress / 0.01 : globalProgress > 0.99 ? (1 - globalProgress) / 0.01 : 1

    // Year + Stats (bottom-left block)
    renderOverlayYear(this._ctx, yearLabel, overlayAlpha, this._logicalWidth, this._logicalHeight, {
      stats: rawStats,
      displayStats: this._displayStats || rawStats,
      yearTransition: this._yearTransitionT,
      prevYear: savedPrevYear,
    })
    renderOverlayBranding(this._ctx, this._title, this._author, overlayAlpha, this._logicalWidth, this._logicalHeight)

    // Current year marker
    const curMarker = this._continuousPlan.yearMarkers[index]

    // Compute yearLocalT for banner alpha and line card animation
    let yearLocalT = 0
    if (curMarker) {
      const nextMarker = this._continuousPlan.yearMarkers[index + 1]
      const yearEnd = nextMarker ? nextMarker.globalStart : 1
      const yearSpan = yearEnd - curMarker.globalStart
      yearLocalT = yearSpan > 0 ? (globalProgress - curMarker.globalStart) / yearSpan : 0
    }

    // Event banner slide-in (wall-clock driven)
    if (curMarker) {
      const eventText = this._eventMap.get(year)
      const lineInfo = this._getCurrentYearLineInfo(index, globalProgress)
      const bannerKey = `${year}:${lineInfo?.activeLineId}`
      if (this._bannerSlideYear !== bannerKey) {
        this._bannerSlideYear = bannerKey
        this._bannerSlideStartTime = now
      }
      const BANNER_SLIDE_MS = 350
      const bannerElapsed = now - (this._bannerSlideStartTime || now)
      this._bannerSlideT = Math.min(1, bannerElapsed / BANNER_SLIDE_MS)
      // Fade out near end of year
      if (yearLocalT > 0.925) {
        this._bannerSlideT = Math.min(this._bannerSlideT, Math.max(0, (1 - yearLocalT) / 0.075))
      }
      const yearNum = typeof year === 'object' ? year.year : year
      const lineColor = lineInfo?.color || this._continuousPlan.segments.find(s => s.year === yearNum)?.color || '#2563EB'

      renderOverlayEvent(this._ctx, eventText || null, lineColor, overlayAlpha, this._logicalWidth, this._logicalHeight, {
        nameZh: lineInfo?.nameZh || '',
        nameEn: lineInfo?.nameEn || '',
        phase: lineInfo?.phase || '',
        deltaKm: (lineInfo?.activeLineId && cumulativeLineStats.find(e => e.lineId === lineInfo.activeLineId)?.km) || lineInfo?.deltaKm || 0,
        slideT: this._bannerSlideT,
        intervalFrom: lineInfo?.intervalFrom || '',
        intervalTo: lineInfo?.intervalTo || '',
      })
    }

    // Compute per-line appearance progress for slide-in animation (wall-clock driven)
    const lineAppearProgress = new Map()
    const APPEAR_MS = 400 // milliseconds for the slide-in animation
    for (let i = 0; i <= index && i < this._continuousPlan.yearMarkers.length; i++) {
      const marker = this._continuousPlan.yearMarkers[i]
      for (const lp of marker.yearPlan.lineDrawPlans) {
        if (i < index) {
          lineAppearProgress.set(lp.lineId, 1)
        } else {
          // Record wall-clock time when this line first appears
          if (!this._lineFirstSeen.has(lp.lineId)) {
            const markerYearNum = typeof marker.year === 'object' ? marker.year.year : marker.year
            const firstSeg = this._continuousPlan.segments.find(s => s.lineId === lp.lineId && s.year === markerYearNum)
            if (firstSeg && globalProgress >= firstSeg.globalStart) {
              this._lineFirstSeen.set(lp.lineId, now)
            }
          }
          const seenAt = this._lineFirstSeen.get(lp.lineId)
          if (seenAt == null) {
            lineAppearProgress.set(lp.lineId, 0)
          } else {
            lineAppearProgress.set(lp.lineId, easeOutCubic(Math.min((now - seenAt) / APPEAR_MS, 1)))
          }
        }
      }
    }

    // Per-line stats — reuse cumulativeLineStats already computed above
    for (const entry of cumulativeLineStats) {
      if (!this._displayLineStats.has(entry.lineId)) {
        this._displayLineStats.set(entry.lineId, { km: 0, stations: 0 })
      }
      const disp = this._displayLineStats.get(entry.lineId)
      disp.km = entry.km
      disp.stations = entry.stations
    }

    // Bottom-left line cards with slide-in + counting stats + stats pills
    if (cumulativeLineStats.length > 0) {
      renderOverlayLineInfo(this._ctx, curMarker?.yearPlan, rawStats, overlayAlpha, this._logicalWidth, this._logicalHeight, {
        cumulativeLineStats,
        lineAppearProgress,
        displayLineStats: this._displayLineStats,
        displayStats: this._displayStats || rawStats,
      })
    }
  }

  /** Draw a single polyline in geographic coordinates. */
  _drawGeoPolyline(ctx2d, points, cam, width, height, color, lineWidth, alpha) {
    if (!points || points.length < 2) return
    ctx2d.save()
    ctx2d.globalAlpha = alpha
    ctx2d.strokeStyle = color
    ctx2d.lineWidth = lineWidth
    ctx2d.lineCap = 'round'
    ctx2d.lineJoin = 'round'
    ctx2d.setLineDash([])
    ctx2d.beginPath()
    const [sx, sy] = lngLatToPixel(points[0][0], points[0][1], cam, width, height)
    ctx2d.moveTo(sx, sy)
    for (let i = 1; i < points.length; i++) {
      const [px, py] = lngLatToPixel(points[i][0], points[i][1], cam, width, height)
      ctx2d.lineTo(px, py)
    }
    ctx2d.stroke()
    ctx2d.restore()
  }

  // ─── Rendering tick ────────────────────────────────────────────

  _tick(now) {
    this._rafId = null

    if (this._state === 'idle') {
      this._renderIdleFrame()
      return
    }

    if (this._state === 'loading') {
      this._tickLoading(now)
      this._scheduleFrame()
      return
    }

    if (this._state === 'playing') {
      this._tickPlaying(now)
      this._scheduleFrame()
      return
    }
  }

  _tickPlaying(now) {
    // ── Outro phases: holdLast → zoomOut → holdFull → idle ──
    if (this._outroPhase) {
      const elapsed = now - this._outroStart
      if (this._outroPhase === 'holdLast') {
        this._renderContinuousFrame(1, now)
        if (elapsed > 1500) { this._outroPhase = 'zoomOut'; this._outroStart = now }
      } else if (this._outroPhase === 'zoomOut') {
        if (!this._outroCamFrom) this._outroCamFrom = { ...this._smoothCamera || this._camera }
        const t = Math.min(1, elapsed / 2000)
        const ease = t * t * (3 - 2 * t)
        const fc = this._fullCamera
        if (fc && this._outroCamFrom) {
          this._camera = this._smoothCamera = {
            centerLng: this._outroCamFrom.centerLng + (fc.centerLng - this._outroCamFrom.centerLng) * ease,
            centerLat: this._outroCamFrom.centerLat + (fc.centerLat - this._outroCamFrom.centerLat) * ease,
            zoom: this._outroCamFrom.zoom + (fc.zoom - this._outroCamFrom.zoom) * ease,
          }
        }
        this._renderContinuousFrame(1, now)
        if (t >= 1) { this._outroPhase = 'holdFull'; this._outroStart = now }
      } else if (this._outroPhase === 'holdFull') {
        this._renderContinuousFrame(1, now)
        if (elapsed > 2000) {
          this._outroPhase = null
          this._setState('idle')
          this._renderIdleFrame()
        }
      }
      return
    }

    // Pause between years: freeze progress while paused
    if (this._yearPauseUntil > now) {
      this._phaseStart += now - this._lastPlayingTick
      this._lastPlayingTick = now
      this._renderContinuousFrame(this._yearPauseProgress, now)
      return
    }
    // Pause just ended: compensate the sub-frame gap (lastPlayingTick → deadline)
    if (this._yearPauseUntil > 0 && this._camTravelUntil <= 0) {
      const gap = this._yearPauseUntil - this._lastPlayingTick
      if (gap > 0) this._phaseStart += gap
      this._lastPlayingTick = this._yearPauseUntil
      this._yearPauseUntil = 0
    }

    // Camera travel phase: after hold, pan to next line's start before drawing resumes
    if (this._camTravelUntil > now) {
      this._phaseStart += now - this._lastPlayingTick
      this._lastPlayingTick = now
      if (!this._camTravelFrom) {
        this._camTravelFrom = { ...this._smoothCamera || this._camera }
        this._camTravelStart = now
      }
      const camTravelMs = this._camTravelUntil - this._camTravelStart
      const t = camTravelMs > 0 ? Math.min(1, (now - this._camTravelStart) / camTravelMs) : 1
      // Use easeInOutCubic for smoother camera movement
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const from = this._camTravelFrom
      const to = this._camTravelTarget
      if (from && to) {
        this._camera = this._smoothCamera = {
          centerLng: from.centerLng + (to.centerLng - from.centerLng) * ease,
          centerLat: from.centerLat + (to.centerLat - from.centerLat) * ease,
          zoom: from.zoom + (to.zoom - from.zoom) * ease,
        }
      }
      this._renderContinuousFrame(this._yearPauseProgress, now)
      return
    }
    // Camera travel just ended: compensate the sub-frame gap between the last
    // compensated tick and the travel deadline. Without this, ~1 frame leaks per
    // line-switch, accumulating into premature completion at high speeds.
    if (this._camTravelUntil > 0) {
      const gap = this._camTravelUntil - this._lastPlayingTick
      if (gap > 0) this._phaseStart += gap
      this._lastPlayingTick = this._camTravelUntil
      this._camTravelUntil = 0
    }
    this._isLinePaused = false
    this._lastPlayingTick = now

    const totalMs = this._getTotalDrawMs()
    const elapsed = now - this._phaseStart
    const rawProgress = elapsed / totalMs

    if (rawProgress >= 1) {
      this._renderContinuousFrame(1, now)
      this._outroPhase = 'holdLast'
      this._outroStart = now
      return
    }

    // Detect line change (across or within years) and pause + camera travel
    const { index } = this._findCurrentYear(rawProgress)
    // Find the lineId currently being drawn
    let curLineId = null
    let curLineFirstSeg = null
    for (const seg of this._continuousPlan.segments) {
      if (seg.globalStart > rawProgress) break
      if (seg.lineId !== curLineId) {
        curLineId = seg.lineId
        curLineFirstSeg = seg
      }
    }

    if (curLineId && this._pauseLastLineId && curLineId !== this._pauseLastLineId) {
      // Freeze: use a progress slightly past the boundary so last station is revealed
      const freezeProgress = curLineFirstSeg ? curLineFirstSeg.globalStart + 1e-4 : rawProgress
      this._isLinePaused = true

      // Calculate pause duration based on line length
      // Short lines need more time to read the info
      // Pause/travel durations are constant regardless of playback speed
      const MIN_PAUSE_MS = 1200
      const BASE_PAUSE_MS = 800
      const LINE_LENGTH_THRESHOLD_MS = 3000

      const continuousPlan = this._continuousPlan
      const lineSegments = continuousPlan?.segments?.filter(s => s.lineId === this._pauseLastLineId) || []
      const lineDurationMs = lineSegments.length * (this._getTotalDrawMs() / continuousPlan?.segments?.length || 1000)

      const currentYearIndex = this._findCurrentYear(rawProgress).index
      const prevYearIndex = this._yearPauseLastIndex
      const sameYear = currentYearIndex === prevYearIndex

      let pauseMs
      if (lineDurationMs < LINE_LENGTH_THRESHOLD_MS) {
        pauseMs = MIN_PAUSE_MS
        if (sameYear && lineDurationMs < 1500) {
          pauseMs = MIN_PAUSE_MS * 1.5
        }
      } else {
        pauseMs = BASE_PAUSE_MS
      }

      this._yearPauseUntil = now + pauseMs
      this._yearPauseProgress = freezeProgress
      this._pauseLastLineId = curLineId
      this._yearPauseLastIndex = index
      this._phaseStart += (rawProgress - freezeProgress) * this._getTotalDrawMs()

      // Camera travel to new line's start
      const shouldMoveCamera = !sameYear || lineDurationMs >= 2000
      if (shouldMoveCamera && curLineFirstSeg?.waypoints?.length) {
        const CAM_TRAVEL_MS = 1200
        const [lng, lat] = curLineFirstSeg.waypoints[0]
        this._camTravelFrom = null
        this._camTravelTarget = { centerLng: lng, centerLat: lat, zoom: this._fullCamera.zoom + this._zoomOffset }
        this._camTravelUntil = this._yearPauseUntil + CAM_TRAVEL_MS
      } else {
        if (curLineFirstSeg?.waypoints?.length) {
          const CAM_TRAVEL_MS = 600
          const [lng, lat] = curLineFirstSeg.waypoints[0]
          this._camTravelFrom = null
          this._camTravelTarget = { centerLng: lng, centerLat: lat, zoom: this._fullCamera.zoom + this._zoomOffset }
          this._camTravelUntil = this._yearPauseUntil + CAM_TRAVEL_MS
        }
      }

      this._renderContinuousFrame(freezeProgress, now)
      return
    }
    this._pauseLastLineId = curLineId
    this._yearPauseLastIndex = index

    this._renderContinuousFrame(rawProgress, now)
  }

  /**
   * Tick the loading animation: smooth progress, render scan line, handle completion.
   */
  _tickLoading(now) {
    const elapsed = now - this._loadingStartTime
    const dt = this._lastLoadingFrameTime ? Math.min(now - this._lastLoadingFrameTime, 100) : 16
    this._lastLoadingFrameTime = now

    const { loaded, total } = this._tileCache.getProgress()
    this._loadingProgress = { loaded, total }
    // If no tiles to load, treat as 100% progress
    const rawProgress = total > 0 ? Math.min(1, loaded / total) : 1

    const smoothFactor = 1 - Math.pow(2, -dt / 400)
    const target = Math.max(this._loadingSmoothedProgress, rawProgress)
    this._loadingSmoothedProgress += (target - this._loadingSmoothedProgress) * smoothFactor

    // Notify Vue component of loading progress
    this._onStateChange?.(this._state, {
      year: this._years[this._currentYearIndex] ?? null,
      yearIndex: this._currentYearIndex,
      totalYears: this._years.length,
      loadingProgress: total > 0 ? { loaded, total } : { loaded: 1, total: 1 },
    })

    const scanY = this._loadingSmoothedProgress * this._logicalHeight

    renderScanLineLoading(this._ctx, this._logicalWidth, this._logicalHeight, {
      scanY,
      progress: this._loadingSmoothedProgress,
      themeColor: this._loadingThemeColor,
      elapsed,
      camera: this._fullCamera,
      tileCache: this._tileCache,
      renderTilesFn: renderTiles,
    })

    // Completion transition
    if (this._loadingComplete) {
      if (this._loadingSmoothedProgress >= 0.995) {
        this._loadingSmoothedProgress = 1

        if (this._loadingCompleteTime === 0) {
          this._loadingCompleteTime = now
        }

        if (now - this._loadingCompleteTime >= 300) {
          this._tileCache.stopProgressTracking()
          this._startPlaying(now)
          this._scheduleFrame()
          return
        }
      }
    }
  }

  _renderIdleFrame() {
    if (!this._fullBounds) {
      this._ctx.fillStyle = '#e8ecf0'
      this._ctx.fillRect(0, 0, this._logicalWidth, this._logicalHeight)
      return
    }
    const cam = computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)
    renderTiles(this._ctx, cam, this._logicalWidth, this._logicalHeight, this._tileCache)

    const allEdges = this._pseudoMode
      ? (this._project?.edges || [])
      : (this._project?.edges || []).filter(e => e.openingYear != null)
    renderPrevEdges(this._ctx, allEdges, cam, this._logicalWidth, this._logicalHeight, this._stationMap, this._lineMap)
    const allStationIds = new Set()
    for (const e of allEdges) {
      allStationIds.add(e.fromStationId)
      allStationIds.add(e.toStationId)
    }
    renderStations(this._ctx, allStationIds, cam, this._logicalWidth, this._logicalHeight, this._stationMap)
    renderOverlayBranding(this._ctx, this._title, this._author, 0.4, this._logicalWidth, this._logicalHeight)
  }

  _scheduleFrame() {
    if (this._rafId != null) return
    this._rafId = requestAnimationFrame(this._tick)
  }

  _cancelFrame() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  // ─── Tile pre-caching ──────────────────────────────────────────

  _precacheTilesForAnimation() {
    if (!this._continuousPlan?.segments?.length || !this._fullBounds) return Promise.resolve()

    // Pre-calculate all needed tile keys for accurate progress
    const allKeys = new Set()
    const sampleCount = 30
    for (let i = 0; i <= sampleCount; i++) {
      const progress = i / sampleCount
      const cam = this._computeTipCamera(progress)
      const z = Math.round(Math.max(0, Math.min(18, cam.zoom)))
      const halfLng = 0.02 * Math.pow(2, 12 - cam.zoom)
      const halfLat = 0.015 * Math.pow(2, 12 - cam.zoom)
      const viewBounds = {
        minLng: cam.centerLng - halfLng,
        maxLng: cam.centerLng + halfLng,
        minLat: cam.centerLat - halfLat,
        maxLat: cam.centerLat + halfLat,
      }
      this._tileCache.collectTileKeysForBounds(viewBounds, z, allKeys)
      if (z > 0) this._tileCache.collectTileKeysForBounds(viewBounds, z - 1, allKeys)
      if (z < 18) this._tileCache.collectTileKeysForBounds(viewBounds, z + 1, allKeys)
    }
    const baseZoom = Math.round(this._fullCamera.zoom)
    for (let z = baseZoom; z <= baseZoom + 4; z++) {
      this._tileCache.collectTileKeysForBounds(this._fullBounds, z, allKeys)
    }

    this._tileCache.startProgressTracking((loaded, total) => {
      this._loadingProgress = { loaded, total }
      this._onStateChange?.(this._state, {
        year: this._years[this._currentYearIndex] ?? null,
        yearIndex: this._currentYearIndex,
        totalYears: this._years.length,
        loadingProgress: { loaded, total },
      })
    }, allKeys.size)

    const promises = []
    for (let i = 0; i <= sampleCount; i++) {
      const progress = i / sampleCount
      const cam = this._computeTipCamera(progress)
      const z = Math.round(Math.max(0, Math.min(18, cam.zoom)))
      const halfLng = 0.02 * Math.pow(2, 12 - cam.zoom)
      const halfLat = 0.015 * Math.pow(2, 12 - cam.zoom)
      const viewBounds = {
        minLng: cam.centerLng - halfLng,
        maxLng: cam.centerLng + halfLng,
        minLat: cam.centerLat - halfLat,
        maxLat: cam.centerLat + halfLat,
      }
      promises.push(this._tileCache.prefetchForBounds(viewBounds, z))
      if (z > 0) promises.push(this._tileCache.prefetchForBounds(viewBounds, z - 1))
      if (z < 18) promises.push(this._tileCache.prefetchForBounds(viewBounds, z + 1))
    }
    for (let z = baseZoom; z <= baseZoom + 4; z++) {
      promises.push(this._tileCache.prefetchForBounds(this._fullBounds, z))
    }

    return Promise.all(promises)
  }

  // ─── Public API ────────────────────────────────────────────────

  play() {
    if (!this._years.length) return
    if (this._state === 'playing') return

    this._buildData()
    this._camera = this._fullCamera || computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)

    // Extract theme color from first line segment for scan-line glow
    if (this._continuousPlan?.segments?.length) {
      this._loadingThemeColor = this._continuousPlan.segments[0].color || '#2563EB'
    } else {
      this._loadingThemeColor = '#2563EB'
    }

    // Reset loading animation state
    this._loadingProgress = { loaded: 0, total: 0 }
    this._loadingStartTime = performance.now()
    this._loadingSmoothedProgress = 0
    this._loadingComplete = false
    this._loadingCompleteTime = 0
    this._lastLoadingFrameTime = 0

    this._setState('loading')
    this._scheduleFrame()

    // Collect all text that will be rendered on canvas so font subsets are downloaded
    const project = this._project
    const textParts = []
    for (const s of project?.stations || []) {
      if (s.nameZh) textParts.push(s.nameZh)
      if (s.nameEn) textParts.push(s.nameEn)
    }
    for (const l of project?.lines || []) {
      if (l.nameZh) textParts.push(l.nameZh)
      if (l.nameEn) textParts.push(l.nameEn)
    }
    for (const evt of project?.timelineEvents || []) {
      if (evt.description) textParts.push(evt.description)
    }
    const textHint = textParts.join('')

    Promise.all([
      loadSourceHanSans(textHint),
      this._precacheTilesForAnimation(),
    ]).then(() => {
      if (this._state !== 'loading') return
      this._tileCache.stopProgressTracking()
      this._loadingComplete = true
    })
  }

  skipLoading() {
    if (this._state !== 'loading') return
    this._tileCache.stopProgressTracking()
    this._loadingComplete = true
    this._loadingSmoothedProgress = 1
    this._loadingCompleteTime = 0
  }

  pause() {
    if (this._state === 'loading') {
      this._cancelFrame()
      this._tileCache.stopProgressTracking()
      this._setState('idle')
      this._renderIdleFrame()
      return
    }
    if (this._state !== 'playing') return
    this._cancelFrame()
    this._setState('idle')
  }

  stop() {
    if (this._state === 'loading') {
      this._tileCache.stopProgressTracking()
    }
    this._cancelFrame()
    this._currentYearIndex = 0
    this._outroPhase = null
    this._outroCamFrom = null
    this._smoothCamera = null
    this._camera = this._fullCamera || computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)
    this._setState('idle')
    this._renderIdleFrame()
  }

  seekToYear(year) {
    const idx = this._years.indexOf(year)
    if (idx === -1 || !this._continuousPlan?.yearMarkers?.length) return
    this._currentYearIndex = idx

    const marker = this._continuousPlan.yearMarkers[idx]
    const nextMarker = this._continuousPlan.yearMarkers[idx + 1]
    const yearEnd = nextMarker ? nextMarker.globalStart : 1
    this._smoothCamera = null
    this._renderContinuousFrame(yearEnd, performance.now())
    this._emitYearChange()
  }

  setSpeed(s) {
    const num = Number(s)
    if (Number.isFinite(num) && num > 0) this._speed = num
  }

  setZoomOffset(v) {
    const num = Number(v)
    if (Number.isFinite(num)) this._zoomOffset = num
  }

  setPseudoMode(v) { this._pseudoMode = Boolean(v) }

  setBasemapMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light'
    if (normalized === this._basemapMode) return
    this._basemapMode = normalized
    this._tileCache.setBasemapMode(normalized)

    if (this._state === 'loading') {
      this._loadingProgress = { loaded: 0, total: 0 }
      this._loadingSmoothedProgress = 0
      this._loadingComplete = false
      this._loadingCompleteTime = 0
      this._precacheTilesForAnimation().then(() => {
        if (this._state !== 'loading') return
        this._tileCache.stopProgressTracking()
        this._loadingComplete = true
      })
    }

    if (this._state === 'idle') {
      this._renderIdleFrame()
    } else {
      this._scheduleFrame()
    }
  }

  resize(w, h) {
    this._applyCanvasSize(w, h)
    if (this._fullBounds) {
      this._fullCamera = computeGeoCamera(this._fullBounds, this._logicalWidth, this._logicalHeight)
      this._smoothCamera = null
    }
    if (this._state === 'idle') this._renderIdleFrame()
  }

  rebuild() {
    this._buildData()
    if (this._state === 'idle') this._renderIdleFrame()
  }

  destroy() {
    this._cancelFrame()
    this._tileCache.stopProgressTracking()
    this._tileCache.onTileLoaded = null
    this._state = 'idle'
    this._tileCache.clear()
    this._animationPlan = null
    this._continuousPlan = null
    this._smoothCamera = null
    this._fullCamera = null
    this._years = []
    this._stationAnimState.clear()
    this._displayStats = null
    this._targetStats = null
    this._displayLineStats = new Map()
    this._targetLineStats = new Map()
    this._loadingComplete = false
    this._loadingProgress = { loaded: 0, total: 0 }
  }

  getState() {
    return {
      state: this._state,
      currentYear: this._years[this._currentYearIndex] ?? null,
      yearIndex: this._currentYearIndex,
      totalYears: this._years.length,
      speed: this._speed,
    }
  }

  getCurrentYear() {
    return this._years[this._currentYearIndex] ?? null
  }

  // ─── Read-only accessors ───────────────────────────────────────

  get state() { return this._state }
  get years() { return this._years }
  get currentYearIndex() { return this._currentYearIndex }
  get pseudoMode() { return this._pseudoMode }
  get lineLabels() { return this._lineLabels }
}
