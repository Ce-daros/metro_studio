import { ref, h } from 'vue'
import { NInput } from 'naive-ui'

// Naive UI dialog instance, set by App.vue via setDialogApi()
let dialogApi = null

/** @param {object} api - Naive UI dialog API instance */
export function setDialogApi(api) {
  dialogApi = api
}

function confirm({
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (!dialogApi) { resolve(false); return }
    const d = dialogApi[danger ? 'error' : 'warning']({
      title,
      content: message,
      positiveText: confirmText,
      negativeText: cancelText,
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => { d.destroy(); resolve(false) },
    })
  })
}

function prompt({
  title = '请输入',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = '确认',
  cancelText = '取消',
} = {}) {
  return new Promise((resolve) => {
    if (!dialogApi) { resolve(null); return }
    const inputValue = ref(defaultValue)
    const d = dialogApi.create({
      title,
      content: () => h('div', null, [
        message ? h('p', { style: 'margin:0 0 10px;font-size:13px;color:var(--toolbar-muted)' }, message) : null,
        h(NInput, {
          value: inputValue.value,
          placeholder,
          onUpdateValue: (v) => { inputValue.value = v },
          onKeydown: (e) => { if (e.key === 'Enter') { d.destroy(); resolve(inputValue.value) } },
          autofocus: true,
        }),
      ]),
      positiveText: confirmText,
      negativeText: cancelText,
      onPositiveClick: () => resolve(inputValue.value),
      onNegativeClick: () => resolve(null),
      onClose: () => resolve(null),
      onMaskClick: () => { d.destroy(); resolve(null) },
    })
  })
}

function info({
  title = '提示',
  message,
  confirmText = '知道了',
} = {}) {
  return new Promise((resolve) => {
    if (!dialogApi) { resolve(); return }
    dialogApi.info({
      title,
      content: message,
      positiveText: confirmText,
      onPositiveClick: () => resolve(),
      onClose: () => resolve(),
      onMaskClick: () => resolve(),
    })
  })
}

/** @returns {{confirm: (options?: {title?: string, message?: string, confirmText?: string, cancelText?: string, danger?: boolean}) => Promise<boolean>, prompt: (options?: {title?: string, message?: string, placeholder?: string, defaultValue?: string, confirmText?: string, cancelText?: string}) => Promise<string|null>, info: (options?: {title?: string, message?: string, confirmText?: string}) => Promise<void>}} */
export function useDialog() {
  return { confirm, prompt, info }
}
