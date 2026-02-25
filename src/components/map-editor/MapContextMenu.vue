<script setup>
import { ref } from 'vue'

defineProps({
  visible: { type: Boolean, required: true },
  menuStyle: { type: Object, required: true },
  contextMenu: { type: Object, required: true },
  mode: { type: String, required: true },
  hasSelection: { type: Boolean, required: true },
  contextTargetLabel: { type: String, required: true },
  contextStation: { type: [Object, null], default: null },
  canMergeAtContextStation: { type: Boolean, required: true },
  isStationEnglishRetranslating: { type: Boolean, required: true },
})

const emit = defineEmits([
  'overlay-mousedown',
  'set-mode',
  'add-station',
  'clear-selection',
  'add-anchor',
  'remove-anchor',
  'clear-anchors',
  'rename-station',
  'delete-station',
  'delete-edge',
  'split-edge',
  'merge-edges',
  'ai-translate',
  'select-line-stations',
])

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
      class="map-editor__context-menu"
      :style="menuStyle"
      @mousedown.stop
      @contextmenu.prevent
    >
      <h3>{{ contextTargetLabel }}菜单</h3>
      <p class="map-editor__context-meta">模式: {{ mode }} | 已选: {{ hasSelection ? '是' : '否' }}</p>
      <p v-if="contextMenu.stationId" class="map-editor__context-meta">站点: {{ contextMenu.stationId }}</p>
      <p v-if="contextMenu.edgeId" class="map-editor__context-meta">线段: {{ contextMenu.edgeId }}</p>
      <p v-if="contextMenu.anchorIndex != null" class="map-editor__context-meta">锚点序号: {{ contextMenu.anchorIndex }}</p>
      <p v-if="contextMenu.lngLat" class="map-editor__context-meta">
        坐标: {{ contextMenu.lngLat[0].toFixed(6) }}, {{ contextMenu.lngLat[1].toFixed(6) }}
      </p>

      <div class="map-editor__context-section">
        <p>模式</p>
        <div class="map-editor__context-row">
          <button @click="emit('set-mode', 'select')">选择/拖拽</button>
          <button @click="emit('set-mode', 'add-station')">添加站点</button>
          <button @click="emit('set-mode', 'add-edge')">添加线段</button>
          <button @click="emit('set-mode', 'route-draw')">连续布线</button>
        </div>
      </div>

      <div v-if="contextMenu.targetType === 'map'" class="map-editor__context-section">
        <p>空白处操作</p>
        <div class="map-editor__context-row">
          <button @click="emit('add-station')" :disabled="!contextMenu.lngLat">在此新增站点</button>
          <button @click="emit('clear-selection')">清空选择</button>
        </div>
      </div>

      <div v-if="contextMenu.targetType === 'station'" class="map-editor__context-section">
        <p>站点操作</p>
        <div class="map-editor__context-row">
          <button
            @click="emit('ai-translate')"
            :disabled="!contextStation || isStationEnglishRetranslating"
          >
            {{ isStationEnglishRetranslating ? '翻译中...' : 'AI 翻译英文' }}
          </button>
          <button @click="emit('rename-station')" :disabled="!contextStation">重命名站点</button>
          <button @click="emit('delete-station')" :disabled="!contextMenu.stationId">删除该站点</button>
        </div>
        <div class="map-editor__context-row">
          <button @click="emit('merge-edges')" :disabled="!canMergeAtContextStation">合并相邻线段</button>
        </div>
      </div>

      <div v-if="contextMenu.targetType === 'edge'" class="map-editor__context-section">
        <p>线段操作</p>
        <div class="map-editor__context-row">
          <button @click="emit('split-edge')" :disabled="!contextMenu.edgeId || !contextMenu.lngLat">在此处插入站点</button>
          <button @click="emit('add-anchor')" :disabled="!contextMenu.edgeId || !contextMenu.lngLat">在此加锚点</button>
          <button @click="emit('delete-edge')" :disabled="!contextMenu.edgeId">删除该线段</button>
        </div>
        <div class="map-editor__context-row">
          <button @click="emit('select-line-stations')" :disabled="!contextMenu.edgeId">选中该线路所有站点</button>
          <button @click="emit('clear-anchors')" :disabled="!contextMenu.edgeId">清空该线段锚点</button>
        </div>
      </div>

      <div v-if="contextMenu.targetType === 'anchor'" class="map-editor__context-section">
        <p>锚点操作</p>
        <div class="map-editor__context-row">
          <button @click="emit('remove-anchor')" :disabled="contextMenu.anchorIndex == null || !contextMenu.edgeId">
            删除该锚点
          </button>
          <button @click="emit('add-anchor')" :disabled="!contextMenu.edgeId || !contextMenu.lngLat">在此加锚点</button>
        </div>
        <div class="map-editor__context-row">
          <button @click="emit('clear-anchors')" :disabled="!contextMenu.edgeId">清空该线段锚点</button>
        </div>
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

.map-editor__context-menu {
  position: absolute;
  width: 268px;
  max-height: calc(100% - 16px);
  overflow: auto;
  border: 1px solid var(--toolbar-border);
  background: var(--ark-bg-card);
  color: var(--toolbar-text);
  padding: 10px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
}

.map-editor__context-menu h3 {
  margin: 0 0 6px;
  font-family: var(--app-font-mono);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.map-editor__context-meta {
  margin: 0;
  font-size: 11px;
  color: var(--toolbar-hint);
  line-height: 1.35;
}

.map-editor__context-section {
  margin-top: 10px;
  border-top: 1px solid var(--toolbar-divider);
  padding-top: 8px;
}

.map-editor__context-section > p {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--toolbar-muted);
}

.map-editor__context-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.map-editor__context-row button {
  border: 1px solid var(--toolbar-button-border);
  background: var(--toolbar-button-bg);
  color: var(--toolbar-button-text);
  font-family: var(--app-font-mono);
  font-size: 11px;
  padding: 5px 7px;
  cursor: pointer;
  transition: border-color var(--transition-normal);
}

.map-editor__context-row button:hover:not(:disabled) {
  border-color: var(--ark-pink);
  color: var(--ark-pink);
}

.map-editor__context-row button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
