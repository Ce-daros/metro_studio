<script setup>
import { nextTick, ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import {
  getEffectiveBindings,
  formatBindingDisplay,
  eventToBindingString,
  setCustomBinding,
  resetBinding,
  resetAllBindings,
  detectConflicts,
} from '../lib/shortcutRegistry'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'bindings-changed'])

const bindings = ref([])
const recordingId = ref(null)
const recordingValue = ref('')
const conflictWarning = ref('')

function loadBindings() {
  bindings.value = getEffectiveBindings().filter((b) => !b.hidden)
}

const groupedBindings = computed(() => {
  const groups = new Map()
  for (const b of bindings.value) {
    if (!groups.has(b.category)) groups.set(b.category, [])
    groups.get(b.category).push(b)
  }
  return [...groups.entries()]
})

function startRecording(id) {
  recordingId.value = id
  recordingValue.value = ''
  conflictWarning.value = ''
}

function cancelRecording() {
  recordingId.value = null
  recordingValue.value = ''
  conflictWarning.value = ''
}

function onRecordKeydown(event) {
  if (!recordingId.value) return
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    cancelRecording()
    return
  }

  const bindingStr = eventToBindingString(event)
  if (!bindingStr) return

  recordingValue.value = bindingStr

  // Check for conflicts
  const current = bindings.value.find((b) => b.id === recordingId.value)
  const testBindings = bindings.value.map((b) =>
    b.id === recordingId.value ? { ...b, binding: bindingStr } : b
  )
  const conflicts = detectConflicts(testBindings)
  const relevant = conflicts.find((c) => c.ids.includes(recordingId.value))
  if (relevant) {
    const otherIds = relevant.ids.filter((id) => id !== recordingId.value)
    const otherLabels = otherIds
      .map((id) => bindings.value.find((b) => b.id === id)?.label)
      .filter(Boolean)
    conflictWarning.value = `与「${otherLabels.join('、')}」冲突`
  } else {
    conflictWarning.value = ''
  }
}

function confirmRecording() {
  if (!recordingId.value || !recordingValue.value) return
  setCustomBinding(recordingId.value, recordingValue.value)
  recordingId.value = null
  recordingValue.value = ''
  conflictWarning.value = ''
  loadBindings()
  emit('bindings-changed')
}

function doResetBinding(id) {
  resetBinding(id)
  loadBindings()
  emit('bindings-changed')
}

function doResetAll() {
  resetAllBindings()
  loadBindings()
  emit('bindings-changed')
}

function doClose() {
  cancelRecording()
  emit('close')
}

function onKeydown(e) {
  if (recordingId.value) {
    onRecordKeydown(e)
    return
  }
  if (e.key === 'Escape') {
    doClose()
  }
}

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      loadBindings()
      await nextTick()
    } else {
      cancelRecording()
    }
  }
)
</script>

<template>
  <NModal :show="visible" preset="card" title="快捷键绑定" style="width:520px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="shortcut-dialog__body" @keydown="onKeydown">
            <div
              v-for="[category, items] in groupedBindings"
              :key="category"
              class="shortcut-dialog__group"
            >
              <h3 class="shortcut-dialog__group-title">{{ category }}</h3>
              <div
                v-for="item in items"
                :key="item.id"
                class="shortcut-dialog__row"
              >
                <span class="shortcut-dialog__label">{{ item.label }}</span>
                <div class="shortcut-dialog__binding-area">
                  <button
                    v-if="recordingId === item.id"
                    class="shortcut-dialog__binding shortcut-dialog__binding--recording"
                    @click.stop
                  >
                    {{ recordingValue || '按下快捷键...' }}
                  </button>
                  <button
                    v-else
                    class="shortcut-dialog__binding"
                    :class="{ 'shortcut-dialog__binding--custom': item.isCustom }"
                    @click="startRecording(item.id)"
                  >
                    {{ formatBindingDisplay(item.binding) }}
                  </button>
                  <button
                    v-if="recordingId === item.id && recordingValue"
                    class="shortcut-dialog__action-btn"
                    @click="confirmRecording"
                  >
                    确认
                  </button>
                  <button
                    v-if="recordingId === item.id"
                    class="shortcut-dialog__action-btn"
                    @click="cancelRecording"
                  >
                    取消
                  </button>
                  <button
                    v-if="recordingId !== item.id && item.isCustom"
                    class="shortcut-dialog__action-btn shortcut-dialog__action-btn--reset"
                    @click="doResetBinding(item.id)"
                  >
                    重置
                  </button>
                </div>
              </div>
              <p
                v-if="recordingId && conflictWarning"
                class="shortcut-dialog__conflict"
              >
                {{ conflictWarning }}
              </p>
            </div>
    </div>
    <template #footer>
      <div class="shortcut-dialog__footer">
        <button
          class="shortcut-dialog__btn shortcut-dialog__btn--cancel"
          type="button"
          @click="doResetAll"
        >
          全部重置
        </button>
        <button
          class="shortcut-dialog__btn shortcut-dialog__btn--primary"
          type="button"
          @click="doClose"
        >
          关闭
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.shortcut-dialog__body {
  padding: 14px 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.shortcut-dialog__group {
  margin-bottom: 16px;
}

.shortcut-dialog__group:last-child {
  margin-bottom: 0;
}

.shortcut-dialog__group-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--toolbar-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.shortcut-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--toolbar-divider);
}

.shortcut-dialog__row:last-child {
  border-bottom: none;
}

.shortcut-dialog__label {
  font-size: 13px;
  color: var(--toolbar-text);
  flex-shrink: 0;
}

.shortcut-dialog__binding-area {
  display: flex;
  align-items: center;
  gap: 6px;
}

.shortcut-dialog__binding {
  padding: 4px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  cursor: pointer;
  min-width: 60px;
  text-align: center;
  transition: border-color var(--transition-normal);
}

.shortcut-dialog__binding:hover {
  border-color: var(--toolbar-button-hover-border);
}

.shortcut-dialog__binding--custom {
  border-color: var(--ark-pink);
  color: var(--ark-pink);
}

.shortcut-dialog__binding--recording {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  color: #f59e0b;
  animation: pulse-border 1s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: #f59e0b; }
  50% { border-color: #fbbf24; }
}

.shortcut-dialog__action-btn {
  padding: 3px 8px;
  border: 1px solid var(--toolbar-button-border);
  border-radius: 5px;
  background: var(--toolbar-button-bg);
  color: var(--toolbar-button-text);
  font-size: 11px;
  cursor: pointer;
  transition: border-color var(--transition-normal);
}

.shortcut-dialog__action-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.shortcut-dialog__action-btn--reset {
  color: var(--toolbar-muted);
}

.shortcut-dialog__conflict {
  margin: 4px 0 0;
  font-size: 11px;
  color: #ef4444;
  text-align: right;
}

.shortcut-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
}

.shortcut-dialog__btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-normal);
  outline: none;
}

.shortcut-dialog__btn:focus-visible {
  box-shadow: var(--focus-ring);
}

.shortcut-dialog__btn--cancel {
  background: var(--toolbar-button-bg);
  border-color: var(--toolbar-button-border);
  color: var(--toolbar-button-text);
}

.shortcut-dialog__btn--cancel:hover {
  border-color: var(--toolbar-button-hover-border);
}

.shortcut-dialog__btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.shortcut-dialog__btn--primary:hover {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

:deep(.n-card) {
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
}

:deep(.n-card__header) {
  flex-shrink: 0;
}

:deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.n-card__footer) {
  flex-shrink: 0;
}
</style>
