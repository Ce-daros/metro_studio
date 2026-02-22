import { ref } from 'vue'
import maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../lib/osm/nominatimClient'
import { getProvinceFromCache, setProvinceToCache } from '../lib/osm/provinceCache'

let getMapFn = null
let getStoreFn = null
let currentMarkerRemover = null
let mapClickHandler = null

export function setMapGetter(fn) {
  getMapFn = fn
}

export function setStoreGetter(fn) {
  getStoreFn = fn
}

function removeCurrentMarker() {
  if (currentMarkerRemover) {
    currentMarkerRemover()
    currentMarkerRemover = null
  }
}

function setupMapClickListener(map) {
  if (mapClickHandler) {
    map.off('click', mapClickHandler)
  }

  mapClickHandler = () => {
    removeCurrentMarker()
    map.off('click', mapClickHandler)
    mapClickHandler = null
  }

  map.on('click', mapClickHandler)
}

export function useMapSearch() {
  const searchVisible = ref(false)
  const mapViewbox = ref(null)
  const targetProvince = ref(null)

  async function getFirstStationProvince() {
    if (!getStoreFn) return null

    const store = getStoreFn()
    if (!store || !store.project || !store.project.stations || store.project.stations.length === 0) {
      return null
    }

    const edges = store.project.edges || []
    if (edges.length === 0) return null

    const stationOrder = store.getStationOrderFromEdges(edges)
    if (!stationOrder || stationOrder.length === 0) return null

    const firstStationId = stationOrder[0]
    const firstStation = store.project.stations.find(s => s.id === firstStationId)
    if (!firstStation || !firstStation.lngLat) return null

    const [lng, lat] = firstStation.lngLat

    let province = getProvinceFromCache(lng, lat)
    if (province) return province

    try {
      const result = await reverseGeocode(lat, lng)
      province = result?.address?.state || result?.address?.province
      if (province) {
        setProvinceToCache(lng, lat, province)
      }
    } catch (error) {
      console.error('Failed to get province:', error)
    }

    return province
  }

  function openSearchDialog() {
    updateMapViewbox()
    searchVisible.value = true
  }

  async function openSearchDialogWithProvince() {
    updateMapViewbox()
    targetProvince.value = await getFirstStationProvince()
    searchVisible.value = true
  }

  function closeSearchDialog() {
    searchVisible.value = false
    mapViewbox.value = null
    targetProvince.value = null
  }

  function updateMapViewbox() {
    if (!getMapFn) return

    const map = getMapFn()
    if (!map) return

    const bounds = map.getBounds()
    if (!bounds) return

    mapViewbox.value = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]
  }

  function onSearchResultSelect(result) {
    if (!result || !result.lngLat || !getMapFn) return

    const map = getMapFn()
    if (!map) return

    const [lng, lat] = result.lngLat

    if (currentMarkerRemover) {
      currentMarkerRemover()
      currentMarkerRemover = null
    }

    if (result.type === 'station') {
      map.easeTo({ center: [lng, lat], zoom: 15, duration: 1000 })
      if (getStoreFn) {
        const store = getStoreFn()
        if (store && result.stationId) {
          store.setSelectedStations([result.stationId])
        }
      }
      return result.name ? `已跳转到站点: ${result.name}` : '已跳转到站点'
    }

    map.easeTo({ center: [lng, lat], zoom: 15, duration: 1000 })
    currentMarkerRemover = createMarker(map, lng, lat)
    setupMapClickListener(map)

    return result.name ? `已跳转到: ${result.name}` : '已跳转到搜索位置'
  }

  function createMarker(map, lng, lat) {
    const markerEl = document.createElement('div')
    markerEl.className = 'search-marker'
    markerEl.innerHTML = `
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="#ffffff" stroke-width="5.2">
          <line x1="48" y1="12" x2="48" y2="36" />
          <line x1="48" y1="60" x2="48" y2="84" />
          <line x1="12" y1="48" x2="36" y2="48" />
          <line x1="60" y1="48" x2="84" y2="48" />
        </g>
        <g stroke="#ef4444" stroke-width="3.25">
          <line x1="48" y1="12" x2="48" y2="36" />
          <line x1="48" y1="60" x2="48" y2="84" />
          <line x1="12" y1="48" x2="36" y2="48" />
          <line x1="60" y1="48" x2="84" y2="48" />
        </g>
        <circle cx="48" cy="48" r="9" fill="#ffffff" stroke="#ef4444" stroke-width="3.25"/>
        <circle cx="48" cy="48" r="3.25" fill="#ef4444"/>
      </svg>
    `
    markerEl.style.cursor = 'pointer'
    markerEl.style.filter = 'drop-shadow(0 3px 8px rgba(239, 68, 68, 0.3))'

    const marker = new maplibregl.Marker({
      element: markerEl,
      anchor: 'center',
    }).setLngLat([lng, lat]).addTo(map)

    const removeMarker = () => {
      marker.remove()
    }

    return removeMarker
  }

  return {
    searchVisible,
    mapViewbox,
    targetProvince,
    openSearchDialog,
    openSearchDialogWithProvince,
    closeSearchDialog,
    onSearchResultSelect,
  }
}
