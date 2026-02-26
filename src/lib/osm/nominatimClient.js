import { sleep } from '../async/utils.js'
import { createTTLCache, createSimpleThrottle } from './shared/requestUtils.js'

const LOCATIONIQ_ENDPOINT = 'https://us1.locationiq.com/v1/reverse'
const NOMINATIM_FALLBACK_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

const LOCATIONIQ_MIN_INTERVAL_MS = 500
const NOMINATIM_MIN_INTERVAL_MS = 1100
const NOMINATIM_REQUEST_TIMEOUT_MS = 15000
const NOMINATIM_MAX_RETRIES = 3
const NOMINATIM_CACHE_TTL_MS = 300000

const cache = createTTLCache(NOMINATIM_CACHE_TTL_MS)

let _locationIqKey = ''
try { _locationIqKey = window.localStorage.getItem('locationIqApiKey') || '' } catch { /* noop */ }

/** @returns {string} */
export function getLocationIqApiKey() { return _locationIqKey }
/** @param {string} key @returns {void} */
export function setLocationIqApiKey(key) {
  _locationIqKey = key || ''
  try { window.localStorage.setItem('locationIqApiKey', _locationIqKey) } catch { /* noop */ }
}

function getMinInterval() {
  return _locationIqKey ? LOCATIONIQ_MIN_INTERVAL_MS : NOMINATIM_MIN_INTERVAL_MS
}

const throttler = createSimpleThrottle(getMinInterval)

function buildCacheKey(lat, lon, zoom) {
  return `${lat.toFixed(6)},${lon.toFixed(6)},${zoom}`
}

/** @param {number} lat @param {number} lon @param {{zoom?: number, signal?: AbortSignal}} [options={}] @returns {Promise<object>} */
export async function reverseGeocode(lat, lon, options = {}) {
  const zoom = options.zoom ?? 18
  const signal = options.signal
  const key = buildCacheKey(lat, lon, zoom)

  const cached = cache.get(key)
  if (cached !== undefined) return cached

  for (let attempt = 0; attempt <= NOMINATIM_MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) throw new Error('Nominatim 请求已取消')
    await throttler.throttle(signal)

    const useLocationIq = !!_locationIqKey
    const endpoint = useLocationIq ? LOCATIONIQ_ENDPOINT : NOMINATIM_FALLBACK_ENDPOINT
    const keyParam = useLocationIq ? `&key=${_locationIqKey}` : ''
    const format = useLocationIq ? 'json' : 'jsonv2'
    const url = `${endpoint}?lat=${lat}&lon=${lon}&format=${format}&zoom=${zoom}&addressdetails=1&extratags=1&namedetails=1&accept-language=zh,en${keyParam}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), NOMINATIM_REQUEST_TIMEOUT_MS)
    if (signal) {
      const onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RailMap/1.0 (station-naming-context)',
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.status === 429) {
        await sleep(3000, signal)
        continue
      }
      if (!response.ok) {
        if (response.status >= 500) continue
        throw new Error(`Nominatim 请求失败: ${response.status}`)
      }

      const data = await response.json()
      if (data?.error) {
        // Nominatim returns error for coordinates with no data (e.g. ocean)
        const emptyResult = { address: {}, namedetails: {}, extratags: {}, display_name: '' }
        cache.set(key, emptyResult)
        return emptyResult
      }

      cache.set(key, data)
      return data
    } catch (error) {
      clearTimeout(timeout)
      if (signal?.aborted) throw new Error('Nominatim 请求已取消')
      if (attempt >= NOMINATIM_MAX_RETRIES) throw error
    }
  }

  throw new Error('Nominatim 请求失败: 重试次数已用尽')
}
