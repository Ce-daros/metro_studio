const timelineActions = {
  setTimelineFilterYear(year) {
    const normalizedYear = year == null ? null : Number(year)
    this.timelineFilterYear = normalizedYear
    if (!this.project || normalizedYear == null) return

    const visibleEdgeIds = new Set()
    const visibleStationIds = new Set()
    for (const edge of this.project.edges || []) {
      if (edge.openingYear != null && edge.openingYear > normalizedYear) continue
      visibleEdgeIds.add(edge.id)
      visibleStationIds.add(edge.fromStationId)
      visibleStationIds.add(edge.toStationId)
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

  addTimelineEvent(year, description) {
    if (!this.project) return
    const numYear = Number(year)
    if (!Number.isFinite(numYear)) return
    const text = String(description || '').trim()
    if (!text) return
    if (!Array.isArray(this.project.timelineEvents)) {
      this.project.timelineEvents = []
    }
    const existing = this.project.timelineEvents.find((e) => e.year === numYear)
    if (existing) {
      existing.description = text
    } else {
      this.project.timelineEvents.push({ year: numYear, description: text })
    }
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
}

export { timelineActions }
