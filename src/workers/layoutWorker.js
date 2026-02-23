import { optimizeLayout } from './layout/optimizeLayout'
import { loadModel, isModelLoaded, predictParams } from './layout/modelInference'
import { extractNetworkFeatures } from './layout/networkFeatures'

self.onmessage = async (event) => {
  const { requestId, payload, action } = event.data || {}
  if (!requestId) return

  try {
    if (action === 'loadModel') {
      await loadModel(payload.modelUrl, payload.normUrl)
      self.postMessage({ requestId, ok: true, result: { loaded: true } })
      return
    }

    let finalPayload = payload
    if (payload?.config?.layoutMode === 'chinese' && isModelLoaded()) {
      const features = extractNetworkFeatures(payload.stations, payload.edges, payload.lines)
      const predicted = await predictParams(features)
      finalPayload = {
        ...payload,
        config: { ...predicted, ...(payload.config || {}), layoutMode: undefined },
      }
    }

    const result = optimizeLayout(finalPayload)
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
