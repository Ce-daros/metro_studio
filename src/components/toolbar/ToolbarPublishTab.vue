<script setup>
import { computed, inject } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { isTrial } from '../../composables/useLicense'

const store = useProjectStore()
const showUpgradeDialog = inject('showUpgradeDialog', () => {})

const TRIAL_EXPORT_MSG = '导出功能仅限正式版使用，请激活 License Key 以解除限制。'

function guardedExport(fn) {
  if (isTrial.value) { showUpgradeDialog(TRIAL_EXPORT_MSG); return }
  fn()
}

const exportStationVisibilityMode = computed({
  get: () => store.exportStationVisibilityMode || 'all',
  set: (value) => store.setExportStationVisibilityMode(value),
})

const lines = computed(() => store.project?.lines || [])

function getLineName(line, index) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || line?.nameEn || `线路${index + 1}`
}
</script>

<template>
  <section class="toolbar__section">
    <h3>发布导出</h3>
    <p class="toolbar__section-intro">按目标输出格式导出当前工程成果。</p>
    <label class="toolbar__label">车站显示</label>
    <select v-model="exportStationVisibilityMode" class="toolbar__input">
      <option value="interchange">仅显示换乘站</option>
      <option value="none">隐藏所有车站</option>
      <option value="all">显示所有车站</option>
    </select>
    <div class="toolbar__row">
      <button class="toolbar__btn" @click="guardedExport(() => store.exportActualRoutePng())">导出实际走向图 PNG</button>
      <button class="toolbar__btn" @click="guardedExport(() => store.exportOfficialSchematicPng())">导出官方风格图 PNG</button>
    </div>
    <div class="toolbar__row">
      <div class="hud-menu">
        <button class="toolbar__btn">导出车辆 HUD 打包 ▾</button>
        <div class="hud-menu__dropdown">
          <button class="hud-menu__item" @click="guardedExport(() => store.exportAllLineHudZip())">全部</button>
          <button
            v-for="(line, index) in lines"
            :key="line.id"
            class="hud-menu__item"
            @click="guardedExport(() => store.exportAllLineHudZip(line.id))"
          >{{ getLineName(line, index) }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style src="./toolbar-shared.css"></style>

<style scoped>
.hud-menu {
  position: relative;
  flex: 1 1 120px;
}

.hud-menu .toolbar__btn {
  width: 100%;
}

.hud-menu__dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 100%;
  background: var(--toolbar-card-bg);
  border: 1px solid var(--toolbar-card-border);
  border-radius: 8px;
  padding: 4px;
  z-index: 100;
  margin-top: 2px;
}

.hud-menu:hover .hud-menu__dropdown {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hud-menu__item {
  background: none;
  border: none;
  color: var(--toolbar-text);
  font-size: 12px;
  padding: 6px 10px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
}

.hud-menu__item:hover {
  background: var(--toolbar-button-bg);
}
</style>
