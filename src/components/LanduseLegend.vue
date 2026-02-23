<script setup>
import { NModal } from 'naive-ui'
import { ref, computed } from 'vue'
import { COMMON_LANDUSE_TYPES, LANDUSE_COLORS } from './map-editor/mapLayers'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])

const isCollapsed = ref(false)

const legendItems = computed(() => {
  const labels = {
    residential: '居民区',
    commercial: '商业区',
    industrial: '工业区',
    retail: '零售区',
    school: '学校',
    university: '大学',
    cemetery: '墓地',
    military: '军事区',
    railway: '铁路用地',
    garages: '车库',
    bus_station: '公交站',
    stadium: '体育场',
  }

  return COMMON_LANDUSE_TYPES.map((type) => ({
    type,
    label: labels[type] || type,
    color: LANDUSE_COLORS[type] || '#cccccc',
  }))
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function closeLegend() {
  emit('close')
}
</script>

<template>
  <NModal
    :show="visible"
    preset="card"
    title="分区覆盖图例"
    style="width:420px;max-width:calc(100vw - 32px)"
    @close="closeLegend"
    @mask-click="closeLegend"
  >
    <div class="landuse-legend" aria-label="区域类型图例">
      <div class="landuse-legend__head">
        <h3>区域类型</h3>
        <button
          type="button"
          class="landuse-legend__toggle"
          :aria-expanded="!isCollapsed"
          :title="isCollapsed ? '展开图例' : '收起图例'"
          @click="toggleCollapse"
        >
          {{ isCollapsed ? '展开' : '收起' }}
        </button>
      </div>
      <div v-if="!isCollapsed" class="landuse-legend__list">
        <div class="landuse-legend__item" v-for="item in legendItems" :key="item.type">
          <span class="landuse-legend__color" :style="{ background: item.color }"></span>
          <span class="landuse-legend__label">{{ item.label }}</span>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.landuse-legend {
  width: 100%;
  max-height: min(68vh, 560px);
  border: 1px solid rgba(123, 214, 255, 0.34);
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(10, 14, 24, 0.84) 0%, rgba(7, 10, 18, 0.94) 100%);
  box-shadow: inset 0 0 0 1px rgba(58, 198, 255, 0.18);
  color: #eef6ff;
  overflow: hidden;
}

.landuse-legend__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  background: linear-gradient(90deg, rgba(188, 31, 255, 0.3), rgba(249, 0, 191, 0.12));
  border-bottom: 1px solid rgba(188, 31, 255, 0.34);
}

.landuse-legend__head h3 {
  margin: 0;
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: 'Rajdhani', 'Noto Sans SC', sans-serif;
  font-weight: 700;
}

.landuse-legend__toggle {
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(2, 6, 23, 0.46);
  color: #dbeafe;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.landuse-legend__toggle:hover {
  border-color: rgba(125, 211, 252, 0.72);
  background: rgba(15, 23, 42, 0.72);
}

.landuse-legend__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 8px;
  max-height: min(68vh, 500px);
  overflow-y: auto;
  overflow-x: hidden;
}

.landuse-legend__list::-webkit-scrollbar {
  width: 6px;
}

.landuse-legend__list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.46);
  border-radius: 999px;
}

.landuse-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 6px 8px;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.62), rgba(30, 41, 59, 0.24));
}

.landuse-legend__color {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.45);
}

.landuse-legend__label {
  font-size: 12px;
  line-height: 1.25;
  font-family: 'Noto Sans SC', 'PingFang SC', sans-serif;
  color: rgba(241, 245, 249, 0.96);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
