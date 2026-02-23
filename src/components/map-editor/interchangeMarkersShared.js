export function getInterchangeMarkerZoomScale(zoom) {
  const minZoom = 3
  const maxZoom = 18
  const clamped = Math.min(maxZoom, Math.max(minZoom, Number.isFinite(zoom) ? zoom : 4))
  const scale = 2 ** ((clamped - 12) / 2.4)
  return Math.min(2.4, Math.max(0.35, scale))
}

export function buildInterchangeMarkerEntries({
  stations,
  lineById,
  zoom,
  visible = true,
}) {
  if (!visible || !Array.isArray(stations) || stations.length === 0) return []

  const zoomScale = getInterchangeMarkerZoomScale(zoom)
  const safeLineById = lineById && typeof lineById.get === 'function' ? lineById : new Map()

  return stations
    .filter((station) => station?.isInterchange)
    .map((station) => {
      const lineIds = station.transferLineIds?.length ? station.transferLineIds : (station.lineIds || [])
      const lineColors = lineIds
        .map((lineId) => safeLineById.get(lineId)?.color)
        .filter(Boolean)
      const uniqueLineColors = [...new Set(lineColors)]

      const colors = uniqueLineColors.length > 0 ? uniqueLineColors : ['#bc1fff', '#38bdf8']
      const count = colors.length
      const shownColors = colors.slice(0, 4)
      const dotSize = Math.max(5, 6.4 * zoomScale)
      const gap = Math.max(1, 1.6 * zoomScale)
      const borderWidth = Math.max(1.2, 1.6 * zoomScale)
      const innerWidth = count * dotSize + (count - 1) * gap
      const containerSize = innerWidth + borderWidth * 2 + gap * 2

      const pieSize = Math.max(10, 13 * zoomScale)
      const pieBorder = borderWidth
      const pieContainerSize = pieSize + pieBorder * 2
      const stops = shownColors
        .map((color, index) => {
          const from = (index / shownColors.length) * 360
          const to = ((index + 1) / shownColors.length) * 360
          return `${color} ${from}deg ${to}deg`
        })
        .join(', ')

      return {
        ...station,
        containerSize: Number(containerSize.toFixed(2)),
        dotSize,
        gap,
        borderWidth,
        colors,
        shownColors,
        pieSize,
        pieBorder,
        pieContainerSize: Number(pieContainerSize.toFixed(2)),
        pieBackground: `conic-gradient(${stops})`,
      }
    })
}
