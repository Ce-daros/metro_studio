<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import ProjectThumbnail from './ProjectThumbnail.vue'
import { NTooltip, NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { useDialog } from '../composables/useDialog.js'
import { downloadProjectsZip } from '../lib/storage/projectFile'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const store = useProjectStore()
const { confirm } = useDialog()
const projectOptions = ref([])
const projectFilter = ref('')
const selectedProjectIds = ref([])
const isBulkWorking = ref(false)

const currentProjectId = computed(() => store.project?.id || '')
const searchKeyword = computed(() => String(projectFilter.value || '').trim().toLowerCase())

const filteredProjectOptions = computed(() => {
  const keyword = searchKeyword.value
  if (!keyword) return projectOptions.value
  return projectOptions.value.filter((project) => {
    const name = String(project.name || '').toLowerCase()
    const id = String(project.id || '').toLowerCase()
    return name.includes(keyword) || id.includes(keyword)
  })
})

const selectedProjects = computed(() => {
  const selectedSet = new Set(selectedProjectIds.value)
  return projectOptions.value.filter((project) => selectedSet.has(project.id))
})

const hasSelection = computed(() => selectedProjectIds.value.length > 0)
const allVisibleSelected = computed(() => {
  if (!filteredProjectOptions.value.length) return false
  const selectedSet = new Set(selectedProjectIds.value)
  return filteredProjectOptions.value.every((project) => selectedSet.has(project.id))
})

const resultSummary = computed(() => {
  return `显示 ${filteredProjectOptions.value.length} / ${projectOptions.value.length}，已选 ${selectedProjectIds.value.length}`
})

async function refreshList() {
  projectOptions.value = await store.listProjects()
  const validIds = new Set(projectOptions.value.map((project) => project.id))
  selectedProjectIds.value = selectedProjectIds.value.filter((id) => validIds.has(id))
}

function isSelected(projectId) {
  return selectedProjectIds.value.includes(projectId)
}

function toggleProjectSelection(projectId) {
  if (!projectId) return
  if (isSelected(projectId)) {
    selectedProjectIds.value = selectedProjectIds.value.filter((id) => id !== projectId)
    return
  }
  selectedProjectIds.value = [...selectedProjectIds.value, projectId]
}

function toggleSelectAllVisible() {
  const visibleIds = filteredProjectOptions.value.map((project) => project.id)
  if (!visibleIds.length) return

  if (allVisibleSelected.value) {
    const visibleSet = new Set(visibleIds)
    selectedProjectIds.value = selectedProjectIds.value.filter((id) => !visibleSet.has(id))
    return
  }

  const merged = new Set([...selectedProjectIds.value, ...visibleIds])
  selectedProjectIds.value = [...merged]
}

function clearSelection() {
  selectedProjectIds.value = []
}

async function loadProject(projectId) {
  await store.loadProjectById(projectId)
  await refreshList()
  emit('close')
}

async function deleteProject(projectId) {
  const target = projectOptions.value.find((p) => p.id === projectId)
  const targetName = target?.name || projectId
  const ok = await confirm({ title: '删除工程', message: `确认删除工程「${targetName}」吗？此操作不可撤销。`, confirmText: '删除', danger: true })
  if (!ok) return
  await store.deleteProjectById(projectId)
  selectedProjectIds.value = selectedProjectIds.value.filter((id) => id !== projectId)
  await refreshList()
}

async function deleteSelectedProjects() {
  if (!selectedProjects.value.length || isBulkWorking.value) return
  const count = selectedProjects.value.length
  const ok = await confirm({
    title: '批量删除工程',
    message: `确认删除选中的 ${count} 个工程吗？此操作不可撤销。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  isBulkWorking.value = true
  try {
    const projectIds = [...selectedProjectIds.value]
    for (const projectId of projectIds) {
      await store.deleteProjectById(projectId)
    }
    selectedProjectIds.value = []
    await refreshList()
    store.statusText = `已批量删除 ${count} 个工程`
  } finally {
    isBulkWorking.value = false
  }
}

async function exportSelectedProjectsZip() {
  if (!selectedProjects.value.length || isBulkWorking.value) return
  isBulkWorking.value = true
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    await downloadProjectsZip(selectedProjects.value, `metro-studio-projects_${timestamp}.zip`)
    store.statusText = `已导出 ${selectedProjects.value.length} 个工程（ZIP）`
  } catch (error) {
    store.statusText = `批量导出失败: ${error.message || '未知错误'}`
  } finally {
    isBulkWorking.value = false
  }
}

function isCurrentProject(projectId) {
  return currentProjectId.value === projectId
}

function highlightedParts(text) {
  const source = String(text || '')
  const keyword = searchKeyword.value
  if (!keyword) return [{ text: source, matched: false }]

  const lower = source.toLowerCase()
  const parts = []
  let cursor = 0

  while (cursor < source.length) {
    const hit = lower.indexOf(keyword, cursor)
    if (hit < 0) {
      parts.push({ text: source.slice(cursor), matched: false })
      break
    }
    if (hit > cursor) {
      parts.push({ text: source.slice(cursor, hit), matched: false })
    }
    parts.push({ text: source.slice(hit, hit + keyword.length), matched: true })
    cursor = hit + keyword.length
  }

  return parts.length ? parts : [{ text: source, matched: false }]
}

watch(() => props.visible, async (visible) => {
  if (visible) {
    await refreshList()
    return
  }
  projectFilter.value = ''
  clearSelection()
})

onMounted(() => {
  refreshList()
})
</script>

<template>
  <NModal
    :show="visible"
    preset="card"
    title="本地库"
    style="width:min(760px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100vh - 24px)"
    @close="emit('close')"
    @mask-click="emit('close')"
  >
    <div class="dialog__body">
      <div class="dialog__search-row">
        <div class="dialog__search-wrap">
          <span style="font-size:14px;color:var(--ark-pink);line-height:1;" class="dialog__search-icon">▣</span>
          <input
            v-model="projectFilter"
            class="dialog__search"
            placeholder="搜索工程名或 ID..."
          />
          <NTooltip v-if="projectFilter" placement="bottom">
            <template #trigger>
              <button class="dialog__search-clear" type="button" @click="projectFilter = ''">
                <span style="font-size:12px;color:var(--ark-pink);line-height:1;">▣</span>
              </button>
            </template>
            清除搜索
          </NTooltip>
        </div>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="dialog__refresh-btn" type="button" :disabled="isBulkWorking" @click="refreshList">刷新</button>
          </template>
          刷新本地库
        </NTooltip>
      </div>

      <div class="dialog__bulk-row">
        <button
          class="dialog__select-all"
          type="button"
          :disabled="!filteredProjectOptions.length || isBulkWorking"
          @click="toggleSelectAllVisible"
        >
          <span style="font-size:13px;color:var(--ark-pink);line-height:1;">{{ allVisibleSelected ? '▨' : '▢' }}</span>
          <span>全选当前结果</span>
        </button>
        <div class="dialog__bulk-actions">
          <button class="dialog__action-btn" :disabled="!hasSelection || isBulkWorking" @click="exportSelectedProjectsZip">
            导出选中 ZIP
          </button>
          <button class="dialog__action-btn dialog__action-btn--danger" :disabled="!hasSelection || isBulkWorking" @click="deleteSelectedProjects">
            批量删除
          </button>
        </div>
      </div>

      <div class="dialog__summary">{{ resultSummary }}</div>

      <ul class="dialog__list">
        <li v-for="project in filteredProjectOptions" :key="project.id">
          <div class="dialog__item" :class="{ 'dialog__item--active': isCurrentProject(project.id) }">
            <button
              class="dialog__checkbox-wrap"
              :class="{ 'dialog__checkbox-wrap--selected': isSelected(project.id) }"
              type="button"
              :disabled="isBulkWorking"
              @click="toggleProjectSelection(project.id)"
            >
              <span style="font-size:13px;color:var(--ark-pink);line-height:1;">{{ isSelected(project.id) ? '▨' : '▢' }}</span>
            </button>
            <ProjectThumbnail :project="project" class="dialog__thumbnail" />
            <div class="dialog__item-main">
              <span class="dialog__item-name">
                <template v-for="(part, index) in highlightedParts(project.name)" :key="`${project.id}-name-${index}`">
                  <mark v-if="part.matched" class="dialog__mark">{{ part.text }}</mark>
                  <span v-else>{{ part.text }}</span>
                </template>
              </span>
              <small class="dialog__item-meta">
                <span class="dialog__item-id">
                  ID:
                  <template v-for="(part, index) in highlightedParts(project.id)" :key="`${project.id}-id-${index}`">
                    <mark v-if="part.matched" class="dialog__mark">{{ part.text }}</mark>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </span>
                <span>{{ new Date(project.meta.updatedAt).toLocaleString() }}</span>
              </small>
            </div>
            <div class="dialog__item-actions">
              <NTooltip placement="bottom">
                <template #trigger>
                  <button class="dialog__action-btn" :disabled="isBulkWorking" @click="loadProject(project.id)">加载</button>
                </template>
                加载此工程
              </NTooltip>
              <NTooltip placement="bottom">
                <template #trigger>
                  <button class="dialog__action-btn dialog__action-btn--danger" :disabled="isBulkWorking" @click="deleteProject(project.id)">删除</button>
                </template>
                删除此工程
              </NTooltip>
            </div>
          </div>
        </li>
        <li v-if="!filteredProjectOptions.length" class="dialog__empty">
          <span style="font-size:32px;color:var(--ark-pink);line-height:1;" class="dialog__empty-icon">▣</span>
          <span>{{ projectFilter ? '无匹配工程' : '本地库暂无工程' }}</span>
        </li>
      </ul>
    </div>
  </NModal>
</template>

<style scoped>
.dialog__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 260px;
  max-height: calc(100vh - 180px);
  overflow: hidden;
}

.dialog__search-row {
  display: flex;
  gap: 8px;
}

.dialog__search-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.dialog__search-icon {
  position: absolute;
  left: 10px;
  color: var(--toolbar-muted);
  pointer-events: none;
}

.dialog__search {
  width: 100%;
  padding: 7px 30px 7px 32px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  outline: none;
  transition: box-shadow var(--transition-normal, 0.15s ease), border-color var(--transition-normal, 0.15s ease), background var(--transition-normal, 0.15s ease);
}

.dialog__search:focus {
  border-color: var(--ark-pink);
  box-shadow: 0 0 0 1px rgba(249, 0, 191, 0.24), 0 0 10px rgba(249, 0, 191, 0.12);
  background: var(--toolbar-item-bg);
}

.dialog__search-clear {
  position: absolute;
  right: 6px;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
}

.dialog__search-clear:hover {
  color: var(--toolbar-text);
}

.dialog__refresh-btn {
  padding: 7px 12px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.1s ease);
}

.dialog__refresh-btn:hover:not(:disabled) {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.dialog__refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dialog__bulk-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.dialog__select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--toolbar-text);
  font-size: 12px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 5px;
  background: var(--toolbar-input-bg);
  padding: 4px 9px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
}

.dialog__select-all:hover:not(:disabled) {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.dialog__select-all:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dialog__bulk-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dialog__summary {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.dialog__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.dialog__list::-webkit-scrollbar {
  width: 7px;
}

.dialog__list::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border: 1px solid rgba(188, 31, 255, 0.3);
  border-radius: 10px;
}

.dialog__item {
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  transition: border-color var(--transition-fast, 0.1s ease), background var(--transition-fast, 0.1s ease);
}

.dialog__item:hover {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.dialog__item:hover::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--indicator-width, 2px);
  height: 20px;
  background: var(--indicator-color, var(--toolbar-primary-bg));
  border-radius: 0 1px 1px 0;
}

.dialog__item--active {
  border-color: var(--toolbar-active-border, var(--ark-pink));
  border-width: 2px;
  padding: 7px 9px 7px 9px;
  background: var(--toolbar-tab-active-bg);
}

.dialog__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--indicator-width, 2px);
  height: 20px;
  background: var(--indicator-color, var(--toolbar-primary-bg));
  border-radius: 0 1px 1px 0;
}

.dialog__checkbox-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 5px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-muted);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
}

.dialog__checkbox-wrap:hover:not(:disabled) {
  border-color: var(--ark-pink);
  color: var(--toolbar-text);
}

.dialog__checkbox-wrap--selected {
  border-color: var(--ark-pink);
  color: var(--ark-pink);
  box-shadow: inset 0 0 0 1px rgba(249, 0, 191, 0.2);
}

.dialog__checkbox-wrap:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dialog__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dialog__item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--toolbar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog__item-meta {
  font-size: 11px;
  color: var(--toolbar-muted);
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.dialog__item-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
}

.dialog__mark {
  background: rgba(249, 0, 191, 0.16);
  box-shadow: inset 0 0 0 1px rgba(249, 0, 191, 0.18);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
}

.dialog__item-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dialog__action-btn {
  padding: 4px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 5px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.1s ease);
}

.dialog__action-btn:hover:not(:disabled) {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.dialog__action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dialog__action-btn--danger {
  color: var(--toolbar-danger, #e74c3c);
}

.dialog__action-btn--danger:hover:not(:disabled) {
  border-color: var(--toolbar-danger, #e74c3c);
}

.dialog__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 32px 24px;
  color: var(--toolbar-muted);
  font-size: 13px;
}

.dialog__empty-icon {
  opacity: 0.4;
}

@media (max-width: 640px) {
  .dialog__body {
    max-height: calc(100vh - 132px);
  }

  .dialog__thumbnail {
    display: none;
  }

  .dialog__item {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .dialog__item-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
    padding-left: 30px;
  }

  .dialog__item-id {
    max-width: 100%;
  }
}
</style>
