<script setup>
import { computed } from 'vue'
import { buildInterchangeMarkerEntries } from './interchangeMarkersShared'

const props = defineProps({
  stations: { type: Array, required: true },
  lineById: { type: Map, required: true },
  markersKey: { type: Number, required: true },
  getMarkerStyle: { type: Function, required: true },
  style: { type: String, default: 'bar' }, // 'bar' | 'pie'
  visible: { type: Boolean, default: true },
  zoom: { type: Number, default: 4 },
})

const interchangeStations = computed(() => {
  return buildInterchangeMarkerEntries({
    stations: props.stations,
    lineById: props.lineById,
    zoom: props.zoom,
    visible: props.visible,
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
