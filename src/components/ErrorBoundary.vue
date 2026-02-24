<script setup>
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((err) => {
  hasError.value = true
  errorMessage.value = err?.message || String(err)
  return false
})

function reload() {
  hasError.value = false
  errorMessage.value = ''
}
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <div class="error-boundary__content">
      <span class="error-boundary__block-icon">▣</span>
      <p class="error-boundary__title">视图渲染出错</p>
      <p class="error-boundary__message">{{ errorMessage }}</p>
      <button class="error-boundary__reload" @click="reload">重新加载</button>
    </div>
  </div>
</template>

<style scoped>
.error-boundary {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--toolbar-card-bg);
}

.error-boundary__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 360px;
  padding: 32px 24px;
  text-align: center;
}

.error-boundary__block-icon {
  font-size: 32px;
  color: var(--ark-pink);
  line-height: 1;
  margin-bottom: 4px;
}

.error-boundary__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--toolbar-text);
}

.error-boundary__message {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--toolbar-muted);
  word-break: break-word;
}

.error-boundary__reload {
  margin-top: 6px;
  padding: 7px 20px;
  border: none;
  border-radius: 6px;
  background: var(--toolbar-primary-bg);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-normal);
}

.error-boundary__reload:hover {
  opacity: 0.85;
}

.error-boundary__reload:active {
  opacity: 0.7;
}
</style>
