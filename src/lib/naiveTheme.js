import { darkTheme } from 'naive-ui'

const PRIMARY = '#f900bf'
const INFO = '#bc1fff'
const SUCCESS = '#33d17a'
const WARNING = '#ff7a2f'
const ERROR = '#ff4d88'

export const naiveThemeOverrides = {
  common: {
    primaryColor: PRIMARY,
    primaryColorHover: '#ff33c7',
    primaryColorPressed: '#d700a6',
    primaryColorSuppl: PRIMARY,
    infoColor: INFO,
    infoColorHover: '#c94bff',
    infoColorPressed: '#9e00f2',
    successColor: SUCCESS,
    successColorHover: '#54df94',
    successColorPressed: '#1da85e',
    warningColor: WARNING,
    warningColorHover: '#ff9150',
    warningColorPressed: '#ef6c1d',
    errorColor: ERROR,
    errorColorHover: '#ff6a9d',
    errorColorPressed: '#e93574',
    borderRadius: '0px',
    borderRadiusSmall: '0px',
    fontSize: '14px',
    fontSizeSmall: '13px',
    fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Cascadia Mono', 'Consolas', 'Sarasa Mono SC', 'Noto Sans Mono CJK SC', 'Microsoft YaHei', monospace",
  },
  Dialog: {
    borderRadius: '0px',
    color: '#121212',
    border: '1px solid rgba(188,31,255,0.48)',
  },
  Modal: {
    borderRadius: '0px',
    color: '#121212',
    border: '1px solid rgba(188,31,255,0.48)',
  },
  Dropdown: {
    borderRadius: '0px',
    color: '#121212',
    optionColorHover: 'rgba(249,0,191,0.16)',
  },
  Tooltip: {
    borderRadius: '0px',
    color: '#121212',
    border: '1px solid rgba(188,31,255,0.48)',
  },
  Input: {
    borderRadius: '0px',
    borderFocus: '1px solid #bc1fff',
    boxShadowFocus: '0 0 0 1px #bc1fff, 0 0 8px rgba(188,31,255,0.26)',
  },
  Card: {
    borderRadius: '0px',
    color: '#121212',
    borderColor: 'rgba(188,31,255,0.44)',
  },
}

export const naiveTheme = darkTheme
