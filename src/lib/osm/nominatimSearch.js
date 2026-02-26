import { sleep } from '../async/utils.js'
import { createTTLCache, createSimpleThrottle } from './shared/requestUtils.js'

const LOCATIONIQ_ENDPOINT = 'https://us1.locationiq.com/v1/search'
const NOMINATIM_FALLBACK_ENDPOINT = 'https://nominatim.openstreetmap.org/search'

const LOCATIONIQ_MIN_INTERVAL_MS = 500
const NOMINATIM_MIN_INTERVAL_MS = 1100
const NOMINATIM_REQUEST_TIMEOUT_MS = 15000
const NOMINATIM_MAX_RETRIES = 3
const NOMINATIM_CACHE_TTL_MS = 300000

const cache = createTTLCache(NOMINATIM_CACHE_TTL_MS)

let _locationIqKey = ''
try { _locationIqKey = window.localStorage.getItem('locationIqApiKey') || '' } catch { /* noop */ }

export function getLocationIqApiKey() { return _locationIqKey }
export function setLocationIqApiKey(key) {
  _locationIqKey = key || ''
  try { window.localStorage.setItem('locationIqApiKey', _locationIqKey) } catch { /* noop */ }
}

function getMinInterval() {
  return _locationIqKey ? LOCATIONIQ_MIN_INTERVAL_MS : NOMINATIM_MIN_INTERVAL_MS
}

const throttler = createSimpleThrottle(getMinInterval)

function buildCacheKey(query, limit, viewbox) {
  const keyBase = `${String(query || '').trim().toLowerCase()}_${limit}`
  return viewbox ? `${keyBase}_${viewbox}` : keyBase
}

export async function searchLocation(query, options = {}) {
  const limit = options.limit ?? 10
  const signal = options.signal
  const viewbox = options.viewbox
  const provinceFilter = options.provinceFilter
  const trimmedQuery = String(query || '').trim()

  if (!trimmedQuery) return []

  const key = buildCacheKey(trimmedQuery, limit, viewbox)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  for (let attempt = 0; attempt <= NOMINATIM_MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) throw new Error('Nominatim 搜索请求已取消')
    await throttler.throttle(signal)

    const useLocationIq = !!_locationIqKey
    const endpoint = useLocationIq ? LOCATIONIQ_ENDPOINT : NOMINATIM_FALLBACK_ENDPOINT
    const keyParam = useLocationIq ? `&key=${_locationIqKey}` : ''
    const format = 'json'

    let url = `${endpoint}?q=${encodeURIComponent(trimmedQuery)}&format=${format}&limit=${limit}&addressdetails=1&namedetails=1&accept-language=zh,en${keyParam}`

    if (viewbox && Array.isArray(viewbox) && viewbox.length === 4) {
      const [west, south, east, north] = viewbox
      url += `&viewbox=${west.toFixed(4)},${south.toFixed(4)},${east.toFixed(4)},${north.toFixed(4)}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), NOMINATIM_REQUEST_TIMEOUT_MS)
    if (signal) {
      const onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RailMap/1.0 (location-search)',
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
        throw new Error(`Nominatim 搜索请求失败: ${response.status}`)
      }

      const data = await response.json()
      let results = Array.isArray(data) ? data : []

      if (provinceFilter && results.length > 0) {
        results = results.filter(item => {
          if (!item.address) return false
          const state = item.address.state || item.address.province
          if (!state) return false
          return state.includes(provinceFilter) || provinceFilter.includes(state)
        })
      }

      cache.set(key, results)
      return results
    } catch (error) {
      clearTimeout(timeout)
      if (signal?.aborted) throw new Error('Nominatim 搜索请求已取消')
      if (attempt >= NOMINATIM_MAX_RETRIES) throw error
    }
  }

  throw new Error('Nominatim 搜索请求失败: 重试次数已用尽')
}
