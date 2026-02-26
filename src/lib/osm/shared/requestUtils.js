/**
 * OSM 客户端公共请求工具
 */
import { sleep, createAbortSignalWithTimeout } from '../../async/utils.js'

export { sleep, createAbortSignalWithTimeout }

/**
 * TTL 缓存工厂
 * @param {number} ttlMs 缓存过期时间（毫秒）
 * @returns {{ get: (key: string) => any, set: (key: string, value: any) => void, delete: (key: string) => void }}
 */
export function createTTLCache(ttlMs) {
  const store = new Map()

  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) return undefined
      if (entry.expireAt <= Date.now()) {
        store.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      store.set(key, { value, expireAt: Date.now() + ttlMs })
    },
    delete(key) {
      store.delete(key)
    },
    has(key) {
      const entry = store.get(key)
      if (!entry) return false
      if (entry.expireAt <= Date.now()) {
        store.delete(key)
        return false
      }
      return true
    },
  }
}

/**
 * 简单节流器（用于 Nominatim 等需要最小请求间隔的 API）
 * @param {() => number} getMinIntervalMs 获取最小间隔的函数（支持动态间隔）
 * @returns {{ throttle: (signal?: AbortSignal) => Promise<void> }}
 */
export function createSimpleThrottle(getMinIntervalMs) {
  let lastRequestAt = 0

  return {
    async throttle(signal) {
      const now = Date.now()
      const minInterval = typeof getMinIntervalMs === 'function' ? getMinIntervalMs() : getMinIntervalMs
      const waitMs = lastRequestAt + minInterval - now
      if (waitMs > 0) {
        await sleep(waitMs, signal)
      }
      lastRequestAt = Date.now()
    },
  }
}
