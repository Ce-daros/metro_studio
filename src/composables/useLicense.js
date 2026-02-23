import { ref, computed } from 'vue'

// Ed25519 public key (SPKI DER, base64)
const PUB_KEY_B64 = 'MCowBQYDK2VwAyEA5NYs7LPomNcyx21Uw72EXbtnY0lvag0TyQ1H8KEaq7I='

export const PURCHASE_URL = import.meta.env.VITE_PURCHASE_URL || 'https://metro-back.angelkawaii.xyz/buy'

const LICENSE_KEY = 'railmap_license'
const INTEGRITY_KEY = 'railmap_license_integrity'

export const TRIAL_LIMITS = {
  maxProjects: 1,
  maxStations: 20,
  maxExportHeight: 720,
}

export const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

export const forceTrialOnLocalhost = ref(false)

const licenseValid = ref(false)

// Anti-tamper: verify integrity hash on load
;(function restoreLicense() {
  try {
    const raw = localStorage.getItem(LICENSE_KEY)
    const hash = localStorage.getItem(INTEGRITY_KEY)
    if (!raw || !hash) return
    if (computeIntegrity(raw) !== hash) {
      // Tampered — wipe
      localStorage.removeItem(LICENSE_KEY)
      localStorage.removeItem(INTEGRITY_KEY)
      return
    }
    // Re-verify signature asynchronously
    verifyKey(raw).then(ok => { licenseValid.value = ok })
  } catch { /* noop */ }
})()

export const isActivated = computed(() =>
  (isLocalhost && !forceTrialOnLocalhost.value) || licenseValid.value
)

export const isTrial = computed(() => !isActivated.value)

/**
 * Activate with a license key. Returns { success, error }.
 * Key format: base64(payload).base64(signature)
 */
export async function activate(key) {
  const trimmed = (key || '').trim()
  if (!trimmed) return { success: false, error: '请输入 License Key' }

  const ok = await verifyKey(trimmed)
  if (!ok) return { success: false, error: 'License Key 无效，请检查后重试' }

  licenseValid.value = true
  localStorage.setItem(LICENSE_KEY, trimmed)
  localStorage.setItem(INTEGRITY_KEY, computeIntegrity(trimmed))
  return { success: true, error: '' }
}

export function deactivate() {
  licenseValid.value = false
  localStorage.removeItem(LICENSE_KEY)
  localStorage.removeItem(INTEGRITY_KEY)
}

// __forceTrial only on localhost
if (isLocalhost) {
  window.__forceTrial = (v) => { forceTrialOnLocalhost.value = !!v }
}

// ── Internals ──

async function verifyKey(key) {
  try {
    const dotIdx = key.lastIndexOf('.')
    if (dotIdx < 1) return false
    const payloadB64 = key.slice(0, dotIdx)
    const sigB64 = key.slice(dotIdx + 1)

    const pubKeyBuf = Uint8Array.from(atob(PUB_KEY_B64), c => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'spki', pubKeyBuf, { name: 'Ed25519' }, false, ['verify']
    )

    const payload = new TextEncoder().encode(payloadB64)
    const signature = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0))

    return await crypto.subtle.verify('Ed25519', cryptoKey, signature, payload)
  } catch {
    return false
  }
}

function computeIntegrity(value) {
  // Simple FNV-1a 32-bit hash as hex — not cryptographic, just tamper detection
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
