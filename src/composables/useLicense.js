import { ref, computed } from 'vue'

const LICENSE_KEY = 'railmap_license'

const licenseKey = ref(localStorage.getItem(LICENSE_KEY) || '')

export const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

export const forceTrialOnLocalhost = ref(false)

export const isActivated = computed(() => (isLocalhost && !forceTrialOnLocalhost.value) || !!licenseKey.value)

export const isTrial = computed(() => !isActivated.value)

export function activate(key) {
  licenseKey.value = key
  localStorage.setItem(LICENSE_KEY, key)
}

export function deactivate() {
  licenseKey.value = ''
  localStorage.removeItem(LICENSE_KEY)
}

export const TRIAL_LIMITS = {
  maxProjects: 2,
  maxLines: 3,
}

// 浏览器控制台: __forceTrial(true) 开启, __forceTrial(false) 关闭
window.__forceTrial = (v) => { forceTrialOnLocalhost.value = !!v }
