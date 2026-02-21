import { dijkstra } from '../../../lib/hud/hudGraphAlgorithms'

const BANDS = [
  { label: '0–5 km', min: 0, max: 5000, color: '#22c55e' },
  { label: '5–10 km', min: 5000, max: 10000, color: '#3b82f6' },
  { label: '10–20 km', min: 10000, max: 20000, color: '#f59e0b' },
  { label: '20–50 km', min: 20000, max: 50000, color: '#ef4444' },
  { label: '50+ km', min: 50000, max: Infinity, color: '#8b5cf6' },
]

function buildAdjacency(edges) {
  const adj = new Map()
  for (const edge of edges) {
    const { fromStationId, toStationId, lengthMeters } = edge
    if (!fromStationId || !toStationId) continue
    const weight = lengthMeters || 0
    if (!adj.has(fromStationId)) adj.set(fromStationId, [])
    if (!adj.has(toStationId)) adj.set(toStationId, [])
    adj.get(fromStationId).push({ to: toStationId, weight })
    adj.get(toStationId).push({ to: fromStationId, weight })
  }
  return adj
}

const reachabilityActions = {
  setReachability(stationId, thresholdMeters) {
    if (!this.project) return
    const adj = buildAdjacency(this.project.edges || [])
    const { dist } = dijkstra(adj, stationId)

    const bands = BANDS.map(b => ({ ...b, stations: [] }))
    for (const [sid, d] of dist) {
      if (sid === stationId || !Number.isFinite(d) || d > thresholdMeters) continue
      const station = this.stationById.get(sid)
      if (!station) continue
      const band = bands.find(b => d >= b.min && d < b.max)
      if (band) band.stations.push({ id: sid, name: station.nameZh || sid, distance: d, lngLat: station.lngLat })
    }
    for (const band of bands) band.stations.sort((a, b) => a.distance - b.distance)

    const origin = this.stationById.get(stationId)
    this.reachability = {
      active: true,
      stationId,
      thresholdMeters,
      result: {
        bands: bands.filter(b => b.stations.length > 0),
        totalCount: bands.reduce((s, b) => s + b.stations.length, 0),
        originLngLat: origin?.lngLat || null,
      },
    }
  },

  clearReachability() {
    this.reachability = { active: false, stationId: null, thresholdMeters: 0, result: null }
  },
}

export { reachabilityActions }
