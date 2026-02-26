/**
 * Font loading for timeline canvas rendering.
 * Uses Source Han Sans SC (system-installed) with sans-serif fallback.
 */

export const FONT_FAMILY = '"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif'

/**
 * No-op: relies on system-installed Source Han Sans SC.
 * Kept for backward compatibility with callers.
 */
export function loadSourceHanSans(_textHint = '') {
  return Promise.resolve()
}
