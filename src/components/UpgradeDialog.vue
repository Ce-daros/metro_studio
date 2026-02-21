<script setup>
import { ref } from 'vue'
import { NModal } from 'naive-ui'
import { activate } from '../composables/useLicense'

const props = defineProps({
  visible: { type: Boolean, default: false },
  message: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const keyInput = ref('')
const error = ref('')

function doClose() {
  keyInput.value = ''
  error.value = ''
  emit('close')
}

function doActivate() {
  const key = keyInput.value.trim()
  if (!key) { error.value = '请输入 License Key'; return }
  activate(key)
  doClose()
}
</script>

<template>
  <NModal :show="visible" preset="card" title="升级到正式版" style="width:420px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="upgrade-body">
      <p class="upgrade-msg">{{ message }}</p>
      <input v-model="keyInput" class="upgrade-input" placeholder="请输入 License Key" @keyup.enter="doActivate" />
      <p v-if="error" class="upgrade-error">{{ error }}</p>
    </div>
    <footer class="upgrade-footer">
      <button class="upgrade-btn upgrade-btn--ghost" @click="doClose">取消</button>
      <button class="upgrade-btn upgrade-btn--primary" @click="doActivate">激活</button>
    </footer>
  </NModal>
</template>

<style scoped>
.upgrade-body {
  padding: 20px 24px;
}

.upgrade-msg {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--toolbar-text);
}

.upgrade-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--app-font-mono);
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-text);
  outline: none;
  box-sizing: border-box;
}

.upgrade-input:focus {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.upgrade-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #f44;
}

.upgrade-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--toolbar-divider);
}

.upgrade-btn {
  padding: 7px 16px;
  font-family: var(--app-font-mono);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  outline: none;
  transition: all var(--transition-normal);
}

.upgrade-btn--primary {
  border: 1px solid var(--ark-pink);
  background: var(--ark-pink);
  color: #fff;
}

.upgrade-btn--primary:hover {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.upgrade-btn--ghost {
  border: 1px solid var(--toolbar-input-border);
  background: transparent;
  color: var(--toolbar-muted);
}

.upgrade-btn--ghost:hover {
  border-color: var(--toolbar-text);
  color: var(--toolbar-text);
}
</style>
