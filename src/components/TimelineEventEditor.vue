<script setup>
import { computed, reactive, watchEffect } from 'vue'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const years = computed(() => store.timelineYears)
const newDraftByYear = reactive({})
const positionDraftByYear = reactive({})
const delayDraftByYear = reactive({})
const createDraft = reactive({
  year: '',
  description: '',
  position: 'before',
})

const groupedRows = computed(() => {
  const groupMap = new Map()
  const delayMap = new Map()
  for (const raw of store.project?.timelineYearDelays || []) {
    const y = Number(raw?.year)
    if (!Number.isFinite(y)) continue
    delayMap.set(y, {
      beforeMs: Math.max(0, Number(raw?.beforeMs || 0)),
      afterMs: Math.max(0, Number(raw?.afterMs || 0)),
    })
  }
  for (const raw of store.project?.timelineEvents || []) {
    const year = Number(raw?.year)
    if (!Number.isFinite(year)) continue
    const description = String(raw?.description || '').trim()
    if (!description) continue
    if (!groupMap.has(year)) {
      groupMap.set(year, {
        year,
        position: raw?.position === 'after' ? 'after' : raw?.position === 'year_end' ? 'year_end' : 'before',
        items: [],
      })
    }
    const group = groupMap.get(year)
    group.items.push({
      id: String(raw.id || ''),
      description,
      order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 0,
    })
  }

  const rows = years.value.map((year) => {
    const group = groupMap.get(year) || { year, position: 'before', items: [] }
    group.items.sort((a, b) => a.order - b.order)
    return {
      year,
      position: group.position,
      items: group.items,
      edgeCount: (store.project?.edges || []).filter((e) => e.openingYear === year).length,
      beforeDelayMs: delayMap.get(year)?.beforeMs || 0,
      afterDelayMs: delayMap.get(year)?.afterMs || 0,
    }
  })

  return rows
})

function updateGroupPosition(year, value) {
  const normalized = value === 'after' ? 'after' : value === 'year_end' ? 'year_end' : 'before'
  positionDraftByYear[String(year)] = normalized
  store.setTimelineEventPosition(year, normalized)
}

function getRowPosition(row) {
  const key = String(row.year)
  const draft = positionDraftByYear[key]
  if (draft === 'after' || draft === 'before' || draft === 'year_end') return draft
  return row.position === 'after' ? 'after' : row.position === 'year_end' ? 'year_end' : 'before'
}

function addEvent(year) {
  const text = String(newDraftByYear[year] || '').trim()
  if (!text) return
  const key = String(year)
  const position = positionDraftByYear[key] === 'after'
    ? 'after'
    : positionDraftByYear[key] === 'year_end'
      ? 'year_end'
      : 'before'
  store.addTimelineEventItem(year, text, position)
  newDraftByYear[year] = ''
  positionDraftByYear[key] = position
}

function saveEventItem(eventId, value) {
  const text = String(value || '').trim()
  if (!text) return
  store.updateTimelineEventItem(eventId, { description: text })
}

function removeEventItem(eventId) {
  store.removeTimelineEventItem(eventId)
}

function updateYearDelay(year, type, value) {
  const parsed = Number(value || 0)
  const sec = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  const ms = Math.round(sec * 1000)
  if (type === 'before') {
    store.setTimelineYearDelay(year, { beforeMs: ms })
  } else {
    store.setTimelineYearDelay(year, { afterMs: ms })
  }
}

function getDelayDraftSec(row, type) {
  const key = String(row.year)
  const draft = delayDraftByYear[key]
  if (draft && Number.isFinite(Number(draft[type]))) {
    return draft[type]
  }
  return type === 'before' ? row.beforeDelayMs / 1000 : row.afterDelayMs / 1000
}

function updateDelayDraft(row, type, value) {
  const key = String(row.year)
  if (!delayDraftByYear[key]) {
    delayDraftByYear[key] = {
      before: row.beforeDelayMs / 1000,
      after: row.afterDelayMs / 1000,
    }
  }
  const parsed = Number(value)
  delayDraftByYear[key][type] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  updateYearDelay(row.year, type, delayDraftByYear[key][type])
}

function commitDelayDraft(row, type, value) {
  updateDelayDraft(row, type, value)
  const key = String(row.year)
  if (!delayDraftByYear[key]) return
  const rounded = Math.round((delayDraftByYear[key][type] || 0) * 10) / 10
  delayDraftByYear[key][type] = rounded
}

function addCustomYear() {
  const year = Number(createDraft.year)
  const description = String(createDraft.description || '').trim()
  if (!Number.isFinite(year) || !description) return
  const position = createDraft.position === 'after'
    ? 'after'
    : createDraft.position === 'year_end'
      ? 'year_end'
      : 'before'
  store.addTimelineEventItem(year, description, position)
  positionDraftByYear[String(year)] = position
  createDraft.year = ''
  createDraft.description = ''
  createDraft.position = 'before'
}

watchEffect(() => {
  const activeYears = new Set()
  for (const row of groupedRows.value) {
    const key = String(row.year)
    activeYears.add(key)
    if (row.items.length > 0 || positionDraftByYear[key] == null) {
      positionDraftByYear[key] = row.position === 'after' ? 'after' : row.position === 'year_end' ? 'year_end' : 'before'
    }
    delayDraftByYear[key] = {
      before: row.beforeDelayMs / 1000,
      after: row.afterDelayMs / 1000,
    }
  }
  for (const key of Object.keys(positionDraftByYear)) {
    if (!activeYears.has(key)) {
      delete positionDraftByYear[key]
    }
  }
  for (const key of Object.keys(delayDraftByYear)) {
    if (!activeYears.has(key)) {
      delete delayDraftByYear[key]
    }
  }
})
</script>

<template>
  <div class="timeline-events">
    <div class="timeline-events__header">
      <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
      <span>年份事件</span>
    </div>

    <div class="timeline-events__create">
      <input
        v-model="createDraft.year"
        class="timeline-events__year-input"
        type="number"
        step="1"
        placeholder="新增年份"
      />
      <select v-model="createDraft.position" class="timeline-events__select">
        <option value="before">开通前</option>
        <option value="after">开通后</option>
        <option value="year_end">年度最后（全网）</option>
      </select>
      <input
        v-model="createDraft.description"
        class="timeline-events__input"
        type="text"
        placeholder="该年份第一条事件"
        @keydown.enter.prevent="addCustomYear"
      />
      <button class="timeline-events__add-btn" type="button" @click="addCustomYear">新增年份</button>
    </div>

    <div v-if="!groupedRows.length" class="timeline-events__empty">
      暂无年份事件，先在上方新增一个年份
    </div>

    <div v-else class="timeline-events__list">
      <div v-for="row in groupedRows" :key="row.year" class="timeline-events__item">
        <div class="timeline-events__year-row">
          <span class="timeline-events__year">{{ row.year }}</span>
          <span class="timeline-events__count">{{ row.edgeCount }} 段</span>
        </div>

        <div class="timeline-events__position-row">
          <label class="timeline-events__label">显示时机</label>
          <select
            class="timeline-events__select"
            :value="getRowPosition(row)"
            @change="updateGroupPosition(row.year, $event.target.value)"
          >
            <option value="before">开通前</option>
            <option value="after">开通后</option>
            <option value="year_end">年度最后（全网）</option>
          </select>
        </div>

        <div class="timeline-events__delay-row">
          <label class="timeline-events__label">延时模式</label>
          <div class="timeline-events__delay-inputs">
            <label class="timeline-events__delay-item">
              <span>之前</span>
              <input
                class="timeline-events__delay-input"
                type="number"
                min="0"
                step="0.1"
                :value="getDelayDraftSec(row, 'before')"
                @input="updateDelayDraft(row, 'before', $event.target.value)"
                @change="commitDelayDraft(row, 'before', $event.target.value)"
              />
              <span>s</span>
            </label>
            <label class="timeline-events__delay-item">
              <span>之后</span>
              <input
                class="timeline-events__delay-input"
                type="number"
                min="0"
                step="0.1"
                :value="getDelayDraftSec(row, 'after')"
                @input="updateDelayDraft(row, 'after', $event.target.value)"
                @change="commitDelayDraft(row, 'after', $event.target.value)"
              />
              <span>s</span>
            </label>
          </div>
        </div>

        <div v-if="row.items.length" class="timeline-events__entries">
          <div v-for="(entry, index) in row.items" :key="entry.id" class="timeline-events__entry">
            <span class="timeline-events__entry-index">{{ index + 1 }}</span>
            <textarea
              class="timeline-events__textarea"
              :value="entry.description"
              rows="2"
              @blur="saveEventItem(entry.id, $event.target.value)"
              @keydown.enter.ctrl.prevent="saveEventItem(entry.id, $event.target.value)"
            />
            <button
              class="timeline-events__remove-btn"
              type="button"
              title="删除事件"
              @click="removeEventItem(entry.id)"
            >
              删除
            </button>
          </div>
        </div>

        <div class="timeline-events__add-row">
          <input
            v-model="newDraftByYear[row.year]"
            class="timeline-events__input"
            type="text"
            placeholder="添加该年份事件，例如：一期规划获批"
            @keydown.enter.prevent="addEvent(row.year)"
          />
          <button class="timeline-events__add-btn" type="button" @click="addEvent(row.year)">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-events {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-events,
.timeline-events * {
  box-sizing: border-box;
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
  padding: 8px;
  border: 1px dashed var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
}

.timeline-events__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-events__create {
  display: grid;
  grid-template-columns: minmax(82px, 0.8fr) minmax(104px, 1fr) minmax(0, 2fr) auto;
  gap: 6px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
}

.timeline-events__create > * {
  min-width: 0;
}

.timeline-events__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--toolbar-input-bg);
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
}

.timeline-events__year-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
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
  white-space: nowrap;
}

.timeline-events__position-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.timeline-events__label {
  font-size: 11px;
  color: var(--workspace-panel-muted);
  white-space: nowrap;
}

.timeline-events__select {
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  max-width: 100%;
}

.timeline-events__delay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.timeline-events__delay-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.timeline-events__delay-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--workspace-panel-muted);
}

.timeline-events__delay-input {
  width: 68px;
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 11px;
}

.timeline-events__entries {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-events__entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 8px;
}

.timeline-events__entry > * {
  min-width: 0;
}

.timeline-events__entry-index {
  margin-top: 7px;
  font-size: 11px;
  color: var(--workspace-panel-muted);
  min-width: 14px;
  text-align: center;
}

.timeline-events__textarea {
  width: 100%;
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 5px 6px;
  font-size: 11px;
  line-height: 1.4;
  resize: vertical;
  min-height: 54px;
  max-width: 100%;
  box-sizing: border-box;
}

.timeline-events__remove-btn {
  border: 1px solid rgba(239, 68, 68, 0.55);
  background: transparent;
  color: #ef4444;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 11px;
  cursor: pointer;
}

.timeline-events__add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
}

.timeline-events__add-row > * {
  min-width: 0;
}

.timeline-events__input {
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 5px 6px;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.timeline-events__year-input {
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border-radius: 4px;
  padding: 5px 6px;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.timeline-events__add-btn {
  border: 1px solid var(--toolbar-primary-bg);
  background: var(--toolbar-primary-bg);
  color: var(--toolbar-primary-text, #fff);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
}

@media (max-width: 1100px) {
  .timeline-events__create {
    grid-template-columns: minmax(86px, 0.9fr) minmax(100px, 1fr) minmax(0, 1.6fr);
  }

  .timeline-events__create .timeline-events__add-btn {
    grid-column: 1 / -1;
    width: 100%;
  }
}

@media (max-width: 760px) {
  .timeline-events__create {
    grid-template-columns: 1fr;
  }

  .timeline-events__entry {
    grid-template-columns: 1fr;
  }

  .timeline-events__entry-index {
    margin-top: 0;
    justify-self: start;
  }

  .timeline-events__remove-btn {
    justify-self: end;
  }

  .timeline-events__add-row {
    grid-template-columns: 1fr;
  }

  .timeline-events__add-row .timeline-events__add-btn {
    width: 100%;
  }
}
</style>
