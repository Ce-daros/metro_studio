<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  project: { type: Object, required: true },
  width: { type: Number, default: 80 },
  height: { type: Number, default: 52 },
})

const canvasRef = ref(null)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const { stations, edges, lines } = props.project
  const dpr = window.devicePixelRatio || 1
  canvas.width = props.width * dpr
  canvas.height = props.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, props.width, props.height)

  if (!stations?.length) return

  const pad = 6
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const s of stations) {
    if (!s.lngLat) continue
    const [lng, lat] = s.lngLat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  const dLng = maxLng - minLng || 1
  const dLat = maxLat - minLat || 1
  const w = props.width - pad * 2
  const h = props.height - pad * 2
  const scale = Math.min(w / dLng, h / dLat)
  const ox = pad + (w - dLng * scale) / 2
  const oy = pad + (h - dLat * scale) / 2

  const toX = lng => ox + (lng - minLng) * scale
  const toY = lat => oy + (maxLat - lat) * scale // Y flipped

  const stationMap = new Map(stations.map(s => [s.id, s]))
  const lineMap = lines ? new Map(lines.map(l => [l.id, l])) : new Map()

  // Draw edges
  if (edges) {
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    for (const edge of edges) {
      const from = stationMap.get(edge.fromStationId)
      const to = stationMap.get(edge.toStationId)
      if (!from?.lngLat || !to?.lngLat) continue
      const lineId = edge.sharedByLineIds?.[0]
      const line = lineId ? lineMap.get(lineId) : null
      ctx.strokeStyle = line?.color || '#888'
      ctx.beginPath()
      ctx.moveTo(toX(from.lngLat[0]), toY(from.lngLat[1]))
      ctx.lineTo(toX(to.lngLat[0]), toY(to.lngLat[1]))
      ctx.stroke()
    }
  }

  // Draw stations
  ctx.fillStyle = '#fff'
  for (const s of stations) {
    if (!s.lngLat) continue
    ctx.beginPath()
    ctx.arc(toX(s.lngLat[0]), toY(s.lngLat[1]), 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

onMounted(draw)
watch(() => props.project, draw, { deep: false })
</script>

<template>
  <canvas
    ref="canvasRef"
    class="project-thumbnail"
    :style="{ width: width + 'px', height: height + 'px' }"
  />
</template>

<style scoped>
.project-thumbnail {
  border-radius: 4px;
  background: var(--toolbar-input-bg, #1a1a1a);
  border: 1px solid var(--toolbar-input-border, #333);
  flex-shrink: 0;
}
</style>
