<script setup>
import { computed } from 'vue'
import IconBase from '../IconBase.vue'
import { NTooltip } from 'naive-ui'
import { useProjectStore } from '../../stores/projectStore'
import { useToolbarStationOps } from '../../composables/useToolbarStationOps.js'
import { useToolbarEdgeOps } from '../../composables/useToolbarEdgeOps.js'

const store = useProjectStore()

const {
  selectedStationCount,
  selectAllStations,
  retranslateSelectedStationEnglishNames,
} = useToolbarStationOps()

const { selectedEdgeCount } = useToolbarEdgeOps()

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

const paramReductionEnabled = computed(() => Boolean(store.project?.layoutConfig?.paramReduction?.enabled))

function undoEdit() {
  store.undo()
}

function redoEdit() {
  store.redo()
}

</script>

<template>
  <section class="toolbar__section">
    <h3>工具</h3>
    <p class="toolbar__section-intro">选择编辑模式，执行选择与排版控制</p>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'select' }" @click="store.setMode('select')">
            <IconBase name="cursor" :size="14" />
            <span>选择</span>
          </button>
        </template>
        选择/拖拽工具 (V)
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'add-station' }" @click="store.setMode('add-station')">
            <IconBase name="plus-circle" :size="14" />
            <span>添加站点</span>
          </button>
        </template>
        点击添加站点 (S)
      </NTooltip>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'route-draw' }" @click="store.setMode('route-draw')">
            <IconBase name="route" :size="14" />
            <span>连续画线</span>
          </button>
        </template>
        连续画线模式 (R)
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'route-draw-naming' }" @click="store.setMode('route-draw-naming')">
            <IconBase name="route" :size="14" />
            <span>命名布线</span>
          </button>
        </template>
        命名布线模式 (T)
      </NTooltip>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'style-brush' || store.styleBrush.active }" @click="store.setMode('style-brush')">
            <IconBase name="paintbrush" :size="14" />
            <span>样式刷</span>
          </button>
        </template>
        样式刷模式 (M)
      </NTooltip>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'box-select' }" @click="store.setMode('box-select')">
            <IconBase name="box-select" :size="14" />
            <span>框选</span>
          </button>
        </template>
        框选工具 (B) - Shift=加选, Ctrl=减选
      </NTooltip>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'anchor-edit' }" @click="store.setMode('anchor-edit')">
            <IconBase name="edit-3" :size="14" />
            <span>弯曲控制点</span>
          </button>
        </template>
        控制点编辑 (P)
      </NTooltip>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :class="{ active: store.mode === 'annotation' }" @click="store.setMode('annotation')">
            <IconBase name="message-square" :size="14" />
            <span>注释</span>
          </button>
        </template>
        注释工具 (N)
      </NTooltip>
    </div>
    <div v-if="store.styleBrush.active" class="toolbar__row">
      <span class="toolbar__hint">已拾取样式源：{{ store.getObjectTypeLabel(store.styleBrush.sourceType) }}</span>
      <button class="toolbar__btn" @click="store.deactivateStyleBrush()">退出样式刷</button>
    </div>
    <div class="toolbar__row">
      <span class="toolbar__meta">已选站点: {{ selectedStationCount }}</span>
      <span class="toolbar__meta">已选线段: {{ selectedEdgeCount }}</span>
    </div>
    <div class="toolbar__row">
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :disabled="!store.canUndo" @click="undoEdit">
            <IconBase name="undo" :size="14" />
          </button>
        </template>
        撤销上一步操作 (Ctrl+Z)
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <button class="toolbar__btn" :disabled="!store.canRedo" @click="redoEdit">
            <IconBase name="redo" :size="14" />
          </button>
        </template>
        重做上一步操作 (Ctrl+Shift+Z)
      </NTooltip>
      <button class="toolbar__btn" @click="selectAllStations">全选站点</button>
      <button class="toolbar__btn" @click="store.clearSelection()">清空选择</button>
    </div>
    <button
      class="toolbar__btn"
      :disabled="selectedStationCount < 1 || store.isStationEnglishRetranslating"
      @click="retranslateSelectedStationEnglishNames"
    >
      {{ store.isStationEnglishRetranslating ? '翻译中...' : 'AI 翻译选中站英文' }}
    </button>
    <label class="toolbar__label">地理种子缩放（geoSeedScale）</label>
    <div class="toolbar__range-row">
      <input
        v-model.number="layoutGeoSeedScale"
        class="toolbar__range"
        type="range"
        min="0.1"
        max="16"
        step="0.1"
        :disabled="!store.project || store.isLayoutRunning || paramReductionEnabled"
      />
      <span class="toolbar__range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
    </div>
    <p class="toolbar__hint">
      <template v-if="paramReductionEnabled">已启用降维参数：geoSeedScale 由 projection.json 控制。</template>
      <template v-else>值越大，初始地理骨架展开越明显。</template>
    </p>
    <button
      class="toolbar__btn toolbar__btn--primary"
      :disabled="store.isLayoutRunning || !store.project?.stations?.length"
      @click="store.runAutoLayout()"
    >
      {{ store.isLayoutRunning ? '排版中...' : '自动生成官方风' }}
    </button>
  </section>
</template>

<style src="./toolbar-shared.css"></style>
