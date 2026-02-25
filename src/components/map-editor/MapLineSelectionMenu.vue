<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, required: true },
  menuStyle: { type: Object, required: true },
  lineOptions: { type: Array, required: true },
})

const emit = defineEmits(['overlay-mousedown', 'select-line', 'close'])

const menuEl = ref(null)
defineExpose({ menuEl })
</script>

<template>
  <div
    v-if="visible"
    class="map-editor__context-mask"
    @mousedown="emit('overlay-mousedown', $event)"
    @contextmenu.prevent="emit('overlay-mousedown', $event)"
  >
    <div
      ref="menuEl"
      class="map-editor__line-selection-menu"
      :style="menuStyle"
      @mousedown.stop
      @contextmenu.prevent
    >
      <h3>选择线路</h3>
      <p class="map-editor__context-meta">该线段被多条线路共享，请选择</p>
      <div class="map-editor__line-selection-list">
        <button
          v-for="option in lineOptions"
          :key="option.id"
          class="map-editor__line-selection-option"
          @click="emit('select-line', option.id)"
        >
          <span class="map-editor__line-selection-color" :style="{ background: option.color }"></span>
          <span class="map-editor__line-selection-name">{{ option.nameZh }}</span>
          <span class="map-editor__line-selection-name-en">{{ option.nameEn }}</span>
        </button>
      </div>
      <div class="map-editor__context-row">
        <button @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-editor__context-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
}

.map-editor__context-meta {
  margin: 0;
  font-size: 11px;
  color: var(--toolbar-hint);
  line-height: 1.35;
}

.map-editor__context-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.map-editor__context-row button {
  border: 1px solid var(--toolbar-button-border);
  border-radius: 7px;
  background: var(--toolbar-button-bg);
  color: var(--toolbar-button-text);
  font-size: 11px;
  padding: 5px 7px;
  cursor: pointer;
  transition: border-color var(--transition-normal);
}

.map-editor__context-row button:hover:not(:disabled) {
  border-color: var(--toolbar-button-hover-border);
}

.map-editor__line-selection-menu {
  position: absolute;
  width: 268px;
  max-height: calc(100% - 16px);
  overflow: auto;
  border: 1px solid var(--toolbar-border);
  border-radius: 12px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  padding: 10px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.35);
}

.map-editor__line-selection-menu h3 {
  margin: 0 0 6px;
  font-size: 14px;
}

.map-editor__line-selection-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}

.map-editor__line-selection-option {
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: border-color var(--transition-normal), background-color var(--transition-normal);
}

.map-editor__line-selection-option:hover {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.map-editor__line-selection-color {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.map-editor__line-selection-name {
  font-size: 13px;
  font-weight: 600;
}

.map-editor__line-selection-name-en {
  font-size: 12px;
  color: var(--toolbar-muted);
  margin-left: auto;
}
</style>
