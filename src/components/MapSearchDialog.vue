<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { NModal } from 'naive-ui'
import IconBase from './IconBase.vue'
import { searchLocation } from '../lib/osm/nominatimSearch'
import { pinyin } from 'pinyin-pro'

const props = defineProps({
  visible: { type: Boolean, default: false },
  viewbox: { type: Array, default: null },
  targetProvince: { type: String, default: null },
  stations: { type: Array, default: () => [] },
  lines: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'select'])

const searchInputRef = ref(null)
const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const searchError = ref(null)
const selectedIndex = ref(-1)
const activeTab = ref('location')

// Precompute pinyin cache when stations change
const stationPinyinCache = computed(() => {
  const map = new Map()
  for (const s of props.stations) {
    const zh = s.nameZh || ''
    if (zh) {
      map.set(s.id, {
        full: pinyin(zh, { toneType: 'none', type: 'array' }).join(''),
        initials: pinyin(zh, { pattern: 'first', toneType: 'none', type: 'array' }).join(''),
      })
    }
  }
  return map
})

const lineMap = computed(() => new Map((props.lines || []).map(l => [l.id, l])))

const stationResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return props.stations.filter(s => {
    const zh = (s.nameZh || '').toLowerCase()
    const en = (s.nameEn || '').toLowerCase()
    if (zh.includes(q) || en.includes(q)) return true
    const py = stationPinyinCache.value.get(s.id)
    return py && (py.full.includes(q) || py.initials.includes(q))
  }).slice(0, 20)
})

function getStationLines(station) {
  if (!station.lineIds) return []
  return station.lineIds.map(id => lineMap.value.get(id)).filter(Boolean)
}

const currentResults = computed(() =>
  activeTab.value === 'station' ? stationResults.value : searchResults.value
)

watch(() => props.visible, async (visible) => {
  if (visible) {
    searchQuery.value = ''
    searchResults.value = []
    searchError.value = null
    selectedIndex.value = -1
    await nextTick()
    searchInputRef.value?.focus()
  }
})

async function performSearch() {
  const query = searchQuery.value.trim()
  if (!query) {
    searchResults.value = []
    searchError.value = null
    return
  }

  isSearching.value = true
  searchError.value = null
  searchResults.value = []
  selectedIndex.value = -1

  try {
    const results = await searchLocation(query, { limit: 10, viewbox: props.viewbox, provinceFilter: props.targetProvince })
    searchResults.value = results.map((item, index) => ({
      id: item.place_id || item.osm_type + item.osm_id || index,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name || '',
      address: item.address || {},
      name: item.namedetails?.name || item.name || '',
      type: item.type || '',
      class: item.class || '',
      importance: item.importance || 0,
    }))
    if (searchResults.value.length === 0) {
      searchError.value = '未找到匹配的地点'
    }
  } catch (error) {
    searchError.value = error.message || '搜索失败'
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

let searchDebounceTimer = null

function onSearchInput() {
  if (activeTab.value === 'station') {
    selectedIndex.value = -1
    return
  }
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    performSearch()
  }, 300)
}

function handleKeyDown(event) {
  const results = currentResults.value
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (!results.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % results.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = selectedIndex.value <= 0 ? results.length - 1 : selectedIndex.value - 1
  } else if (event.key === 'Enter' && selectedIndex.value >= 0) {
    event.preventDefault()
    if (activeTab.value === 'station') onSelectStation(results[selectedIndex.value])
    else onSelectResult(results[selectedIndex.value])
  }
}

function onSelectResult(result) {
  emit('select', {
    type: 'location',
    lngLat: [result.lon, result.lat],
    name: result.name || result.displayName.split(',')[0],
  })
  emit('close')
}

function onSelectStation(station) {
  emit('select', {
    type: 'station',
    stationId: station.id,
    lngLat: station.lngLat,
    name: station.nameZh || station.nameEn,
  })
  emit('close')
}

function switchTab(tab) {
  activeTab.value = tab
  selectedIndex.value = -1
  searchResults.value = []
  searchError.value = null
}

function formatResultType(result) {
  const typeMap = {
    'relation': '区域',
    'way': '道路',
    'node': '地点',
  }
  if (result.type === 'station') return '站点'
  if (result.class === 'highway') return '道路'
  if (result.class === 'railway') return '铁路'
  if (result.class === 'amenity') return '设施'
  if (result.class === 'building') return '建筑'
  if (result.class === 'shop') return '商店'
  if (result.class === 'leisure') return '休闲'
  if (result.class === 'tourism') return '景点'
  return typeMap[result.type] || '地点'
}
</script>

<template>
  <NModal :show="visible" preset="card" title="搜索" style="width:480px;max-width:calc(100vw - 32px)" @close="emit('close')" @mask-click="emit('close')">
    <div class="map-search-dialog__tabs">
      <button :class="['map-search-dialog__tab', { 'map-search-dialog__tab--active': activeTab === 'location' }]" @click="switchTab('location')">搜索地标</button>
      <button :class="['map-search-dialog__tab', { 'map-search-dialog__tab--active': activeTab === 'station' }]" @click="switchTab('station')">搜索站点</button>
    </div>

    <div class="map-search-dialog__search">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        class="map-search-dialog__input"
        :placeholder="activeTab === 'station' ? '输入站名、拼音...' : '输入地名、街道、地标...'"
        @input="onSearchInput"
        @keydown="handleKeyDown"
      />
      <div v-if="activeTab === 'location'" class="map-search-dialog__status">
        <span v-if="isSearching" class="map-search-dialog__loading">搜索中...</span>
        <span v-else-if="searchError" class="map-search-dialog__error">{{ searchError }}</span>
        <span v-else-if="searchQuery && !isSearching && searchResults.length === 0" class="map-search-dialog__hint">
          请输入更详细的搜索词
        </span>
        <span v-else-if="!searchQuery" class="map-search-dialog__hint">
          支持搜索地名、街道、建筑、景点等
        </span>
      </div>
    </div>

    <div class="map-search-dialog__results">
      <!-- Location results -->
      <template v-if="activeTab === 'location'">
        <div
          v-for="(result, index) in searchResults"
          :key="result.id"
          class="map-search-dialog__result"
          :class="{ 'map-search-dialog__result--selected': index === selectedIndex }"
          @click="onSelectResult(result)"
          @mouseenter="selectedIndex = index"
        >
          <div class="map-search-dialog__result-icon">
            <IconBase name="map-pin" :size="16" />
          </div>
          <div class="map-search-dialog__result-content">
            <div class="map-search-dialog__result-name">
              {{ result.name || result.displayName.split(',')[0] }}
            </div>
            <div class="map-search-dialog__result-address">
              {{ result.displayName }}
            </div>
            <div class="map-search-dialog__result-meta">
              <span class="map-search-dialog__result-type">{{ formatResultType(result) }}</span>
            </div>
          </div>
        </div>
        <div v-if="searchResults.length === 0 && !isSearching && !searchError && searchQuery" class="map-search-dialog__empty">
          未找到匹配的地点
        </div>
      </template>

      <!-- Station results -->
      <template v-else>
        <div
          v-for="(station, index) in stationResults"
          :key="station.id"
          class="map-search-dialog__result"
          :class="{ 'map-search-dialog__result--selected': index === selectedIndex }"
          @click="onSelectStation(station)"
          @mouseenter="selectedIndex = index"
        >
          <div class="map-search-dialog__result-icon">
            <IconBase name="circle" :size="16" />
          </div>
          <div class="map-search-dialog__result-content">
            <div class="map-search-dialog__result-name">{{ station.nameZh || station.nameEn }}</div>
            <div v-if="station.nameEn" class="map-search-dialog__result-address">{{ station.nameEn }}</div>
            <div class="map-search-dialog__result-meta">
              <span
                v-for="line in getStationLines(station)"
                :key="line.id"
                class="map-search-dialog__line-tag"
                :style="{ background: line.color || '#888' }"
              >{{ line.nameZh || line.nameEn || line.id }}</span>
            </div>
          </div>
        </div>
        <div v-if="stationResults.length === 0 && searchQuery" class="map-search-dialog__empty">
          未找到匹配的站点
        </div>
        <div v-if="!searchQuery" class="map-search-dialog__empty" style="padding:16px">
          输入站名或拼音搜索项目内站点
        </div>
      </template>
    </div>

    <div v-if="activeTab === 'location'" class="map-search-dialog__footer">
      <span class="map-search-dialog__powered">Powered by OpenStreetMap & Nominatim</span>
    </div>
  </NModal>
</template>

<style scoped>
.map-search-dialog__tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--toolbar-divider);
  padding: 0 16px;
}

.map-search-dialog__tab {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  background: none;
  color: var(--toolbar-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.map-search-dialog__tab:hover {
  color: var(--toolbar-text);
}

.map-search-dialog__tab--active {
  color: var(--toolbar-text);
  border-bottom-color: var(--ark-pink, #f900bf);
}

.map-search-dialog__search {
  padding: 16px;
  flex-shrink: 0;
}

.map-search-dialog__input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast);
}

.map-search-dialog__input:focus {
  border-color: var(--toolbar-primary-border);
}

.map-search-dialog__status {
  margin-top: 8px;
  min-height: 20px;
  font-size: 12px;
}

.map-search-dialog__loading {
  color: var(--toolbar-muted);
}

.map-search-dialog__error {
  color: var(--toolbar-danger-border);
}

.map-search-dialog__hint {
  color: var(--toolbar-hint);
}

.map-search-dialog__results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.map-search-dialog__result {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.map-search-dialog__result:hover,
.map-search-dialog__result--selected {
  background: var(--toolbar-hover-bg);
}

.map-search-dialog__result-icon {
  flex-shrink: 0;
  padding-top: 2px;
  color: var(--toolbar-muted);
}

.map-search-dialog__result-content {
  flex: 1;
  min-width: 0;
}

.map-search-dialog__result-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-search-dialog__result-address {
  font-size: 12px;
  color: var(--toolbar-muted);
  margin-bottom: 4px;
  line-height: 1.4;
}

.map-search-dialog__result-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.map-search-dialog__result-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--toolbar-badge-bg);
  color: var(--toolbar-badge-text);
}

.map-search-dialog__line-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
}

.map-search-dialog__empty {
  text-align: center;
  padding: 32px 16px;
  color: var(--toolbar-muted);
  font-size: 14px;
}

.map-search-dialog__footer {
  padding: 10px 16px;
  border-top: 1px solid var(--toolbar-divider);
  flex-shrink: 0;
}

.map-search-dialog__powered {
  font-size: 11px;
  color: var(--toolbar-hint);
  text-align: center;
  display: block;
}

</style>
