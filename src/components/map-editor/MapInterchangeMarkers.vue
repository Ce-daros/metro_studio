<script setup>
import { computed } from 'vue'

const props = defineProps({
  stations: { type: Array, required: true },
  lineById: { type: Map, required: true },
  markersKey: { type: Number, required: true },
  getMarkerStyle: { type: Function, required: true },
  style: { type: String, default: 'bar' }, // 'bar' | 'pie'
  visible: { type: Boolean, default: true },
  zoom: { type: Number, default: 4 },
})

function getZoomScale(zoom) {
  const minZoom = 3
  const maxZoom = 18
  const clamped = Math.min(maxZoom, Math.max(minZoom, zoom))
  const scale = 2 ** ((clamped - 12) / 2.4)
  return Math.min(2.4, Math.max(0.35, scale))
}

const interchangeStations = computed(() => {
  if (!props.visible) return []
  const zoomScale = getZoomScale(props.zoom)
  return props.stations.filter(s => s.isInterchange).map(s => {
    // 获取站点所属的所有线路颜色
    const lineIds = s.transferLineIds?.length ? s.transferLineIds : (s.lineIds || [])
    const lineColors = lineIds.map(id => props.lineById.get(id)?.color).filter(Boolean)
    const uniqueLineColors = [...new Set(lineColors)]
    
    // 如果没有获取到线路颜色，默认给一些占位色
    const colors = uniqueLineColors.length > 0 ? uniqueLineColors : ['#bc1fff', '#38bdf8']

    const count = colors.length
    const shownColors = colors.slice(0, 4)
    const shownCount = shownColors.length
    const dotSize = Math.max(5, 6.4 * zoomScale)
    const gap = Math.max(1, 1.6 * zoomScale)
    const borderWidth = Math.max(1.2, 1.6 * zoomScale)
    const innerWidth = count * dotSize + (count - 1) * gap
    const containerSize = innerWidth + borderWidth * 2 + gap * 2

    // pie 模式：正方形，conic-gradient 从中心点放射状平分
    const pieSize = Math.max(10, 13 * zoomScale)
    const pieBorder = borderWidth
    const pieContainerSize = pieSize + pieBorder * 2
    // 构建 conic-gradient stops
    const stops = shownColors.map((c, i) => {
      const from = (i / shownColors.length) * 360
      const to = ((i + 1) / shownColors.length) * 360
      return `${c} ${from}deg ${to}deg`
    }).join(', ')
    const pieBackground = `conic-gradient(${stops})`

    return {
      ...s,
      containerSize: Number(containerSize.toFixed(2)),
      dotSize,
      gap,
      borderWidth,
      colors,
      pieSize,
      pieBorder,
      pieContainerSize: Number(pieContainerSize.toFixed(2)),
      pieBackground,
    }
  })
})
</script>

<template>
  <div v-if="visible" class="map-interchange-layer">
    <div
      v-for="station in interchangeStations"
      :key="`interchange-${station.id}-${markersKey}`"
      class="interchange-marker"
      :style="[
        getMarkerStyle(station.lngLat),
        {
          width: `${style === 'pie' ? station.pieContainerSize : station.containerSize}px`,
          height: `${style === 'pie' ? station.pieContainerSize : station.containerSize}px`,
        },
      ]"
    >
      <div
        v-if="style !== 'pie'"
        class="interchange-outer"
        :style="{
          borderWidth: `${station.borderWidth}px`,
          padding: `${station.gap}px`,
          gap: `${station.gap}px`,
        }"
      >
        <div
          v-for="(color, i) in station.colors"
          :key="i"
          class="interchange-dot"
          :style="{
            width: `${station.dotSize}px`,
            height: `${station.dotSize}px`,
            backgroundColor: color,
          }"
        ></div>
      </div>
      <div
        v-else
        class="interchange-square"
        :style="{
          width: `${station.pieSize}px`,
          height: `${station.pieSize}px`,
          borderWidth: `${station.pieBorder}px`,
          background: station.pieBackground,
        }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.map-interchange-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 15;
}

.interchange-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.interchange-outer {
  display: flex;
  align-items: center;
  border: solid #000;
  border-radius: 9999px;
  background: #fff;
  box-sizing: border-box;
}

.interchange-dot {
  border-radius: 50%;
  flex-shrink: 0;
}

.interchange-square {
  border: solid #000;
  box-sizing: border-box;
}
</style>
