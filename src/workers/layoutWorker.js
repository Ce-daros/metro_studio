import { optimizeLayout } from './layout/optimizeLayout'

self.onmessage = async (event) => {
  const { requestId, payload } = event.data || {}
  if (!requestId) return

  try {
    const result = optimizeLayout(payload)
    self.postMessage({ requestId, ok: true, result })
  } catch (error) {
    console.error('[LAYOUT WORKER] Error:', error)
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'unknown-worker-error',
      errorStack: error instanceof Error ? error.stack : null,
      errorName: error instanceof Error ? error.name : null,
    })
  }
}
