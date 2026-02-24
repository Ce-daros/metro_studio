<script setup>
defineProps({
  annotations: { type: Array, required: true },
  annotationMarkersKey: { type: Number, required: true },
  selectedAnnotationId: { type: [String, Number, null], default: null },
  getMarkerStyle: { type: Function, required: true },
})
</script>

<template>
  <div
    v-for="annotation in annotations"
    :key="`annotation-${annotation.id}-${annotationMarkersKey}`"
    class="map-editor__annotation-marker"
    :class="{ active: annotation.id === selectedAnnotationId }"
    :style="getMarkerStyle(annotation.lngLat)"
  >
    <div class="map-editor__annotation-marker-icon">
      <span style="font-size:16px;color:var(--ark-pink);line-height:1;">▣</span>
    </div>
    <div v-if="annotation.text" class="map-editor__annotation-marker-text">{{ annotation.text }}</div>
  </div>
</template>

<style scoped>
.map-editor__annotation-marker {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
  z-index: 19;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 200px;
}

.map-editor__annotation-marker-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f59e0b;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}

.map-editor__annotation-marker:hover .map-editor__annotation-marker-icon {
  background: #d97706;
  transform: scale(1.1);
}

.map-editor__annotation-marker.active .map-editor__annotation-marker-icon {
  background: #dc2626;
  border-color: #fca5a5;
}

.map-editor__annotation-marker-text {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 11px;
  line-height: 1.3;
  max-width: 100%;
  word-break: break-word;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
</style>
