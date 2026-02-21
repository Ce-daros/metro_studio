<script setup>
import { computed } from 'vue'
import IconBase from './IconBase.vue'
import { NTooltip } from 'naive-ui'
import { getEffectiveBindings, formatBindingDisplay } from '../lib/shortcutRegistry'

const props = defineProps({
  mode: { type: String, default: 'select' },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits(['set-mode', 'undo', 'redo'])

const TOOL_SHORTCUT_MAP = {
  'select': 'tool.select',
  'add-station': 'tool.addStation',
  'add-edge': 'tool.addEdge',
  'route-draw': 'tool.routeDraw',
  'style-brush': 'tool.styleBrush',
  'box-select': 'tool.boxSelect',
  'anchor-edit': 'tool.anchorEdit',
  'annotation': 'tool.annotation',
}

const activeIndex = computed(() => {
  return tools.value.findIndex(t => t.mode === props.mode)
})

const tools = computed(() => {
  const bindings = getEffectiveBindings()
  const bindingMap = new Map(bindings.map((b) => [b.id, b.binding]))
  return [
    { mode: 'select', icon: 'cursor', label: '选择' },
    { mode: 'add-station', icon: 'plus-circle', label: '添加站点' },
    { mode: 'add-edge', icon: 'git-branch', label: '添加线段' },
    { mode: 'route-draw', icon: 'route', label: '连续布线' },
    { mode: 'style-brush', icon: 'paintbrush', label: '样式刷' },
    { mode: 'box-select', icon: 'box-select', label: '框选' },
    { mode: 'anchor-edit', icon: 'edit-3', label: '锚点' },
    { mode: 'annotation', icon: 'message-square', label: '注释' },
  ].map((t) => ({
    ...t,
    shortcut: formatBindingDisplay(bindingMap.get(TOOL_SHORTCUT_MAP[t.mode]) || ''),
  }))
})

function isToolActive(toolMode) {
  return props.mode === toolMode
}

const undoShortcut = computed(() => {
  const bindings = getEffectiveBindings()
  const b = bindings.find((x) => x.id === 'edit.undo')
  return b ? formatBindingDisplay(b.binding) : 'Ctrl+Z'
})

const redoShortcut = computed(() => {
  const bindings = getEffectiveBindings()
  const b = bindings.find((x) => x.id === 'edit.redo')
  return b ? formatBindingDisplay(b.binding) : 'Ctrl+Shift+Z'
})
</script>

<template>
  <aside class="tool-strip ark-terminal-corner">
    <div class="tool-strip__accent-bar"></div>
    <div class="tool-strip__tools">
      <div 
        class="tool-strip__active-indicator" 
        :style="{ transform: `translateY(${activeIndex * 32}px)` }"
        v-if="activeIndex !== -1"
      ></div>
      <NTooltip
        v-for="tool in tools"
        :key="tool.mode"
        placement="right"
        :delay="300"
      >
        <template #trigger>
          <button
            class="tool-strip__btn ark-glitch-hover"
            :class="{ 'tool-strip__btn--active': isToolActive(tool.mode) }"
            type="button"
            @click="emit('set-mode', tool.mode)"
          >
            <IconBase :name="tool.icon" :size="18" />
          </button>
        </template>
        {{ tool.label }}{{ tool.shortcut ? ` (${tool.shortcut})` : '' }}
      </NTooltip>
    </div>

    <div class="tool-strip__divider" />

    <div class="tool-strip__actions">
      <NTooltip placement="right" :delay="300">
        <template #trigger>
          <button class="tool-strip__btn ark-glitch-hover" :disabled="!canUndo" type="button" @click="emit('undo')">
            <IconBase name="undo" :size="18" />
          </button>
        </template>
        撤销 ({{ undoShortcut }})
      </NTooltip>
      <NTooltip placement="right" :delay="300">
        <template #trigger>
          <button class="tool-strip__btn ark-glitch-hover" :disabled="!canRedo" type="button" @click="emit('redo')">
            <IconBase name="redo" :size="18" />
          </button>
        </template>
        重做 ({{ redoShortcut }})
      </NTooltip>
    </div>
  </aside>
</template>

<style scoped>
.tool-strip {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 8px;
  background: linear-gradient(180deg, rgba(12, 12, 14, 0.9), rgba(6, 6, 9, 0.86));
  border: 1px solid rgba(188, 31, 255, 0.45);
  backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.12), 0 0 14px rgba(188, 31, 255, 0.2);
  overflow-y: auto;
  flex-shrink: 0;
}

.tool-strip__accent-bar {
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--ark-purple), var(--ark-pink));
  opacity: 0.85;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.tool-strip__serial {
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(168, 210, 255, 0.52);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  user-select: none;
}

.tool-strip__tools {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0 6px;
}

.tool-strip__active-indicator {
  position: absolute;
  left: 6px;
  top: 0;
  width: 30px;
  height: 30px;
  background: rgba(249, 0, 191, 0.2);
  border: 1px solid rgba(249, 0, 191, 0.78);
  clip-path: var(--clip-chamfer-sm);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  z-index: 0;
}

.tool-strip__active-indicator::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: var(--indicator-width, 2px);
  height: 20px;
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.tool-strip__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0 6px;
}

.tool-strip__divider {
  width: 20px;
  height: 1px;
  margin: 8px 0;
  background: var(--toolbar-divider);
  flex-shrink: 0;
}

.tool-strip__btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  background: rgba(8, 8, 10, 0.68);
  color: var(--toolbar-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
  clip-path: var(--clip-chamfer-sm);
}

.tool-strip__btn:hover:not(:disabled) {
  background: rgba(188, 31, 255, 0.14);
  border-color: rgba(249, 0, 191, 0.56);
  color: var(--toolbar-text);
  box-shadow: 0 0 8px rgba(249, 0, 191, 0.26);
}

.tool-strip__btn--active {
  color: var(--ark-pink);
  background: transparent;
  border-color: transparent;
}

.tool-strip__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
