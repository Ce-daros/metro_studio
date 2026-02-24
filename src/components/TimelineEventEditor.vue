<script setup>
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const years = computed(() => store.timelineYears)

const events = computed(() => {
  if (!store.project?.timelineEvents) return []
  const eventMap = new Map(store.project.timelineEvents.map((e) => [e.year, e.description]))
  return years.value.map((year) => ({
    year,
    description: eventMap.get(year) || '',
    edgeCount: store.project.edges.filter((e) => e.openingYear === year).length,
  }))
})

const editingYear = ref(null)
const editingText = ref('')

function startEdit(year, currentDescription) {
  editingYear.value = year
  editingText.value = currentDescription
}

function saveEdit() {
  if (editingYear.value == null) return
  const text = editingText.value.trim()
  if (text) {
    store.addTimelineEvent(editingYear.value, text)
  } else {
    store.removeTimelineEvent(editingYear.value)
  }
  editingYear.value = null
  editingText.value = ''
}

function cancelEdit() {
  editingYear.value = null
  editingText.value = ''
}

function onKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveEdit()
  } else if (event.key === 'Escape') {
    cancelEdit()
  }
}
</script>

<template>
  <div class="timeline-events">
    <div class="timeline-events__header">
      <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
      <span>年份事件</span>
    </div>

    <div v-if="!events.length" class="timeline-events__empty">
      暂无标记年份的线段
    </div>

    <div v-else class="timeline-events__list">
      <div
        v-for="evt in events"
        :key="evt.year"
        class="timeline-events__item"
      >
        <div class="timeline-events__year-row">
          <span class="timeline-events__year">{{ evt.year }}</span>
          <span class="timeline-events__count">{{ evt.edgeCount }} 段</span>
        </div>

        <div v-if="editingYear === evt.year" class="timeline-events__edit">
          <input
            v-model="editingText"
            class="timeline-events__input"
            type="text"
            placeholder="如：1 号线一期开通运营"
            autofocus
            @keydown="onKeyDown"
            @blur="saveEdit"
          />
        </div>
        <div
          v-else
          class="timeline-events__desc"
          :class="{ 'timeline-events__desc--empty': !evt.description }"
          @click="startEdit(evt.year, evt.description)"
        >
          {{ evt.description || '点击添加描述...' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-events {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-events__header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--workspace-panel-text);
}

.timeline-events__empty {
  font-size: 11px;
  color: var(--workspace-panel-muted);
  padding: 4px 0;
}

.timeline-events__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-events__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
}

.timeline-events__year-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.timeline-events__year {
  font-size: 13px;
  font-weight: 700;
  color: var(--toolbar-text);
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', monospace;
}

.timeline-events__count {
  font-size: 10px;
  color: var(--workspace-panel-muted);
}

.timeline-events__desc {
  font-size: 11px;
  color: var(--toolbar-text);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background var(--transition-fast);
  min-height: 18px;
}

.timeline-events__desc:hover {
  background: rgba(255, 255, 255, 0.05);
}

.timeline-events__desc--empty {
  color: var(--workspace-panel-muted);
  font-style: italic;
}

.timeline-events__edit {
  display: flex;
}

.timeline-events__input {
  flex: 1;
  border: 1px solid var(--toolbar-primary-bg);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 11px;
  outline: none;
}

.timeline-events__input:focus {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}
</style>
