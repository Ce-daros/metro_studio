const STORAGE_KEY = 'metro_studio_custom_shortcuts'

const DEFAULT_SHORTCUTS = [
  // 文件
  { id: 'file.save',       label: '存入本地库',     defaultBinding: 'Ctrl+S',       category: '文件', when: 'global' },
  { id: 'file.exportFile', label: '保存文件',       defaultBinding: 'Ctrl+Shift+S', category: '文件', when: 'global' },
  { id: 'file.newProject', label: '新建工程',       defaultBinding: 'Ctrl+N',       category: '文件', when: 'global' },
  { id: 'file.openFile',   label: '打开文件',       defaultBinding: 'Ctrl+O',       category: '文件', when: 'global' },
  { id: 'file.exportPng',  label: '导出示意图 PNG', defaultBinding: 'Ctrl+E',       category: '文件', when: 'global' },

  // 编辑
  { id: 'edit.undo',          label: '撤销',           defaultBinding: 'Ctrl+Z',       category: '编辑', when: 'global' },
  { id: 'edit.redo',          label: '重做',           defaultBinding: 'Ctrl+Shift+Z', category: '编辑', when: 'global' },
  { id: 'edit.redoAlt',       label: '重做',           defaultBinding: 'Ctrl+Y',       category: '编辑', when: 'global', hidden: true },
  { id: 'edit.selectAll',     label: '全选站点',       defaultBinding: 'Ctrl+A',       category: '编辑', when: 'global' },
  { id: 'edit.selectAllLines', label: '全选所有线路',  defaultBinding: 'Alt+A',        category: '编辑', when: 'global' },
  { id: 'edit.copy',          label: '复制选中',       defaultBinding: 'Ctrl+C',       category: '编辑', when: 'global' },
  { id: 'edit.paste',         label: '粘贴',           defaultBinding: 'Ctrl+V',       category: '编辑', when: 'global' },
  { id: 'edit.escape',        label: '取消/清空选择',  defaultBinding: 'Escape',       category: '编辑', when: 'global' },
  { id: 'edit.delete',        label: '删除选中',       defaultBinding: 'Delete',       category: '编辑', when: 'global' },
  { id: 'edit.deleteAlt',     label: '删除选中',       defaultBinding: 'Backspace',    category: '编辑', when: 'global', hidden: true },
  { id: 'edit.renameStation', label: '重命名站点',     defaultBinding: 'F2',           category: '编辑', when: 'global' },
  { id: 'edit.search',       label: '搜索地点',       defaultBinding: 'Ctrl+F',       category: '编辑', when: 'global' },

  // 视图
  { id: 'view.map',       label: '地图视图',   defaultBinding: '1', category: '视图', when: 'global' },
  { id: 'view.schematic', label: '示意图视图', defaultBinding: '2', category: '视图', when: 'global' },
  { id: 'view.hud',       label: 'HUD 视图',   defaultBinding: '3', category: '视图', when: 'global' },
  { id: 'view.preview',   label: '预览视图',   defaultBinding: '4', category: '视图', when: 'global' },

  // 工具（仅地图视图生效）
  { id: 'tool.select',       label: '选择工具',   defaultBinding: 'V', category: '工具', when: 'mapEditor' },
  { id: 'tool.addStation',   label: '添加站点工具', defaultBinding: 'S', category: '工具', when: 'mapEditor' },
  { id: 'tool.addEdge',      label: '添加线段工具', defaultBinding: 'E', category: '工具', when: 'mapEditor' },
  { id: 'tool.routeDraw',    label: '连续布线工具', defaultBinding: 'R', category: '工具', when: 'mapEditor' },
  { id: 'tool.styleBrush',   label: '样式刷工具', defaultBinding: 'M', category: '工具', when: 'mapEditor' },
  { id: 'tool.boxSelect',    label: '框选工具',   defaultBinding: 'B', category: '工具', when: 'mapEditor' },
  { id: 'tool.anchorEdit',   label: '锚点编辑',   defaultBinding: 'P', category: '工具', when: 'mapEditor' },
  { id: 'tool.annotation',   label: '注释工具',   defaultBinding: 'N', category: '工具', when: 'mapEditor' },

  // 导航
  { id: 'nav.exit', label: '退出导航', defaultBinding: 'Escape', category: '导航', when: 'navigation' },
]

/**
 * Check if an event target is a text input element.
 * Shared utility extracted from App.vue and useMapEventHandlers.js.
 */
export function isTextInputTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

/** Return a deep copy of the default shortcut definitions. */
export function getDefaultShortcuts() {
  return DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
}

/** Load custom binding overrides from localStorage. Returns a Map<id, bindingString>. */
export function loadCustomBindings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return new Map()
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

/** Save custom binding overrides to localStorage. */
export function saveCustomBindings(map) {
  try {
    const obj = Object.fromEntries(map)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch { /* noop */ }
}

/**
 * Merge defaults with custom overrides.
 * Returns an array of { id, label, category, when, hidden, binding, isCustom }.
 */
export function getEffectiveBindings() {
  const custom = loadCustomBindings()
  return DEFAULT_SHORTCUTS.map((def) => {
    const hasCustom = custom.has(def.id)
    return {
      id: def.id,
      label: def.label,
      category: def.category,
      when: def.when,
      hidden: Boolean(def.hidden),
      binding: hasCustom ? custom.get(def.id) : def.defaultBinding,
      isCustom: hasCustom,
    }
  })
}

/**
 * Parse a binding string like 'Ctrl+Shift+S' into a structured object.
 * Returns { ctrl: boolean, shift: boolean, alt: boolean, meta: boolean, key: string }.
 */
export function parseBinding(str) {
  const parts = String(str || '').split('+')
  const result = { ctrl: false, shift: false, alt: false, meta: false, key: '' }
  for (const part of parts) {
    const lower = part.toLowerCase().trim()
    if (lower === 'ctrl') { result.ctrl = true; continue }
    if (lower === 'shift') { result.shift = true; continue }
    if (lower === 'alt') { result.alt = true; continue }
    if (lower === 'meta') { result.meta = true; continue }
    result.key = part.trim()
  }
  return result
}

/**
 * Check if a KeyboardEvent matches a parsed binding.
 * Ctrl and Meta are treated as equivalent (for macOS Cmd support).
 */
export function matchesEvent(parsed, event) {
  const wantCtrl = parsed.ctrl || parsed.meta
  const hasCtrl = event.ctrlKey || event.metaKey
  if (wantCtrl !== hasCtrl) return false
  if (parsed.shift !== event.shiftKey) return false
  if (parsed.alt !== event.altKey) return false

  const eventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key
  const parsedKey = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key
  return eventKey === parsedKey
}

/**
 * Detect conflicts: bindings that share the same (when, binding) pair.
 * Returns an array of { binding, when, ids: string[] } for groups with >1 entry.
 */
export function detectConflicts(bindings) {
  const groups = new Map()
  for (const b of bindings) {
    const key = `${b.when}::${b.binding.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(b.id)
  }
  const conflicts = []
  for (const [key, ids] of groups) {
    if (ids.length <= 1) continue
    const [when, binding] = key.split('::')
    conflicts.push({ binding, when, ids })
  }
  return conflicts
}

/** Set a custom binding for a shortcut id. */
export function setCustomBinding(id, newBinding) {
  const custom = loadCustomBindings()
  const def = DEFAULT_SHORTCUTS.find((s) => s.id === id)
  if (def && def.defaultBinding === newBinding) {
    custom.delete(id)
  } else {
    custom.set(id, newBinding)
  }
  saveCustomBindings(custom)
}

/** Reset a single shortcut to its default binding. */
export function resetBinding(id) {
  const custom = loadCustomBindings()
  custom.delete(id)
  saveCustomBindings(custom)
}

/** Reset all shortcuts to defaults. */
export function resetAllBindings() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch { /* noop */ }
}

/**
 * Format a binding string for display.
 * Replaces 'Ctrl' with '⌘' on macOS, etc.
 */
export function formatBindingDisplay(binding) {
  if (!binding) return ''
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
  let display = binding
  if (isMac) {
    display = display
      .replace(/Ctrl\+/g, '⌘')
      .replace(/Alt\+/g, '⌥')
      .replace(/Shift\+/g, '⇧')
      .replace(/Meta\+/g, '⌘')
  }
  return display
}

/**
 * Convert a KeyboardEvent into a binding string (for recording mode).
 * Returns null if only modifier keys are pressed.
 */
export function eventToBindingString(event) {
  const key = event.key
  // Ignore standalone modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null

  const parts = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')

  // Normalize key name
  if (key.length === 1) {
    parts.push(key.toUpperCase())
  } else {
    parts.push(key)
  }
  return parts.join('+')
}
