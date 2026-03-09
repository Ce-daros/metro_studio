<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const annotations = computed(() => store.project?.annotations || [])

const annotationText = computed(() => {
  return annotations.value.find((annotation) => annotation.id === store.selectedAnnotationId)?.text || ''
})

function updateAnnotationText(text) {
  if (!store.selectedAnnotationId) return
  store.updateAnnotationText(store.selectedAnnotationId, text)
}

function deleteAnnotation() {
  if (!store.selectedAnnotationId) return
  store.deleteAnnotation(store.selectedAnnotationId)
  store.selectedAnnotationId = null
}
</script>

<template>
  <div class="pp-inspector panel-annotation">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Annotation Inspector</span>
      <h2 class="pp-summary__title">示意图注释</h2>
      <p class="pp-summary__subtitle">管理示意图注释。</p>

      <div class="pp-chip-row">
        <span class="pp-chip pp-chip--accent">{{ annotations.length }} 条注释</span>
        <span class="pp-chip pp-chip--muted">{{ store.selectedAnnotationId ? '已选中一条注释' : '未选中注释' }}</span>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">注释列表</h3>
          <p class="pp-card__subtitle">选择要编辑的注释。</p>
        </div>
      </div>

      <div v-if="annotations.length" class="panel-annotation__list">
        <button
          v-for="annotation in annotations"
          :key="annotation.id"
          class="panel-annotation__item"
          :class="{ 'panel-annotation__item--active': annotation.id === store.selectedAnnotationId }"
          type="button"
          @click="store.selectedAnnotationId = annotation.id"
        >
          <span class="panel-annotation__item-text">{{ annotation.text || '(无内容)' }}</span>
          <span class="panel-annotation__item-meta">ANNOT</span>
        </button>
      </div>
      <div v-else class="pp-empty">暂无注释。</div>
    </section>

    <section class="pp-card pp-card--muted">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">注释正文</h3>
          <p class="pp-card__subtitle">编辑当前注释内容。</p>
        </div>
      </div>

      <div v-if="store.selectedAnnotationId" class="pp-field">
        <textarea
          :value="annotationText"
          class="pp-input panel-annotation__textarea"
          rows="5"
          placeholder="输入注释内容..."
          @input="updateAnnotationText($event.target.value)"
        />
      </div>
      <div v-else class="pp-empty">请先选择注释。</div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除当前注释或清空全部。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" :disabled="!store.selectedAnnotationId" @click="deleteAnnotation">
          删除当前注释
        </button>
        <button class="pp-btn pp-btn--ghost" type="button" :disabled="!annotations.length" @click="store.clearAnnotations()">
          清空全部注释
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel-annotation__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.panel-annotation__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(188, 31, 255, 0.14);
  background: rgba(10, 10, 16, 0.82);
  color: var(--toolbar-text);
  cursor: pointer;
  text-align: left;
  clip-path: var(--clip-chamfer-xs);
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    transform var(--transition-fast);
}

.panel-annotation__item:hover {
  border-color: rgba(255, 10, 192, 0.34);
  transform: translateY(-1px);
}

.panel-annotation__item--active {
  border-color: rgba(255, 10, 192, 0.46);
  background: rgba(255, 10, 192, 0.1);
}

.panel-annotation__item-text {
  min-width: 0;
  word-break: break-word;
}

.panel-annotation__item-meta {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  flex-shrink: 0;
}

.panel-annotation__textarea {
  min-height: 120px;
  resize: vertical;
}
</style>
