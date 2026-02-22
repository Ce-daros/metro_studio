import { nextTick, watch } from 'vue'

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function extractBboxFromGeoJson(geoJson) {
  try {
    if (!geoJson || !geoJson.type || !geoJson.coordinates) return null

    const coords = []
    const geometry = geoJson

    function flattenPolygon(rings) {
      if (!Array.isArray(rings)) return
      for (const ring of rings) {
        if (!Array.isArray(ring)) continue
        for (const coord of ring) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              coords.push([lng, lat])
            }
          }
        }
      }
    }

    if (geometry.type === 'Polygon') {
      flattenPolygon(geometry.coordinates)
    } else if (geometry.type === 'MultiPolygon') {
      if (!Array.isArray(geometry.coordinates)) return null
      for (const polygon of geometry.coordinates) {
        flattenPolygon(polygon)
      }
    } else {
      return null
    }

    if (!coords.length) return null

    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity

    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat) ||
        !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
      return null
    }

    return { minLng, minLat, maxLng, maxLat }
  } catch {
    return null
  }
}

/**
 * Boundary hash computation, fitMapToBoundary, and boundary watcher.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 */
export function useMapBoundary({ store, getMap }) {
  let lastRegionBoundaryHash = null
  let isMapReadyForBoundary = false

  function computeBoundaryHash(boundary) {
    try {
      if (!boundary || !boundary.type) return null

      const bbox = extractBboxFromGeoJson(boundary)
      if (!bbox) return null

      return `${boundary.type}_${bbox.minLng.toFixed(6)}_${bbox.minLat.toFixed(6)}_${bbox.maxLng.toFixed(6)}_${bbox.maxLat.toFixed(6)}`
    } catch {
      return null
    }
  }

  function fitMapToBoundary(boundary) {
    try {
      const map = getMap()
      if (!map || !boundary) return

      const bbox = extractBboxFromGeoJson(boundary)
      if (!bbox) return

      const lngSpan = Math.abs(bbox.maxLng - bbox.minLng)
      const latSpan = Math.abs(bbox.maxLat - bbox.minLat)

      if (lngSpan < 1e-6 && latSpan < 1e-6) {
        map.easeTo({
          center: [bbox.minLng, bbox.minLat],
          zoom: Math.max(map.getZoom(), 12),
          bearing: 0,
          pitch: 0,
          duration: 1000,
          easing: easeInOutCubic,
        })
      } else {
        map.fitBounds(
          [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat],
          ],
          {
            padding: { top: 40, bottom: 40, left: 40, right: 40 },
            maxZoom: 14,
            bearing: 0,
            pitch: 0,
            duration: 1200,
            easing: easeInOutCubic,
          },
        )
      }
    } catch {
      // fitBounds may throw if map is in an invalid state
    }
  }

  function setMapReady() {
    isMapReadyForBoundary = true
  }

  function setMapNotReady() {
    isMapReadyForBoundary = false
  }

  function onMapLoad() {
    setMapReady()
    if (store.regionBoundary) {
      fitMapToBoundary(store.regionBoundary)
    }
  }

  function setupBoundaryWatcher() {
    return watch(
      () => store.regionBoundary,
      async (newBoundary) => {
        if (!isMapReadyForBoundary || !newBoundary) return

        const boundaryHash = computeBoundaryHash(newBoundary)

        if (boundaryHash && boundaryHash !== lastRegionBoundaryHash) {
          lastRegionBoundaryHash = boundaryHash

          await nextTick()
          const map = getMap()

          if (!map.isStyleLoaded()) {
            await new Promise((resolve) => {
              const checkInterval = setInterval(() => {
                if (map.isStyleLoaded()) {
                  clearInterval(checkInterval)
                  resolve()
                }
              }, 50)

              setTimeout(() => {
                clearInterval(checkInterval)
                resolve()
              }, 5000)
            })
          }

          fitMapToBoundary(newBoundary)
        }
      },
      { deep: false },
    )
  }

  return {
    fitMapToBoundary,
    setMapReady,
    setMapNotReady,
    onMapLoad,
    setupBoundaryWatcher,
  }
}
