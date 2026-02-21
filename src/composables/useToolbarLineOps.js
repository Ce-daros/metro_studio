import { computed, inject, reactive, watch } from 'vue'
import { getDisplayLineName } from '../lib/lineNaming'
import { normalizeLineStyle } from '../lib/lineStyles'
import { useProjectStore } from '../stores/projectStore'
import { isTrial, TRIAL_LIMITS } from './useLicense'

/**
 * Composable for line-related operations in the toolbar:
 * line form state, add/delete/update line, display name helper.
 *
 * @returns Reactive state and methods for line operations
 */
export function useToolbarLineOps() {
  const store = useProjectStore()
  const showUpgradeDialog = inject('showUpgradeDialog', () => {})

  const lineForm = reactive({
    nameZh: '',
    nameEn: '',
    color: '#005BBB',
    status: 'open',
    style: 'solid',
  })

  const activeLine = computed(() => {
    if (!store.project || !store.activeLineId) return null
    return store.project.lines.find((line) => line.id === store.activeLineId) || null
  })

  // Sync lineForm when active line changes
  watch(
    activeLine,
    (line) => {
      lineForm.nameZh = line?.nameZh || ''
      lineForm.nameEn = line?.nameEn || ''
      lineForm.color = line?.color || '#005BBB'
      lineForm.status = line?.status || 'open'
      lineForm.style = normalizeLineStyle(line?.style)
    },
    { immediate: true },
  )

  function addLine() {
    if (isTrial.value && store.project?.lines?.length >= TRIAL_LIMITS.maxLines) {
      showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxLines} 条线路，请激活正式版以解除限制。`)
      return
    }
    store.addLine({})
  }

  function applyLineChanges() {
    if (!activeLine.value) return
    store.updateLine(activeLine.value.id, {
      nameZh: lineForm.nameZh,
      nameEn: lineForm.nameEn,
      color: lineForm.color,
      status: lineForm.status,
      style: lineForm.style,
    })
  }

  function deleteActiveLine() {
    if (!activeLine.value) return
    store.deleteLine(activeLine.value.id)
  }

  function displayLineName(line) {
    return getDisplayLineName(line, 'zh') || line?.nameZh || ''
  }

  return {
    lineForm,
    activeLine,
    addLine,
    applyLineChanges,
    deleteActiveLine,
    displayLineName,
  }
}
