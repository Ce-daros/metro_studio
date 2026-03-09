import { createId } from '../../../lib/ids'
import { getEdgeSnapshotAtYear } from '../../../lib/edgeTimeline'

function normalizePosition(position) {
  if (position === 'after') return 'after'
  if (position === 'year_end') return 'year_end'
  return 'before'
}

function normalizeTimelineEvents(list = []) {
  const normalized = []
  const seenIds = new Set()
  const yearOrder = new Map()

  for (const raw of Array.isArray(list) ? list : []) {
    const year = Number(raw?.year)
    const description = String(raw?.description || '').trim()
    if (!Number.isFinite(year) || !description) continue

    let id = String(raw?.id || '').trim()
    if (!id || seenIds.has(id)) id = createId('timeline_evt')
    seenIds.add(id)

    const position = normalizePosition(raw?.position)
    const prevOrder = yearOrder.get(year) || 0
    const order = Number.isFinite(Number(raw?.order)) ? Number(raw.order) : prevOrder
    yearOrder.set(year, Math.max(prevOrder, order + 1))

    normalized.push({
      id,
      year,
      description,
      position,
      order,
    })
  }

  normalized.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    if (a.order !== b.order) return a.order - b.order
    return a.id.localeCompare(b.id)
  })
  return normalized
}

function ensureTimelineEventsProject(project) {
  if (!Array.isArray(project.timelineEvents)) {
    project.timelineEvents = []
  }
  project.timelineEvents = normalizeTimelineEvents(project.timelineEvents)
}

function normalizeTimelineYearDelays(list = []) {
  const rows = []
  for (const raw of Array.isArray(list) ? list : []) {
    const year = Number(raw?.year)
    if (!Number.isFinite(year)) continue
    const beforeMs = Math.max(0, Number(raw?.beforeMs || 0))
    const afterMs = Math.max(0, Number(raw?.afterMs || 0))
    rows.push({ year, beforeMs, afterMs })
  }
  rows.sort((a, b) => a.year - b.year)
  return rows
}

function ensureTimelineDelaysProject(project) {
  if (!Array.isArray(project.timelineYearDelays)) {
    project.timelineYearDelays = []
  }
  project.timelineYearDelays = normalizeTimelineYearDelays(project.timelineYearDelays)
}

const timelineActions = {
  setTimelineFilterYear(year) {
    const normalizedYear = year == null ? null : Number(year)
    this.timelineFilterYear = normalizedYear
    if (!this.project || normalizedYear == null) return

    const visibleEdgeIds = new Set()
    const visibleStationIds = new Set()
    for (const edge of this.project.edges || []) {
      const visibleEdge = getEdgeSnapshotAtYear(edge, normalizedYear)
      if (!visibleEdge) continue
      visibleEdgeIds.add(visibleEdge.id)
      visibleStationIds.add(visibleEdge.fromStationId)
      visibleStationIds.add(visibleEdge.toStationId)
    }

    if (Array.isArray(this.selectedEdgeIds) && this.selectedEdgeIds.length) {
      const nextEdgeIds = this.selectedEdgeIds.filter((edgeId) => visibleEdgeIds.has(edgeId))
      if (nextEdgeIds.length !== this.selectedEdgeIds.length) {
        this.selectedEdgeIds = nextEdgeIds
        this.selectedEdgeId = nextEdgeIds.length ? nextEdgeIds[nextEdgeIds.length - 1] : null
      }
    } else {
      this.selectedEdgeId = null
    }

    if (Array.isArray(this.selectedStationIds) && this.selectedStationIds.length) {
      const nextStationIds = this.selectedStationIds.filter((stationId) => visibleStationIds.has(stationId))
      if (nextStationIds.length !== this.selectedStationIds.length) {
        this.selectedStationIds = nextStationIds
      }
      if (!this.selectedStationIds.length) {
        this.selectedStationId = null
      } else if (!this.selectedStationIds.includes(this.selectedStationId)) {
        this.selectedStationId = this.selectedStationIds[this.selectedStationIds.length - 1]
      }
    } else {
      this.selectedStationId = null
    }

    if (this.selectedEdgeAnchor && !visibleEdgeIds.has(this.selectedEdgeAnchor.edgeId)) {
      this.selectedEdgeAnchor = null
    }
  },

  setTimelinePlaybackState(state) {
    if (!['idle', 'playing', 'paused'].includes(state)) return
    this.timelinePlayback.state = state
  },

  setTimelinePlaybackSpeed(speed) {
    const num = Number(speed)
    if (!Number.isFinite(num) || num <= 0) return
    this.timelinePlayback.speed = num
  },

  setTimelinePreviewBasemapMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light'
    this.timelinePreviewBasemapMode = normalized
    try {
      window.localStorage.setItem('railmap_timeline_preview_basemap_mode', normalized)
    } catch {}
  },

  addTimelineEvent(year, description, position = 'before') {
    if (!this.project) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    const text = String(description || '').trim()
    if (!text) return
    ensureTimelineEventsProject(this.project)
    const pos = normalizePosition(position)
    const nextOrder = this.project.timelineEvents
      .filter((e) => e.year === numYear)
      .reduce((max, e) => Math.max(max, Number(e.order) || 0), -1) + 1

    this.project.timelineEvents.push({
      id: createId('timeline_evt'),
      year: numYear,
      description: text,
      position: pos,
      order: nextOrder,
    })
    this.project.timelineEvents = normalizeTimelineEvents(this.project.timelineEvents)
    this.touchProject(`更新时间轴事件: ${numYear}`)
  },

  removeTimelineEvent(year) {
    if (!this.project || !Array.isArray(this.project.timelineEvents)) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    const before = this.project.timelineEvents.length
    this.project.timelineEvents = this.project.timelineEvents.filter((e) => e.year !== numYear)
    if (this.project.timelineEvents.length < before) {
      this.touchProject(`删除时间轴事件: ${numYear}`)
    }
  },

  addTimelineEventItem(year, description, position = 'before') {
    this.addTimelineEvent(year, description, position)
  },

  updateTimelineEventItem(eventId, patch = {}) {
    if (!this.project || !Array.isArray(this.project.timelineEvents)) return
    const id = String(eventId || '').trim()
    if (!id) return
    ensureTimelineEventsProject(this.project)
    const target = this.project.timelineEvents.find((e) => e.id === id)
    if (!target) return

    const next = { ...target }
    if (patch.year != null) {
      const nextYear = Number(patch.year)
      if (Number.isFinite(nextYear)) next.year = nextYear
    }
    if (patch.description != null) {
      const text = String(patch.description || '').trim()
      if (!text) return
      next.description = text
    }
    if (patch.position != null) {
      next.position = normalizePosition(patch.position)
    }
    if (patch.order != null && Number.isFinite(Number(patch.order))) {
      next.order = Number(patch.order)
    }

    Object.assign(target, next)
    this.project.timelineEvents = normalizeTimelineEvents(this.project.timelineEvents)
    this.touchProject(`更新时间轴事件条目: ${next.year}`)
  },

  removeTimelineEventItem(eventId) {
    if (!this.project || !Array.isArray(this.project.timelineEvents)) return
    const id = String(eventId || '').trim()
    if (!id) return
    ensureTimelineEventsProject(this.project)
    const target = this.project.timelineEvents.find((e) => e.id === id)
    if (!target) return
    const year = target.year
    this.project.timelineEvents = this.project.timelineEvents.filter((e) => e.id !== id)
    this.project.timelineEvents = normalizeTimelineEvents(this.project.timelineEvents)
    this.touchProject(`删除时间轴事件条目: ${year}`)
  },

  setTimelineEventPosition(year, position) {
    if (!this.project || !Array.isArray(this.project.timelineEvents)) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    ensureTimelineEventsProject(this.project)
    const pos = normalizePosition(position)
    let changed = false
    for (const event of this.project.timelineEvents) {
      if (event.year !== numYear) continue
      if (event.position === pos) continue
      event.position = pos
      changed = true
    }
    if (changed) {
      this.project.timelineEvents = normalizeTimelineEvents(this.project.timelineEvents)
      this.touchProject(`更新时间轴事件位置: ${numYear}`)
    }
  },

  setTimelineYearDelay(year, patch = {}) {
    if (!this.project) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    ensureTimelineDelaysProject(this.project)
    const beforeRaw = patch.beforeMs != null ? Number(patch.beforeMs || 0) : null
    const afterRaw = patch.afterMs != null ? Number(patch.afterMs || 0) : null
    const beforeMs = beforeRaw != null ? (Number.isFinite(beforeRaw) ? Math.max(0, beforeRaw) : 0) : null
    const afterMs = afterRaw != null ? (Number.isFinite(afterRaw) ? Math.max(0, afterRaw) : 0) : null

    let row = this.project.timelineYearDelays.find((d) => d.year === numYear)
    if (!row) {
      row = { year: numYear, beforeMs: 0, afterMs: 0 }
      this.project.timelineYearDelays.push(row)
    }
    if (beforeMs != null) row.beforeMs = beforeMs
    if (afterMs != null) row.afterMs = afterMs

    if ((row.beforeMs || 0) <= 0 && (row.afterMs || 0) <= 0) {
      this.project.timelineYearDelays = this.project.timelineYearDelays.filter((d) => d.year !== numYear)
    }

    this.project.timelineYearDelays = normalizeTimelineYearDelays(this.project.timelineYearDelays)
    this.touchProject(`更新时间轴延时: ${numYear}`)
  },
}

export { timelineActions }
