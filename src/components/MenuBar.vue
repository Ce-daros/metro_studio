<script setup>
import { computed, ref, watch } from 'vue'
import { h } from 'vue'
import IconBase from './IconBase.vue'
import { NTooltip, NDropdown } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { getDisplayLineName } from '../lib/lineNaming'
import { useMenuBarActions } from '../composables/useMenuBarActions'

const props = defineProps({
  activeView: { type: String, default: 'map' },
})

const emit = defineEmits(['set-view', 'action', 'show-project-list', 'show-ai-config', 'show-tts-dialog', 'show-shortcut-settings', 'show-statistics', 'show-about', 'show-batch-name-edit', 'show-search', 'show-help', 'show-landuse-legend'])

const store = useProjectStore()
const openMenuKey = ref(null)
const menuBarRef = ref(null)
const lineDropdownOpen = ref(false)
const lineButtonRef = ref(null)
const fileInputRef = ref(null)

const { menus, handleAction, uiTheme, toggleTheme } = useMenuBarActions(store, emit, { fileInputRef })

function getFallbackMenuIcon(item) {
  if (item.type === 'submenu') return 'menu'
  if (item.type === 'toggle') return item.checked ? 'check-circle' : 'box'
  return 'file'
}

function convertMenuItems(items) {
  return items.map((item, i) => {
    if (item.type === 'separator') return { type: 'divider', key: `sep_${i}` }
    const opt = { key: item.action || `submenu_${item.label}`, label: item.label, disabled: item.disabled }
    if (item.type === 'toggle' && item.checked) opt.label = `✓ ${item.label}`
    if (item.shortcut) opt.label = `${item.label}    ${item.shortcut}`
    const iconName = item.icon || getFallbackMenuIcon(item)
    opt.icon = () => h(IconBase, { name: iconName, size: 16 })
    if (item.type === 'submenu' && item.children) opt.children = convertMenuItems(item.children)
    return opt
  })
}

function onNDropdownSelect(key) {
  closeMenu()
  handleAction(key)
}

const lineNDropdownOptions = computed(() =>
  lines.value.map((line) => ({
    key: `line_${line.id}`,
    label: getDisplayLineName(line, 'zh') || line.nameZh || '未命名',
    icon: () => h(IconBase, { name: 'route', size: 16 }),
  }))
)

function onLineNDropdownSelect(key) {
  lineDropdownOpen.value = false
  if (key.startsWith('line_')) store.setActiveLine(key.slice(5))
}

const MIN_YEAR = 1900
const MAX_YEAR = 2100
const editYearInput = ref(store.currentEditYear)

watch(() => store.currentEditYear, (v) => { editYearInput.value = v })

function normalizeEditYear(year) {
  const num = Number.isFinite(+year) ? Math.floor(+year) : 2010
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, num))
}

function onEditYearInput(event) {
  const year = normalizeEditYear(event.target.value)
  store.setCurrentEditYear(year)
  store.setTimelineFilterYear(year)
  editYearInput.value = year
}

function incrementEditYear() {
  const y = normalizeEditYear(store.currentEditYear + 1)
  store.setCurrentEditYear(y)
  store.setTimelineFilterYear(y)
  editYearInput.value = y
}

function decrementEditYear() {
  const y = normalizeEditYear(store.currentEditYear - 1)
  store.setCurrentEditYear(y)
  store.setTimelineFilterYear(y)
  editYearInput.value = y
}

const lines = computed(() => store.project?.lines || [])
const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((l) => l.id === store.activeLineId) || null
})
const activeLineName = computed(() => {
  if (!activeLine.value) return '无线路'
  return getDisplayLineName(activeLine.value, 'zh') || activeLine.value.nameZh || '未命名'
})

const viewButtons = [
  { view: 'map', icon: 'map', label: '地图' },
  { view: 'schematic', icon: 'layout', label: '示意图' },
  { view: 'hud', icon: 'monitor', label: 'HUD' },
  { view: 'preview', icon: 'film', label: '预览' },
]

function toggleMenu(key) {
  if (openMenuKey.value === key) {
    openMenuKey.value = null
    return
  }
  openMenuKey.value = key
}

function onMenuBarMouseEnter(key) {
  if (openMenuKey.value && openMenuKey.value !== key) {
    openMenuKey.value = key
  }
}

function closeMenu() {
  openMenuKey.value = null
}

function onMenuSelect(item) {
  closeMenu()
  handleAction(item.action)
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await store.importProjectFile(file)
  } catch (error) {
    store.statusText = `加载工程失败: ${error.message || '未知错误'}`
  } finally {
    event.target.value = ''
  }
}

function toggleNavigation() {
  if (store.navigation.active) {
    store.exitNavigation()
  } else {
    store.enterNavigation()
  }
}
</script>

<template>
  <header ref="menuBarRef" class="menu-bar ark-terminal-corner">
    <div class="menu-bar__left">
      <div class="menu-bar__brand">
        <span class="menu-bar__brand-mark animate-signal">[</span>
        <span class="menu-bar__brand-text">METRO STUDIO</span>
        <span class="menu-bar__brand-mark animate-signal">]</span>
      </div>
      <span class="menu-bar__brand-sep" />

      <nav class="menu-bar__menus">
        <NDropdown
          v-for="(menu, index) in menus"
          :key="menu.key"
          trigger="click"
          :options="convertMenuItems(menu.items)"
          :show="openMenuKey === menu.key"
          @select="onNDropdownSelect"
          @clickoutside="closeMenu"
        >
          <button
            :data-menu-key="menu.key"
            class="menu-bar__menu-btn ark-glitch-hover animate-stagger"
            :class="{ 'menu-bar__menu-btn--open': openMenuKey === menu.key }"
            :style="{ animationDelay: `${index * 60}ms` }"
            type="button"
            @click="toggleMenu(menu.key)"
            @mouseenter="onMenuBarMouseEnter(menu.key)"
          >
            {{ menu.label }}
            <span class="menu-bar__menu-btn-line"></span>
          </button>
        </NDropdown>
      </nav>
    </div>

    <div class="menu-bar__right">
      <NTooltip placement="bottom" :delay="300">
        <template #trigger>
          <button
            class="menu-bar__nav-btn ark-glitch-hover"
            type="button"
            @click="emit('show-search')"
            aria-label="搜索地点"
          >
            <IconBase name="search" :size="16" />
          </button>
        </template>
        搜索地点 (Ctrl+F)
      </NTooltip>

      <NTooltip placement="bottom" :delay="300">
        <template #trigger>
          <button
            class="menu-bar__nav-btn ark-glitch-hover"
            :class="{ 'menu-bar__nav-btn--active': store.navigation.active }"
            type="button"
            @click="toggleNavigation"
            aria-label="导航"
          >
            <IconBase name="navigation" :size="16" />
          </button>
        </template>
        导航
      </NTooltip>

      <div class="menu-bar__line-switcher">
        <NDropdown
          trigger="click"
          :options="lineNDropdownOptions"
          :show="lineDropdownOpen"
          @select="onLineNDropdownSelect"
          @clickoutside="lineDropdownOpen = false"
        >
          <button
            ref="lineButtonRef"
            class="menu-bar__line-btn ark-glitch-hover"
            type="button"
            @click="lineDropdownOpen = !lineDropdownOpen"
          >
            <span
              class="menu-bar__line-swatch"
              :style="{ backgroundColor: activeLine?.color || '#555' }"
            />
            <span class="menu-bar__line-name">{{ activeLineName }}</span>
            <IconBase name="chevron-down" :size="12" class="menu-bar__line-chevron" :class="{ 'menu-bar__line-chevron--open': lineDropdownOpen }" />
          </button>
        </NDropdown>
      </div>

      <div class="menu-bar__year-selector">
        <span class="menu-bar__year-label">建设年份</span>
        <button
          class="menu-bar__year-btn ark-glitch-hover"
          type="button"
          :disabled="store.currentEditYear <= MIN_YEAR"
          @click="decrementEditYear"
          aria-label="减少年份"
        >−</button>
        <input
          type="number"
          class="menu-bar__year-input"
          :value="editYearInput"
          :min="MIN_YEAR"
          :max="MAX_YEAR"
          step="1"
          @change="onEditYearInput"
        />
        <button
          class="menu-bar__year-btn"
          type="button"
          :disabled="store.currentEditYear >= MAX_YEAR"
          @click="incrementEditYear"
          aria-label="增加年份"
        >+</button>
      </div>

      <div class="menu-bar__view-switcher">
        <NTooltip
          v-for="btn in viewButtons"
          :key="btn.view"
          placement="bottom"
          :delay="300"
        >
          <template #trigger>
            <button
              class="menu-bar__view-btn ark-glitch-hover"
              :class="{ 'menu-bar__view-btn--active': activeView === btn.view }"
              type="button"
              @click="emit('set-view', btn.view)"
            >
              <IconBase :name="btn.icon" :size="16" />
            </button>
          </template>
          {{ btn.label }}
        </NTooltip>
      </div>

    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.railmap.json"
      class="menu-bar__file-input"
      @change="onFileSelected"
    />
    <div class="menu-bar__edge-line"></div>
  </header>
</template>

<style scoped>
.menu-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px;
  background: linear-gradient(180deg, rgba(15, 15, 18, 0.9), rgba(8, 8, 10, 0.88));
  backdrop-filter: blur(14px) saturate(1.24);
  border-bottom: 1px solid rgba(188, 31, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.16), 0 0 14px rgba(249, 0, 191, 0.22);
  flex-shrink: 0;
  z-index: 100;
}

.menu-bar__left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-bar__brand {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px 0 4px;
}

.menu-bar__brand-text {
  font-family: var(--app-font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--ark-purple);
  letter-spacing: 0.1em;
  text-shadow: 0 0 8px rgba(188, 31, 255, 0.45);
}

.menu-bar__brand-mark {
  font-family: var(--app-font-mono);
  font-size: 14px;
  color: var(--ark-pink);
  opacity: 0.4;
}

.menu-bar__brand-sep {
  width: 1px;
  height: 16px;
  background: var(--toolbar-divider);
  margin-right: 4px;
  flex-shrink: 0;
}

.menu-bar__menus {
  display: flex;
  align-items: center;
  gap: 0;
}

.menu-bar__menu-btn {
  position: relative;
  border: 1px solid transparent;
  background: transparent;
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 6px 12px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.menu-bar__menu-btn:hover {
  color: var(--ark-pink);
}

.menu-bar__menu-btn-line {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: var(--ark-pink);
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1), left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 8px var(--ark-pink-glow);
  pointer-events: none;
}

.menu-bar__menu-btn:hover .menu-bar__menu-btn-line {
  width: 100%;
  left: 0;
}

.menu-bar__menu-btn--open {
  color: var(--ark-text);
  background: var(--toolbar-tab-active-bg);
  border-color: rgba(249, 0, 191, 0.54);
}

.menu-bar__menu-btn--open .menu-bar__menu-btn-line {
  width: 100%;
  left: 0;
  background: var(--ark-pink);
  height: 2px;
}

.menu-bar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-bar__line-switcher {
  position: relative;
}

.menu-bar__line-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--toolbar-input-border);
  background: linear-gradient(90deg, rgba(188, 31, 255, 0.08), rgba(5, 5, 7, 0.92));
  color: var(--toolbar-text);
  padding: 4px 8px;
  font-size: 14px;
  cursor: pointer;
  transition: border-color var(--transition-fast);
  max-width: 180px;
  clip-path: var(--clip-chamfer-sm);
}

.menu-bar__line-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.menu-bar__line-swatch {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(249, 0, 191, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.menu-bar__line-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-bar__line-chevron {
  transition: transform var(--transition-normal, 0.15s ease);
  flex-shrink: 0;
}

.menu-bar__line-chevron--open {
  transform: rotate(180deg);
}

.menu-bar__view-switcher {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--toolbar-input-border);
  overflow: hidden;
  background: linear-gradient(90deg, rgba(6, 6, 8, 0.84), rgba(188, 31, 255, 0.1));
  clip-path: var(--clip-chamfer-sm);
}

.menu-bar__view-btn {
  position: relative;
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  padding: 5px 10px;
  cursor: pointer;
  transition: color var(--transition-fast, 0.1s ease), background var(--transition-fast, 0.1s ease);
  display: flex;
  align-items: center;
}

.menu-bar__view-btn:hover {
  color: var(--toolbar-text);
  background: rgba(188, 31, 255, 0.16);
}

.menu-bar__view-btn--active {
  background: var(--toolbar-tab-active-bg);
  color: var(--toolbar-tab-active-text);
  box-shadow: inset 0 -2px 0 var(--ark-pink);
}

.menu-bar__year-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--toolbar-input-border);
  background: rgba(8, 8, 11, 0.9);
  padding: 2px 4px;
  clip-path: var(--clip-chamfer-sm);
}

.menu-bar__year-label {
  font-size: 13px;
  color: var(--toolbar-muted);
  padding: 0 4px 0 2px;
  white-space: nowrap;
}

.menu-bar__year-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 14px;
  font-weight: 600;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.menu-bar__year-btn:hover:not(:disabled) {
  color: var(--toolbar-text);
  border-color: rgba(249, 0, 191, 0.5);
  background: rgba(188, 31, 255, 0.16);
}

.menu-bar__year-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.menu-bar__year-input {
  width: 52px;
  border: none;
  background: transparent;
  color: var(--toolbar-text);
  font-family: var(--app-font-mono);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}

.menu-bar__year-input:focus {
  outline: none;
}

.menu-bar__year-input::-webkit-inner-spin-button,
.menu-bar__year-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.menu-bar__file-input {
  display: none;
}

.menu-bar__nav-btn {
  border: 1px solid var(--toolbar-input-border);
  background: linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(6, 6, 8, 0.9));
  color: var(--toolbar-muted);
  padding: 6px 10px;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
  display: flex;
  align-items: center;
  clip-path: var(--clip-chamfer-sm);
}

.menu-bar__nav-btn:hover {
  color: var(--ark-pink);
  border-color: var(--ark-pink);
}

.menu-bar__nav-btn--active {
  color: #fff;
  background: linear-gradient(90deg, var(--ark-purple), var(--ark-pink));
  border-color: rgba(255, 255, 255, 0.46);
  box-shadow: 0 0 10px rgba(249, 0, 191, 0.36);
}

.menu-bar__nav-btn--active:hover {
  opacity: 0.9;
}

.menu-bar__edge-line {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, 
    transparent, 
    var(--ark-purple), 
    var(--ark-pink), 
    var(--ark-purple), 
    transparent
  );
  background-size: 200% 100%;
  animation: line-flow 10s linear infinite;
  opacity: 0.84;
}

.menu-bar__machine-tag {
  position: absolute;
  right: 10px;
  bottom: 2px;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(168, 210, 255, 0.48);
  pointer-events: none;
}
</style>
