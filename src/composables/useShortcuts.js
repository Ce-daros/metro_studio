import { onMounted, onBeforeUnmount, shallowRef } from 'vue'
import {
  getEffectiveBindings,
  isTextInputTarget,
  matchesEvent,
  parseBinding,
} from '../lib/shortcutRegistry'

/**
 * Unified global keydown dispatcher.
 *
 * @param {Record<string, (event: KeyboardEvent) => void>} handlers
 *   Map of shortcut id → callback function.
 * @param {Object} options
 * @param {() => 'navigation' | 'mapEditor' | 'global'} options.getContext
 *   Returns the current shortcut context. Priority: navigation > mapEditor > global.
 */
export function useShortcuts(handlers, options = {}) {
  const { getContext = () => 'global' } = options

  // Parsed bindings cache: array of { id, when, parsed, hidden }
  const bindingsCache = shallowRef([])

  function buildBindings() {
    const effective = getEffectiveBindings()
    bindingsCache.value = effective.map((b) => ({
      id: b.id,
      when: b.when,
      parsed: parseBinding(b.binding),
    }))
  }

  function handler(event) {
    const inTextInput = isTextInputTarget(event.target)
    const context = getContext()

    // Context priority order
    const contextPriority = []
    if (context === 'navigation') contextPriority.push('navigation', 'mapEditor', 'global')
    else if (context === 'mapEditor') contextPriority.push('mapEditor', 'global')
    else contextPriority.push('global')

    for (const ctx of contextPriority) {
      for (const binding of bindingsCache.value) {
        if (binding.when !== ctx) continue
        if (!matchesEvent(binding.parsed, event)) continue
        if (!handlers[binding.id]) continue

        // In text inputs, skip all shortcuts so native input behavior works
        if (inTextInput) continue

        event.preventDefault()
        handlers[binding.id](event)
        return
      }
    }
  }

  onMounted(() => {
    buildBindings()
    window.addEventListener('keydown', handler, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handler, true)
  })

  /** Call after custom bindings change to refresh the cache. */
  function rebuildBindings() {
    buildBindings()
  }

  return { rebuildBindings }
}
