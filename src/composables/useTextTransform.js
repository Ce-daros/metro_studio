import { ref, computed } from 'vue'
import { Converter } from 'opencc-js'

const STORAGE_KEY = 'metro_studio_chinese_script'
const CACHE_SIZE = 500

export function useTextTransform() {
  const currentScript = ref('simplified')
  const converter = ref(null)
  const cache = ref(new Map())

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'traditional' || saved === 'simplified') {
      currentScript.value = saved
    }
  } catch { /* ignore */ }

  async function initConverter() {
    if (converter.value) return converter.value

    const from = currentScript.value === 'traditional' ? 'cn' : 'tw'
    const to = currentScript.value === 'traditional' ? 'tw' : 'cn'

    const factory = await Converter({ from, to })
    converter.value = factory
    return converter.value
  }

  async function convertText(text, forceScript = null) {
    if (!text || typeof text !== 'string') return text

    const script = forceScript || currentScript.value
    if (script === 'simplified') return text

    const cacheKey = `${text}_${script}`
    if (cache.value.has(cacheKey)) {
      return cache.value.get(cacheKey)
    }

    const from = script === 'traditional' ? 'cn' : 'tw'
    const to = script === 'traditional' ? 'tw' : 'cn'

    let conv = converter.value
    if (!conv || currentScript.value !== script) {
      conv = await Converter({ from, to })
      if (script === currentScript.value) {
        converter.value = conv
      }
    }

    const result = conv(text)

    if (cache.value.size >= CACHE_SIZE) {
      const firstKey = cache.value.keys().next().value
      cache.value.delete(firstKey)
    }
    cache.value.set(cacheKey, result)

    return result
  }

  function setScript(script) {
    if (script !== 'simplified' && script !== 'traditional') return

    currentScript.value = script
    converter.value = null
    cache.value.clear()

    try {
      localStorage.setItem(STORAGE_KEY, script)
    } catch { /* ignore */ }
  }

  function toggleScript() {
    setScript(currentScript.value === 'simplified' ? 'traditional' : 'simplified')
  }

  return {
    currentScript,
    isTraditional: computed(() => currentScript.value === 'traditional'),
    setScript,
    toggleScript,
    convertText,
  }
}
