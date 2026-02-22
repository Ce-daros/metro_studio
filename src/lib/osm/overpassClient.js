const DEV_PROXY_ENDPOINTS = ['/api/overpass']
const PUBLIC_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const OVERPASS_ENDPOINTS = import.meta.env.DEV
  ? [...DEV_PROXY_ENDPOINTS, ...PUBLIC_ENDPOINTS]
  : [...PUBLIC_ENDPOINTS]

const OVERPASS_REQUEST_TIMEOUT_MS = 65000
const OVERPASS_MAX_CONCURRENCY = normalizePositiveInteger(import.meta.env.VITE_OVERPASS_MAX_CONCURRENCY, 6)
const OVERPASS_MIN_INTERVAL_MS = normalizeNonNegativeInteger(import.meta.env.VITE_OVERPASS_MIN_INTERVAL_MS, 300)
const OVERPASS_MAX_RETRIES = normalizeNonNegativeInteger(import.meta.env.VITE_OVERPASS_MAX_RETRIES, 4)
const OVERPASS_RETRY_BASE_DELAY_MS = normalizeNonNegativeInteger(import.meta.env.VITE_OVERPASS_RETRY_BASE_DELAY_MS, 3000)
const OVERPASS_ENDPOINT_COOLDOWN_MS = normalizeNonNegativeInteger(import.meta.env.VITE_OVERPASS_ENDPOINT_COOLDOWN_MS, 30000)
const OVERPASS_CACHE_TTL_MS = normalizeNonNegativeInteger(import.meta.env.VITE_OVERPASS_CACHE_TTL_MS, 120000)

const endpointState = new Map(OVERPASS_ENDPOINTS.map((endpoint) => [
  endpoint,
  {
    disabledUntil: 0,
    permanentlyDown: false,
  },
]))

const inflightQueries = new Map()
const queryCache = new Map()

let limiterActive = 0
let limiterNextDispatchAt = 0
let limiterTimerHandle = null
const limiterQueue = []

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return fallback
}

function toOverpassBody(query) {
  return `data=${encodeURIComponent(query)}`
}

function parseRetryAfterMs(headerValue) {
  const value = String(headerValue || '').trim()
  if (!value) return 0
  const seconds = Number.parseInt(value, 10)
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000
  }
  const dateMs = Date.parse(value)
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }
  return 0
}

function clearLimiterTimer() {
  if (!limiterTimerHandle) return
  clearTimeout(limiterTimerHandle)
  limiterTimerHandle = null
}

function removeQueuedLimiterJob(job) {
  const index = limiterQueue.indexOf(job)
  if (index >= 0) limiterQueue.splice(index, 1)
}

function scheduleLimiter() {
  clearLimiterTimer()
  while (limiterActive < OVERPASS_MAX_CONCURRENCY && limiterQueue.length) {
    const now = Date.now()
    if (now < limiterNextDispatchAt) {
      const waitMs = Math.max(1, limiterNextDispatchAt - now)
      limiterTimerHandle = setTimeout(() => {
        limiterTimerHandle = null
        scheduleLimiter()
      }, waitMs)
      return
    }

    const job = limiterQueue.shift()
    if (!job || job.cancelled) continue
    limiterActive += 1
    limiterNextDispatchAt = now + OVERPASS_MIN_INTERVAL_MS

    Promise.resolve()
      .then(() => job.task())
      .then((result) => {
        if (!job.cancelled) {
          job.resolve(result)
        }
      })
      .catch((error) => {
        if (!job.cancelled) {
          job.reject(error)
        }
      })
      .finally(() => {
        limiterActive = Math.max(0, limiterActive - 1)
        scheduleLimiter()
      })
  }
}

function runWithOverpassLimiter(task, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Overpass 请求已取消'))
      return
    }
    const job = {
      task,
      resolve,
      reject,
      cancelled: false,
      abortHandler: null,
    }
    if (signal) {
      job.abortHandler = () => {
        job.cancelled = true
        removeQueuedLimiterJob(job)
        reject(new Error('Overpass 请求已取消'))
      }
      signal.addEventListener('abort', job.abortHandler, { once: true })
    }
    const wrappedResolve = (value) => {
      if (signal && job.abortHandler) {
        signal.removeEventListener('abort', job.abortHandler)
      }
      resolve(value)
    }
    const wrappedReject = (error) => {
      if (signal && job.abortHandler) {
        signal.removeEventListener('abort', job.abortHandler)
      }
      reject(error)
    }
    job.resolve = wrappedResolve
    job.reject = wrappedReject
    limiterQueue.push(job)
    scheduleLimiter()
  })
}

function getEndpointState(endpoint) {
  if (!endpointState.has(endpoint)) {
    endpointState.set(endpoint, {
      disabledUntil: 0,
      permanentlyDown: false,
    })
  }
  return endpointState.get(endpoint)
}

function getLiveEndpoints() {
  return OVERPASS_ENDPOINTS
    .filter((endpoint) => !getEndpointState(endpoint).permanentlyDown)
    .sort((left, right) => getEndpointState(left).disabledUntil - getEndpointState(right).disabledUntil)
}

function sleep(ms, signal) {
  const waitMs = Math.max(0, Number(ms) || 0)
  if (!waitMs) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let abortHandler = null
    const timer = setTimeout(() => {
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler)
      }
      resolve()
    }, waitMs)
    abortHandler = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abortHandler)
      reject(new Error('Overpass 请求已取消'))
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(new Error('Overpass 请求已取消'))
      } else {
        signal.addEventListener('abort', abortHandler, { once: true })
      }
    }
  })
}

function createAbortSignalWithTimeout(parentSignal, timeoutMs) {
  const controller = new AbortController()

  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`timeout-${timeoutMs}ms`))
  }, timeoutMs)

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason || new Error('aborted'))
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent()
    } else {
      parentSignal.addEventListener('abort', abortFromParent, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutHandle)
      if (parentSignal) {
        parentSignal.removeEventListener('abort', abortFromParent)
      }
    },
  }
}

/** @param {string} query @param {AbortSignal} [signal] @returns {Promise<{elements: object[]}>} */
export async function postOverpassQuery(query, signal) {
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) {
    throw new Error('Overpass 查询语句为空')
  }

  if (OVERPASS_CACHE_TTL_MS > 0) {
    const cacheEntry = queryCache.get(normalizedQuery)
    if (cacheEntry && cacheEntry.expireAt > Date.now()) {
      return cacheEntry.payload
    }
    if (cacheEntry && cacheEntry.expireAt <= Date.now()) {
      queryCache.delete(normalizedQuery)
    }
  }

  const inflight = inflightQueries.get(normalizedQuery)
  if (inflight) {
    return inflight
  }

  const requestPromise = postOverpassQueryInternal(normalizedQuery, signal)
  inflightQueries.set(normalizedQuery, requestPromise)
  try {
    const payload = await requestPromise
    if (OVERPASS_CACHE_TTL_MS > 0) {
      queryCache.set(normalizedQuery, {
        payload,
        expireAt: Date.now() + OVERPASS_CACHE_TTL_MS,
      })
    }
    return payload
  } finally {
    if (inflightQueries.get(normalizedQuery) === requestPromise) {
      inflightQueries.delete(normalizedQuery)
    }
  }
}

async function postOverpassQueryInternal(query, signal) {
  const failures = []
  if (signal?.aborted) {
    throw new Error('Overpass 请求已取消')
  }

  for (let attempt = 0; attempt <= OVERPASS_MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) {
      throw new Error('Overpass 请求已取消')
    }

    const endpoints = getLiveEndpoints()
    if (!endpoints.length) {
      throw new Error('Overpass 请求失败: 无可用端点')
    }

    let attemptedInRound = 0
    let had504 = false
    const now = Date.now()
    for (const endpoint of endpoints) {
      const state = getEndpointState(endpoint)
      if (state.disabledUntil > now) continue
      attemptedInRound += 1

      const { signal: requestSignal, cleanup } = createAbortSignalWithTimeout(signal, OVERPASS_REQUEST_TIMEOUT_MS)
      try {
        const response = await runWithOverpassLimiter(
          () => fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'application/json',
            },
            body: toOverpassBody(query),
            signal: requestSignal,
          }),
          signal,
        )

        if (!response.ok) {
          const status = Number(response.status) || 0
          if (status === 429) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'))
            state.disabledUntil = Date.now() + Math.max(retryAfterMs, OVERPASS_ENDPOINT_COOLDOWN_MS)
          } else if (status === 404 || status === 410) {
            state.permanentlyDown = true
          } else if (status === 504) {
            // 504 网关超时：不冷却当前端点，立即换端点重试
            state.disabledUntil = Date.now() + 500
            had504 = true
          } else if (status >= 500) {
            state.disabledUntil = Date.now() + OVERPASS_ENDPOINT_COOLDOWN_MS
          }
          failures.push(`${endpoint}(${status || 'http-error'})`)
          continue
        }

        const responseText = await response.text()
        let payload = null
        try {
          payload = JSON.parse(responseText)
        } catch {
          state.disabledUntil = Date.now() + OVERPASS_ENDPOINT_COOLDOWN_MS
          failures.push(`${endpoint}(invalid-json)`)
          continue
        }

        if (!payload?.elements || !Array.isArray(payload.elements)) {
          state.disabledUntil = Date.now() + OVERPASS_ENDPOINT_COOLDOWN_MS
          failures.push(`${endpoint}(invalid-payload)`)
          continue
        }

        return payload
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('Overpass 请求已取消')
        }
        state.disabledUntil = Date.now() + OVERPASS_ENDPOINT_COOLDOWN_MS
        failures.push(`${endpoint}(${error.message || 'network-error'})`)
      } finally {
        cleanup()
      }
    }

    if (attempt >= OVERPASS_MAX_RETRIES) break

    if (!attemptedInRound) {
      const nextReadyAt = endpoints.reduce((best, endpoint) => {
        const disabledUntil = getEndpointState(endpoint).disabledUntil || 0
        if (!best) return disabledUntil
        return Math.min(best, disabledUntil)
      }, 0)
      const waitMs = Math.max(OVERPASS_RETRY_BASE_DELAY_MS, nextReadyAt - Date.now())
      await sleep(waitMs, signal)
      continue
    }

    // 504 立即重试，不等待
    if (had504) continue

    const backoffMs = OVERPASS_RETRY_BASE_DELAY_MS * (attempt + 1)
    await sleep(backoffMs, signal)
  }

  throw new Error(`Overpass 请求失败: ${failures.join(', ')}`)
}
