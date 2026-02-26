/**
 * 公共异步工具函数
 */

/**
 * 可取消的 sleep
 * @param {number} ms 等待毫秒数
 * @param {AbortSignal} [signal] 可选的取消信号
 * @returns {Promise<void>}
 */
export function sleep(ms, signal) {
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
      reject(signal.reason || new Error('aborted'))
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(signal.reason || new Error('aborted'))
      } else {
        signal.addEventListener('abort', abortHandler, { once: true })
      }
    }
  })
}

/**
 * 创建带超时的 AbortSignal，同时跟随父信号
 * @param {AbortSignal} [parentSignal]
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, cleanup: () => void }}
 */
export function createAbortSignalWithTimeout(parentSignal, timeoutMs) {
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

/**
 * 安全地将值转为有限数字
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function toFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
