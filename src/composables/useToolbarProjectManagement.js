import { computed, inject, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useDialog } from './useDialog.js'
import { isTrial, TRIAL_LIMITS } from './useLicense'

/**
 * Composable for project lifecycle management in the toolbar:
 * project list, create/load/rename/copy/delete, file import.
 *
 * @returns Reactive state and methods for project management
 */
export function useToolbarProjectManagement() {
  const store = useProjectStore()
  const { confirm } = useDialog()
  const showUpgradeDialog = inject('showUpgradeDialog', () => {})

  const newProjectName = ref('新建工程')
  const projectRenameName = ref('')
  const projectFilter = ref('')
  const fileInputRef = ref(null)
  const projectOptions = ref([])

  const currentProjectId = computed(() => store.project?.id || '')

  const filteredProjectOptions = computed(() => {
    const keyword = String(projectFilter.value || '').trim().toLowerCase()
    if (!keyword) return projectOptions.value
    return projectOptions.value.filter((project) => {
      const name = String(project.name || '').toLowerCase()
      const id = String(project.id || '').toLowerCase()
      return name.includes(keyword) || id.includes(keyword)
    })
  })

  async function refreshProjectOptions() {
    projectOptions.value = await store.listProjects()
  }

  async function createProject() {
    if (isTrial.value) {
      const projects = await store.listProjects()
      if (projects.length >= TRIAL_LIMITS.maxProjects) {
        showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxProjects} 个项目，请激活正式版以解除限制。`)
        return
      }
    }
    await store.createNewProject(newProjectName.value.trim() || '新建工程')
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  async function importFromOsm() {
    await store.importJinanNetwork()
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  function chooseProjectFile() {
    fileInputRef.value?.click()
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await store.importProjectFile(file)
      projectRenameName.value = store.project?.name || ''
      await refreshProjectOptions()
    } catch (error) {
      store.statusText = `加载工程失败: ${error.message || '未知错误'}`
    } finally {
      event.target.value = ''
    }
  }

  async function onLoadProject(projectId) {
    await store.loadProjectById(projectId)
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  async function renameCurrentProject() {
    if (!store.project) return
    await store.renameCurrentProject(projectRenameName.value || store.project.name)
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  async function duplicateCurrentProject() {
    if (!store.project) return
    if (isTrial.value) {
      const projects = await store.listProjects()
      if (projects.length >= TRIAL_LIMITS.maxProjects) {
        showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxProjects} 个项目，请激活正式版以解除限制。`)
        return
      }
    }
    await store.duplicateCurrentProject(projectRenameName.value || `${store.project.name} 副本`)
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  async function deleteProject(projectId) {
    const target = projectOptions.value.find((project) => project.id === projectId)
    const targetName = target?.name || projectId
    const ok = await confirm({ title: '删除工程', message: `确认删除工程「${targetName}」吗？此操作不可撤销。`, confirmText: '删除', danger: true })
    if (!ok) return
    await store.deleteProjectById(projectId)
    projectRenameName.value = store.project?.name || ''
    await refreshProjectOptions()
  }

  async function deleteCurrentProject() {
    if (!store.project) return
    await deleteProject(store.project.id)
  }

  async function persistProjectToDb() {
    await store.persistNow()
    await refreshProjectOptions()
  }

  function isCurrentProject(projectId) {
    return currentProjectId.value === projectId
  }

  // Sync projectRenameName when project changes
  watch(
    () => store.project?.id,
    () => {
      projectRenameName.value = store.project?.name || ''
    },
    { immediate: true },
  )

  return {
    newProjectName,
    projectRenameName,
    projectFilter,
    fileInputRef,
    projectOptions,
    currentProjectId,
    filteredProjectOptions,
    refreshProjectOptions,
    createProject,
    importFromOsm,
    chooseProjectFile,
    onFileSelected,
    onLoadProject,
    renameCurrentProject,
    duplicateCurrentProject,
    deleteProject,
    deleteCurrentProject,
    persistProjectToDb,
    isCurrentProject,
  }
}
