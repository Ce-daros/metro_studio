/**
 * Map display preferences actions.
 * Handles map overlay settings like landuse visualization.
 */
const mapPreferencesActions = {
  toggleStationMarkers() {
    this.showStationMarkers = !this.showStationMarkers
  },

  toggleStationLabels() {
    this.showStationLabels = !this.showStationLabels
  },

  toggleLineLabels() {
    this.showLineLabels = !this.showLineLabels
  },

  toggleInterchangeMarkers() {
    this.showInterchangeMarkers = !this.showInterchangeMarkers
  },

  setInterchangeMarkerStyle(style) {
    const nextStyle = style === 'pie' ? 'pie' : 'bar'
    this.interchangeMarkerStyle = nextStyle
    try {
      window.localStorage.setItem('railmap_interchange_marker_style', nextStyle)
    } catch {}
  },

  toggleLanduseOverlay() {
    this.toggleOverlay('zoning')
  },

  setShowLanduseOverlay(visible) {
    const has = this.overlayLayers.includes('zoning')
    if (visible && !has) this.overlayLayers.push('zoning')
    if (!visible && has) this.overlayLayers = this.overlayLayers.filter(id => id !== 'zoning')
    try { window.localStorage.setItem('railmap_overlay_layers', JSON.stringify(this.overlayLayers)) } catch {}
  },

  toggleOverlay(id) {
    const idx = this.overlayLayers.indexOf(id)
    if (idx >= 0) this.overlayLayers.splice(idx, 1)
    else this.overlayLayers.push(id)
    try { window.localStorage.setItem('railmap_overlay_layers', JSON.stringify(this.overlayLayers)) } catch {}
  },

  setOverlayMode(mode) {
    if (mode === 'none') {
      this.overlayLayers = this.overlayLayers.filter((id) => id !== 'zoning' && id !== 'population')
    } else if (mode === 'zoning') {
      this.overlayLayers = this.overlayLayers.filter((id) => id !== 'population')
      if (!this.overlayLayers.includes('zoning')) this.overlayLayers.push('zoning')
    } else if (mode === 'population') {
      this.overlayLayers = this.overlayLayers.filter((id) => id !== 'zoning')
      if (!this.overlayLayers.includes('population')) this.overlayLayers.push('population')
    }
    try { window.localStorage.setItem('railmap_overlay_layers', JSON.stringify(this.overlayLayers)) } catch {}
  },

  toggleHighlightStationLocations() {
    this.highlightStationLocations = !this.highlightStationLocations
  },

  toggleMapGrid() {
    this.showMapGrid = !this.showMapGrid
  },

  toggleMapCoordinates() {
    this.showMapCoordinates = !this.showMapCoordinates
  },

  setProtomapsApiKey(key) {
    this.protomapsApiKey = key || ''
  },

  setMapTileType(tileType) {
    const normalized = tileType || 'osm'
    if (normalized === 'stamenToner' || normalized === 'stamenTerrain') {
      this.mapTileType = 'dark'
      return
    }
    this.mapTileType = normalized
  },
}

export { mapPreferencesActions }
