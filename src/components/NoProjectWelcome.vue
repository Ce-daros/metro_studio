<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isTrial, PURCHASE_URL } from '../composables/useLicense'

import { onMounted as onMountedGlobal } from 'vue'

onMountedGlobal(() => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap'
  document.head.appendChild(link)
})

const emit = defineEmits(['create-project', 'import-project', 'enter-directly', 'import-city', 'show-about'])

const canvasRef = ref(null)
const decorCanvasRef = ref(null)
let frameId = 0
let decorFrameId = 0
let onResize = null

function createWelcomeSubtitleId() {
  return Math.random().toString(16).slice(2, 8).toUpperCase()
}

const welcomeSubtitleId = ref(createWelcomeSubtitleId())

const CITIES = [
  { id: 'beijing', name: '北京', nameEn: 'BEIJING' },
  { id: 'shanghai', name: '上海', nameEn: 'SHANGHAI' },
  { id: 'guangzhou', name: '广州', nameEn: 'GUANGZHOU' },
  { id: 'shenzhen', name: '深圳', nameEn: 'SHENZHEN' },
  { id: 'qingdao', name: '青岛', nameEn: 'QINGDAO' },
  { id: 'jinan', name: '济南', nameEn: 'JINAN' },
]

// 城市代表性SVG图标 (天安门 / 东方明珠 / 广州塔)
const CITY_SVGS = {
  beijing: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 天安门 -->
    <rect x="20" y="70" width="80" height="6" rx="1" fill="rgba(188,31,255,0.5)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <rect x="30" y="56" width="60" height="14" rx="1" fill="rgba(188,31,255,0.25)" stroke="rgba(188,31,255,0.7)" stroke-width="0.8"/>
    <polygon points="25,56 60,40 95,56" fill="rgba(188,31,255,0.18)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <rect x="38" y="44" width="44" height="10" rx="1" fill="rgba(188,31,255,0.2)" stroke="rgba(188,31,255,0.6)" stroke-width="0.7"/>
    <polygon points="34,44 60,30 86,44" fill="rgba(188,31,255,0.15)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <!-- 城楼顶 -->
    <rect x="56" y="24" width="8" height="6" fill="rgba(188,31,255,0.3)" stroke="rgba(188,31,255,0.7)" stroke-width="0.6"/>
    <line x1="60" y1="18" x2="60" y2="24" stroke="rgba(249,0,191,0.9)" stroke-width="1"/>
    <!-- 门洞 -->
    <rect x="40" y="60" width="6" height="10" rx="1" fill="rgba(188,31,255,0.35)" stroke="rgba(188,31,255,0.5)" stroke-width="0.5"/>
    <rect x="52" y="58" width="16" height="12" rx="2" fill="rgba(188,31,255,0.35)" stroke="rgba(188,31,255,0.6)" stroke-width="0.6"/>
    <rect x="74" y="60" width="6" height="10" rx="1" fill="rgba(188,31,255,0.35)" stroke="rgba(188,31,255,0.5)" stroke-width="0.5"/>
    <!-- 地面线 -->
    <line x1="10" y1="76" x2="110" y2="76" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="90" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="93" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`,
  shanghai: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 东方明珠塔 -->
    <line x1="60" y1="14" x2="60" y2="76" stroke="rgba(188,31,255,0.7)" stroke-width="1.2"/>
    <!-- 顶部天线 -->
    <line x1="60" y1="8" x2="60" y2="14" stroke="rgba(249,0,191,0.9)" stroke-width="0.8"/>
    <circle cx="60" cy="8" r="1.5" fill="rgba(249,0,191,0.9)"/>
    <!-- 上球体 -->
    <circle cx="60" cy="30" r="9" fill="rgba(188,31,255,0.2)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <ellipse cx="60" cy="30" rx="9" ry="3" fill="none" stroke="rgba(188,31,255,0.4)" stroke-width="0.5"/>
    <!-- 中间连接 -->
    <line x1="54" y1="39" x2="52" y2="52" stroke="rgba(188,31,255,0.5)" stroke-width="0.8"/>
    <line x1="66" y1="39" x2="68" y2="52" stroke="rgba(188,31,255,0.5)" stroke-width="0.8"/>
    <!-- 下球体 -->
    <circle cx="60" cy="58" r="12" fill="rgba(188,31,255,0.18)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <ellipse cx="60" cy="58" rx="12" ry="4" fill="none" stroke="rgba(188,31,255,0.4)" stroke-width="0.5"/>
    <!-- 底座支撑 -->
    <line x1="52" y1="70" x2="44" y2="76" stroke="rgba(188,31,255,0.6)" stroke-width="0.8"/>
    <line x1="68" y1="70" x2="76" y2="76" stroke="rgba(188,31,255,0.6)" stroke-width="0.8"/>
    <!-- 底座 -->
    <rect x="40" y="76" width="40" height="3" rx="1" fill="rgba(188,31,255,0.3)" stroke="rgba(188,31,255,0.6)" stroke-width="0.6"/>
    <!-- 旁边楼群剪影 -->
    <rect x="18" y="50" width="8" height="29" fill="rgba(188,31,255,0.1)" stroke="rgba(188,31,255,0.3)" stroke-width="0.5"/>
    <rect x="28" y="42" width="7" height="37" fill="rgba(188,31,255,0.08)" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <rect x="85" y="46" width="8" height="33" fill="rgba(188,31,255,0.1)" stroke="rgba(188,31,255,0.3)" stroke-width="0.5"/>
    <rect x="95" y="54" width="7" height="25" fill="rgba(188,31,255,0.08)" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <!-- 地面线 -->
    <line x1="10" y1="79" x2="110" y2="79" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="93" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="96" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`,
  guangzhou: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 广州塔（小蛮腰）- 双曲面外形，腰部极窄 -->
    <!-- 左轮廓：底宽→腰窄→顶部微宽 -->
    <path d="M42,76 C42,66 52,58 56,52 C59,48 59,38 57,22 L56,16" fill="none" stroke="rgba(188,31,255,0.8)" stroke-width="0.9"/>
    <!-- 右轮廓 -->
    <path d="M78,76 C78,66 68,58 64,52 C61,48 61,38 63,22 L64,16" fill="none" stroke="rgba(188,31,255,0.8)" stroke-width="0.9"/>
    <!-- 填充 -->
    <path d="M42,76 C42,66 52,58 56,52 C59,48 59,38 57,22 L56,16 L64,16 L63,22 C61,38 61,48 64,52 C68,58 78,66 78,76 Z" fill="rgba(188,31,255,0.07)"/>
    <!-- 斜交叉网格线（模拟钢结构） -->
    <line x1="44" y1="72" x2="64" y2="22" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <line x1="56" y1="72" x2="63" y2="28" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <line x1="68" y1="72" x2="62" y2="34" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <line x1="76" y1="72" x2="56" y2="22" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <line x1="64" y1="72" x2="57" y2="28" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <line x1="52" y1="72" x2="58" y2="34" stroke="rgba(188,31,255,0.2)" stroke-width="0.4"/>
    <!-- 横向结构环 -->
    <line x1="44" y1="72" x2="76" y2="72" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="47" y1="66" x2="73" y2="66" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="52" y1="60" x2="68" y2="60" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="56" y1="54" x2="64" y2="54" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="57" y1="48" x2="63" y2="48" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="58" y1="42" x2="62" y2="42" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="57" y1="36" x2="63" y2="36" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <line x1="57" y1="30" x2="63" y2="30" stroke="rgba(188,31,255,0.3)" stroke-width="0.4"/>
    <!-- 顶部天线 -->
    <line x1="60" y1="4" x2="60" y2="16" stroke="rgba(249,0,191,0.9)" stroke-width="0.8"/>
    <circle cx="60" cy="4" r="1.5" fill="rgba(249,0,191,0.9)"/>
    <!-- 顶部观光球 -->
    <ellipse cx="60" cy="18" rx="6" ry="2.5" fill="rgba(188,31,255,0.15)" stroke="rgba(188,31,255,0.5)" stroke-width="0.5"/>
    <!-- 底座 -->
    <rect x="38" y="76" width="44" height="3" rx="1" fill="rgba(188,31,255,0.3)" stroke="rgba(188,31,255,0.6)" stroke-width="0.6"/>
    <!-- 地面线 -->
    <line x1="10" y1="79" x2="110" y2="79" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 珠江水面 -->
    <path d="M10,84 Q25,82 40,84 Q55,86 70,84 Q85,82 100,84 Q107,85 110,84" fill="none" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="97" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="100" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`,
  shenzhen: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 平安金融中心 -->
    <!-- 主塔身 - 细长锥形 -->
    <path d="M53,76 L55,28 L58,16 L60,12 L62,16 L65,28 L67,76 Z" fill="rgba(188,31,255,0.1)" stroke="rgba(188,31,255,0.8)" stroke-width="0.8"/>
    <!-- 横向楼层线 -->
    <line x1="53.5" y1="72" x2="66.5" y2="72" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <line x1="54" y1="64" x2="66" y2="64" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <line x1="54.5" y1="56" x2="65.5" y2="56" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <line x1="55" y1="48" x2="65" y2="48" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <line x1="55.5" y1="40" x2="64.5" y2="40" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <line x1="56" y1="32" x2="64" y2="32" stroke="rgba(188,31,255,0.35)" stroke-width="0.4"/>
    <!-- 顶部尖顶灯 -->
    <line x1="60" y1="5" x2="60" y2="12" stroke="rgba(249,0,191,0.9)" stroke-width="0.8"/>
    <circle cx="60" cy="5" r="1.5" fill="rgba(249,0,191,0.9)"/>
    <!-- 周围楼群剪影 -->
    <rect x="24" y="50" width="9" height="29" fill="rgba(188,31,255,0.08)" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <rect x="35" y="56" width="8" height="23" fill="rgba(188,31,255,0.06)" stroke="rgba(188,31,255,0.2)" stroke-width="0.5"/>
    <rect x="77" y="46" width="9" height="33" fill="rgba(188,31,255,0.08)" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <rect x="88" y="54" width="8" height="25" fill="rgba(188,31,255,0.06)" stroke="rgba(188,31,255,0.2)" stroke-width="0.5"/>
    <rect x="44" y="62" width="6" height="17" fill="rgba(188,31,255,0.05)" stroke="rgba(188,31,255,0.18)" stroke-width="0.4"/>
    <rect x="70" y="58" width="6" height="21" fill="rgba(188,31,255,0.05)" stroke="rgba(188,31,255,0.18)" stroke-width="0.4"/>
    <!-- 底座 -->
    <rect x="48" y="76" width="24" height="3" rx="1" fill="rgba(188,31,255,0.3)" stroke="rgba(188,31,255,0.6)" stroke-width="0.6"/>
    <!-- 地面线 -->
    <line x1="10" y1="79" x2="110" y2="79" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="93" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="96" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`,
  qingdao: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 五月的风雕塑 - 螺旋扭曲钢板，底宽顶尖 -->
    <!-- 外层螺旋轮廓 - 从右下方宽处旋向左上方尖顶 -->
    <path d="M74,64 C78,52 74,40 64,32 C54,24 46,22 50,18" fill="none" stroke="rgba(249,0,191,0.8)" stroke-width="1.2"/>
    <!-- 外层螺旋轮廓 - 从左下方旋向右上 -->
    <path d="M44,64 C38,52 42,38 54,28 C62,22 64,20 58,16" fill="none" stroke="rgba(188,31,255,0.8)" stroke-width="1.2"/>
    <!-- 螺旋面填充 - 左瓣 -->
    <path d="M44,64 C38,52 42,38 54,28 C58,25 58,22 58,16 L50,18 C46,22 54,24 64,32 C68,35 66,42 60,48 C54,54 46,60 44,64 Z" fill="rgba(249,0,191,0.08)"/>
    <!-- 螺旋面填充 - 右瓣 -->
    <path d="M74,64 C78,52 74,40 64,32 C60,29 58,24 50,18 L58,16 C64,20 62,22 54,28 C48,33 44,42 48,50 C52,58 64,62 74,64 Z" fill="rgba(188,31,255,0.08)"/>
    <!-- 中心扭转线 -->
    <path d="M58,18 C56,28 52,36 54,44 C56,52 60,58 59,64" fill="none" stroke="rgba(249,0,191,0.4)" stroke-width="0.6"/>
    <path d="M54,22 C58,30 62,38 60,46 C58,54 54,60 56,64" fill="none" stroke="rgba(188,31,255,0.35)" stroke-width="0.5"/>
    <!-- 底座台基 -->
    <rect x="40" y="66" width="38" height="4" rx="1" fill="rgba(188,31,255,0.15)" stroke="rgba(188,31,255,0.5)" stroke-width="0.6"/>
    <rect x="36" y="70" width="46" height="3" rx="1" fill="rgba(188,31,255,0.2)" stroke="rgba(188,31,255,0.5)" stroke-width="0.6"/>
    <!-- 广场地面 -->
    <line x1="10" y1="76" x2="110" y2="76" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 海岸线与海面 -->
    <path d="M10,84 Q30,82 50,84 Q70,86 90,84 Q105,82 110,84" fill="none" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <path d="M10,88 Q35,86 60,88 Q85,90 110,88" fill="none" stroke="rgba(188,31,255,0.15)" stroke-width="0.4"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="97" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="100" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`,
  jinan: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 趵突泉 -->
    <!-- 三股泉水喷涌 -->
    <path d="M44,50 Q44,40 45,34 Q45,28 44,24" fill="none" stroke="rgba(188,31,255,0.65)" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M60,46 Q60,34 60,26 Q60,20 59,16" fill="none" stroke="rgba(249,0,191,0.75)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M76,50 Q76,40 75,34 Q75,28 76,24" fill="none" stroke="rgba(188,31,255,0.65)" stroke-width="1.2" stroke-linecap="round"/>
    <!-- 水花飞溅 -->
    <circle cx="44" cy="22" r="2.5" fill="none" stroke="rgba(188,31,255,0.4)" stroke-width="0.6"/>
    <circle cx="59" cy="14" r="3" fill="none" stroke="rgba(249,0,191,0.45)" stroke-width="0.7"/>
    <circle cx="76" cy="22" r="2.5" fill="none" stroke="rgba(188,31,255,0.4)" stroke-width="0.6"/>
    <circle cx="41" cy="20" r="1" fill="rgba(188,31,255,0.5)"/>
    <circle cx="62" cy="12" r="1.2" fill="rgba(249,0,191,0.5)"/>
    <circle cx="79" cy="20" r="1" fill="rgba(188,31,255,0.5)"/>
    <!-- 泉池 -->
    <ellipse cx="60" cy="56" rx="32" ry="9" fill="rgba(188,31,255,0.08)" stroke="rgba(188,31,255,0.6)" stroke-width="0.8"/>
    <!-- 水面同心波纹 -->
    <ellipse cx="60" cy="55" rx="22" ry="6" fill="none" stroke="rgba(188,31,255,0.25)" stroke-width="0.5"/>
    <ellipse cx="60" cy="55" rx="13" ry="3.5" fill="none" stroke="rgba(188,31,255,0.18)" stroke-width="0.4"/>
    <!-- 池边石栏 -->
    <path d="M26,62 Q26,70 34,72 L86,72 Q94,70 94,62" fill="none" stroke="rgba(188,31,255,0.45)" stroke-width="0.7"/>
    <!-- 地面线 -->
    <line x1="10" y1="76" x2="110" y2="76" stroke="rgba(188,31,255,0.3)" stroke-width="0.5" stroke-dasharray="3,2"/>
    <!-- 地铁符号 -->
    <circle cx="60" cy="93" r="8" fill="none" stroke="rgba(249,0,191,0.6)" stroke-width="0.8"/>
    <text x="60" y="96" text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(249,0,191,0.8)" font-family="monospace">M</text>
  </svg>`
}

// METRO STUDIO 字母的点阵定义 (7x5 网格)
// 1: 节点, 0: 空白
const LETTER_MAP = {
  M: [
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1]
  ],
  E: [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1]
  ],
  T: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0]
  ],
  R: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0]
  ],
  O: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0]
  ],
  S: [
    [0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0]
  ],
  U: [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0]
  ],
  D: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0]
  ],
  I: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1]
  ],
  ' ': [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ]
}

const LETTER_ORDER = ['M', 'E', 'T', 'R', 'O', ' ', 'S', 'T', 'U', 'D', 'I', 'O']

class MetroAgent {
  constructor(targetPoints, color, speed = 2) {
    this.path = []
    this.targetPoints = targetPoints // 目标点列表
    this.currentIndex = 0
    this.color = color
    this.speed = speed
    this.progress = 0
    this.finished = false
    
    // 初始位置
    if (targetPoints.length > 0) {
      this.currentPos = { ...targetPoints[0] }
      this.path.push({ ...this.currentPos })
    }
  }

  update() {
    if (this.finished) return

    const target = this.targetPoints[this.currentIndex + 1]
    if (!target) {
      this.finished = true
      return
    }

    const dx = target.x - this.currentPos.x
    const dy = target.y - this.currentPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < this.speed) {
      this.currentPos = { ...target }
      this.path.push({ ...this.currentPos })
      this.currentIndex++
      if (this.currentIndex >= this.targetPoints.length - 1) {
        this.finished = true
      }
    } else {
      const angle = Math.atan2(dy, dx)
      this.currentPos.x += Math.cos(angle) * this.speed
      this.currentPos.y += Math.sin(angle) * this.speed
      
      // 只有在转折点才添加到 path，减少点数
      // 这里简化处理，每隔一定距离添加一个点，为了绘制平滑
      if (this.path.length === 0 || 
          Math.abs(this.currentPos.x - this.path[this.path.length-1].x) > 5 || 
          Math.abs(this.currentPos.y - this.path[this.path.length-1].y) > 5) {
         this.path.push({ ...this.currentPos })
      }
    }
  }

  draw(ctx) {
    if (this.path.length < 2) return

    ctx.beginPath()
    ctx.moveTo(this.path[0].x, this.path[0].y)
    for (let i = 1; i < this.path.length; i++) {
      ctx.lineTo(this.path[i].x, this.path[i].y)
    }
    
    // 线条光晕
    ctx.shadowBlur = 10
    ctx.shadowColor = this.color
    ctx.strokeStyle = this.color
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.shadowBlur = 0

    // 头部
    if (!this.finished) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(this.currentPos.x, this.currentPos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  
  let width = 0
  let height = 0
  let agents = []
  
  // 颜色调色板
  const colors = ['#f900bf', '#bc1fff', '#ffffff', '#26c6da']

  function initAgents() {
    agents = []
    
    // 计算字母布局
    // 假设每个字母 50x80 (scale * grid)
    const scale = width < 768 ? 8 : 10 // 网格大小
    const spacing = 16 // 字母间距
    const startX = (width - (LETTER_ORDER.length * (5 * scale + spacing))) / 2
    const startY = height * 0.18 // 移至上方
    
    LETTER_ORDER.forEach((char, index) => {
      const grid = LETTER_MAP[char]
      const charOffsetX = startX + index * (5 * scale + spacing)
      
      // 为每个字母创建 1-2 条线路
      const points = []
      
      // 收集所有实点
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y][x] === 1) {
            points.push({
              x: charOffsetX + x * scale,
              y: startY + y * scale
            })
          }
        }
      }

      // 简单的路径排序：按 Y 轴排序，然后 X 轴，模拟书写顺序
      // 或者随机连接，制造一种“探索”感
      // 这里我们尝试将点分为两组，创建两条线
      if (points.length > 0) {
        // 按照一定的逻辑排序点，使其连贯
        // 简单起见，我们直接按行扫描的顺序连接，虽然会有些奇怪的连线，但作为故障/构建效果是可以接受的
        // 或者我们可以随机打乱顺序，然后用最小生成树? 
        // 让我们试着随机生成几条路径穿过这些点
        
        const path1 = []
        const path2 = []
        
        points.forEach((p, i) => {
          if (i % 2 === 0) path1.push(p)
          else path2.push(p)
        })
        
        // 添加一些随机的控制点，模拟地铁的转弯
        // 实际上 MetroAgent 会直线移动，如果要模拟地铁，我们需要生成曼哈顿路径
        // 这里简化：直接连接点
        
        if (path1.length > 1) {
             // 让路径更像地铁：插入中间点
             const refinedPath1 = [path1[0]];
             for(let i=1; i<path1.length; i++) {
                 // 简单的 90 度转弯插值
                 const prev = path1[i-1];
                 const curr = path1[i];
                 if (Math.random() > 0.5) {
                     refinedPath1.push({ x: curr.x, y: prev.y }); // 先水平后垂直
                 } else {
                     refinedPath1.push({ x: prev.x, y: curr.y }); // 先垂直后水平
                 }
                 refinedPath1.push(curr);
             }
             agents.push(new MetroAgent(refinedPath1, colors[index % colors.length], 3 + Math.random()))
        }
        
        if (path2.length > 1) {
            const refinedPath2 = [path2[0]];
             for(let i=1; i<path2.length; i++) {
                 const prev = path2[i-1];
                 const curr = path2[i];
                 if (Math.random() > 0.5) {
                     refinedPath2.push({ x: curr.x, y: prev.y });
                 } else {
                     refinedPath2.push({ x: prev.x, y: curr.y });
                 }
                 refinedPath2.push(curr);
             }
            agents.push(new MetroAgent(refinedPath2, colors[(index + 1) % colors.length], 3 + Math.random()))
        }
      }
    })
  }

  function resize() {
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = width
    canvas.height = height
    initAgents()
  }

  function draw() {
    // 拖尾效果
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)'
    ctx.fillRect(0, 0, width, height)
    
    // 绘制网格背景
    ctx.strokeStyle = 'rgba(188, 31, 255, 0.03)'
    ctx.lineWidth = 1
    const gridSize = 40
    ctx.beginPath()
    for (let x = 0; x <= width; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke()

    let allFinished = true
    for (const agent of agents) {
      agent.update()
      agent.draw(ctx)
      if (!agent.finished) allFinished = false
    }
    
    // 如果所有都完成了，稍微停顿后重置，或者保持不动？
    // 为了保持动态，我们可以让一部分线消退然后重画
    if (allFinished && Math.random() > 0.99) {
        // 随机重置一个 Agent
        const idx = Math.floor(Math.random() * agents.length)
        const agent = agents[idx]
        agent.path = []
        agent.currentIndex = 0
        agent.finished = false
        agent.currentPos = { ...agent.targetPoints[0] }
    }

    frameId = requestAnimationFrame(draw)
  }

  // --- 全屏装饰动画逻辑：密集地铁线网 ---
  const initDecor = () => {
    const dCanvas = decorCanvasRef.value
    if (!dCanvas) return
    const dCtx = dCanvas.getContext('2d')
    let W = dCanvas.parentElement.clientWidth
    let H = dCanvas.parentElement.clientHeight
    dCanvas.width = W; dCanvas.height = H

    // 程序化生成全屏密集线网
    const GRID_COLS = 14
    const GRID_ROWS = 9
    const BASE_W = 1400
    const BASE_H = 900
    const MX = 60, MY = 60

    function getTransform() {
      const scale = Math.max(W / BASE_W, H / BASE_H)
      const ox = (W - BASE_W * scale) / 2
      const oy = (H - BASE_H * scale) / 2
      return { scale, ox, oy }
    }

    // 生成网格站点
    const ST = []
    const grid = []
    const spX = (BASE_W - 2 * MX) / (GRID_COLS - 1)
    const spY = (BASE_H - 2 * MY) / (GRID_ROWS - 1)
    for (let r = 0; r < GRID_ROWS; r++) {
      grid[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        const st = { id: `S${r}_${c}`, bx: MX + c * spX, by: MY + r * spY }
        ST.push(st)
        grid[r][c] = st
      }
    }

    // 标记换乘站
    ;[[1,2],[1,5],[1,8],[1,11],[2,1],[2,4],[2,7],[2,10],[2,13],
      [3,3],[3,6],[3,9],[3,12],[4,1],[4,4],[4,7],[4,10],[4,13],
      [5,2],[5,5],[5,8],[5,11],[6,1],[6,4],[6,7],[6,10],[6,13],
      [7,3],[7,6],[7,9],[7,12]].forEach(([r, c]) => {
      if (grid[r] && grid[r][c]) grid[r][c].tf = true
    })

    function updatePositions() {
      const { scale, ox, oy } = getTransform()
      ST.forEach(s => { s.x = s.bx * scale + ox; s.y = s.by * scale + oy })
    }
    updatePositions()

    const sMap = {}; ST.forEach(s => sMap[s.id] = s)
    const tfStations = ST.filter(s => s.tf)

    // 线路颜色
    const LC = ['#bc1fff','#f900bf','#26c6da','#ffb300','#69f0ae','#ff6e40',
      '#80d8ff','#e040fb','#ff5252','#7c4dff','#00e5ff','#76ff03',
      '#ffd740','#ff4081','#448aff','#b388ff','#ea80fc','#84ffff',
      '#ccff90','#ffe57f','#a7ffeb','#f48fb1','#ce93d8','#90caf9']
    let ci = 0
    const LN = []

    // 9 条横线
    for (let r = 0; r < GRID_ROWS; r++) {
      const p = []; for (let c = 0; c < GRID_COLS; c++) p.push(grid[r][c].id)
      LN.push({ c: LC[ci++ % LC.length], p, tr: [
        { v: Math.random(), s: 0.0004 + Math.random() * 0.0003 },
        { v: 0.3 + Math.random() * 0.4, s: 0.0004 + Math.random() * 0.0003 }
      ]})
    }
    // 7 条竖线（隔列）
    for (let c = 1; c < GRID_COLS; c += 2) {
      const p = []; for (let r = 0; r < GRID_ROWS; r++) p.push(grid[r][c].id)
      LN.push({ c: LC[ci++ % LC.length], p, tr: [
        { v: Math.random(), s: 0.0004 + Math.random() * 0.0004 },
        { v: 0.5 + Math.random() * 0.3, s: 0.0004 + Math.random() * 0.0004 }
      ]})
    }
    // 4 条对角线
    const diags = [
      [[0,0],[1,2],[2,4],[3,6],[4,7],[5,8],[6,10],[7,12],[8,13]],
      [[0,5],[1,5],[2,7],[3,9],[4,10],[5,11],[6,13]],
      [[0,13],[1,11],[2,10],[3,9],[4,7],[5,5],[6,4],[7,3],[8,0]],
      [[0,8],[1,8],[2,7],[3,6],[4,4],[5,2],[6,1]],
    ]
    diags.forEach(d => {
      const p = d.filter(([r, c]) => grid[r] && grid[r][c]).map(([r, c]) => grid[r][c].id)
      if (p.length > 1) LN.push({ c: LC[ci++ % LC.length], p, tr: [
        { v: Math.random(), s: 0.0006 + Math.random() * 0.0004 }
      ]})
    })

    // 脉冲粒子池 — 每条线 4 个信号光点
    const pulses = []
    LN.forEach(ln => {
      for (let i = 0; i < 4; i++) {
        pulses.push({ ln, v: Math.random(), s: 0.0015 + Math.random() * 0.0025 })
      }
    })

    // 换乘连接弧（距离过滤）
    const tfArcs = []
    for (let i = 0; i < tfStations.length; i++) {
      for (let j = i + 1; j < tfStations.length; j++) {
        const dx = tfStations[i].bx - tfStations[j].bx
        const dy = tfStations[i].by - tfStations[j].by
        if (Math.sqrt(dx * dx + dy * dy) < spX * 2.5) tfArcs.push({ a: tfStations[i], b: tfStations[j] })
      }
    }

    // 信号涟漪池
    const ripples = []
    tfStations.forEach(s => {
      ripples.push({ x: s.x, y: s.y, r: 0, maxR: 22 + Math.random() * 10, speed: 0.15 + Math.random() * 0.1 })
    })

    let t = 0

    function posOnPath(path, v) {
      const n = path.length - 1
      const idx = Math.min(Math.floor(v * n), n - 1)
      const lt = (v * n) - idx
      const p1 = sMap[path[idx]], p2 = sMap[path[idx + 1]]
      return { x: p1.x + (p2.x - p1.x) * lt, y: p1.y + (p2.y - p1.y) * lt,
               ax: Math.atan2(p2.y - p1.y, p2.x - p1.x) }
    }

    function draw() {
      t++
      // 响应 resize
      const newW = dCanvas.parentElement.clientWidth
      const newH = dCanvas.parentElement.clientHeight
      if (newW !== W || newH !== H) {
        W = newW; H = newH
        dCanvas.width = W; dCanvas.height = H
        updatePositions()
      }
      const { scale } = getTransform()

      dCtx.clearRect(0, 0, W, H)

      // ① 背景：精细点阵
      const gridStep = 10 * scale
      dCtx.fillStyle = 'rgba(188, 31, 255, 0.035)'
      for (let gx = gridStep; gx < W; gx += gridStep) {
        for (let gy = gridStep; gy < H; gy += gridStep) {
          dCtx.fillRect(gx - 0.35, gy - 0.35, 0.7, 0.7)
        }
      }

      // ② 区域分界线
      dCtx.save()
      dCtx.setLineDash([2, 4])
      dCtx.strokeStyle = 'rgba(188, 31, 255, 0.06)'
      dCtx.lineWidth = 0.5
      for (let r = 1; r < GRID_ROWS; r++) {
        const sy = (MY + r * spY - spY / 2) * scale + (H - BASE_H * scale) / 2
        dCtx.beginPath(); dCtx.moveTo(10, sy); dCtx.lineTo(W - 10, sy); dCtx.stroke()
      }
      dCtx.setLineDash([])
      dCtx.restore()

      // ③ 换乘枢纽间的连通弧
      const arcAlpha = 0.05 + 0.04 * Math.sin(t * 0.015)
      dCtx.save()
      dCtx.setLineDash([3, 5])
      dCtx.lineWidth = 0.7 * scale
      dCtx.strokeStyle = `rgba(255, 255, 255, ${arcAlpha})`
      tfArcs.forEach(({ a, b }) => {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const ox = -(b.y - a.y) * 0.18, oy = (b.x - a.x) * 0.18
        dCtx.beginPath()
        dCtx.moveTo(a.x, a.y)
        dCtx.quadraticCurveTo(mx + ox, my + oy, b.x, b.y)
        dCtx.stroke()
      })
      dCtx.setLineDash([])
      dCtx.restore()

      // ④ 轨道 — 三层渲染
      LN.forEach(ln => {
        const pts = ln.p.map(id => sMap[id])
        for (let layer = 0; layer < 3; layer++) {
          dCtx.beginPath()
          dCtx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) dCtx.lineTo(pts[i].x, pts[i].y)
          dCtx.strokeStyle = ln.c
          if (layer === 0) { dCtx.globalAlpha = 0.07; dCtx.lineWidth = 10 * scale }
          else if (layer === 1) { dCtx.globalAlpha = 0.22; dCtx.lineWidth = 3.5 * scale }
          else { dCtx.globalAlpha = 0.85; dCtx.lineWidth = 1.4 * scale }
          dCtx.lineCap = 'round'; dCtx.lineJoin = 'round'
          dCtx.stroke()
        }
        dCtx.globalAlpha = 1
      })

      // ⑤ 信号涟漪 — 换乘站扩散波
      ripples.forEach((rp, i) => {
        rp.r += rp.speed
        if (rp.r > rp.maxR) { rp.r = 0; rp.maxR = 22 + Math.random() * 10 }
        const rpAlpha = (1 - rp.r / rp.maxR) * 0.18
        const st = tfStations[i]
        dCtx.strokeStyle = `rgba(188, 31, 255, ${rpAlpha})`
        dCtx.lineWidth = 0.8 * scale
        dCtx.beginPath(); dCtx.arc(st.x, st.y, rp.r * scale, 0, Math.PI * 2); dCtx.stroke()
      })

      // ⑥ 脉冲信号粒子
      pulses.forEach(pulse => {
        pulse.v = (pulse.v + pulse.s) % 1
        const pos = posOnPath(pulse.ln.p, pulse.v)
        const r = (1.0 + 0.5 * Math.sin(t * 0.05 + pulse.v * 10)) * scale
        dCtx.save()
        dCtx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 0.04 + pulse.v * 8)
        dCtx.fillStyle = pulse.ln.c
        dCtx.shadowBlur = 5 * scale; dCtx.shadowColor = pulse.ln.c
        dCtx.beginPath(); dCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2); dCtx.fill()
        dCtx.restore()
      })

      // ⑦ 普通站点
      ST.forEach(s => {
        if (s.tf) return
        dCtx.fillStyle = '#0a0a0a'
        dCtx.strokeStyle = 'rgba(255,255,255,0.3)'
        dCtx.lineWidth = 0.8 * scale
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 2.2 * scale, 0, Math.PI * 2)
        dCtx.fill(); dCtx.stroke()
      })

      // ⑧ 换乘枢纽 — 三圆环 + 呼吸辉光 + 内核
      const breathe = 0.4 + 0.3 * Math.sin(t * 0.02)
      tfStations.forEach(s => {
        dCtx.save()
        dCtx.globalAlpha = breathe * 0.25
        dCtx.fillStyle = '#fff'
        dCtx.shadowBlur = 20 * scale; dCtx.shadowColor = '#bc1fff'
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 10 * scale, 0, Math.PI * 2); dCtx.fill()
        dCtx.restore()
        dCtx.strokeStyle = `rgba(255,255,255,${0.25 + breathe * 0.25})`
        dCtx.lineWidth = 1 * scale
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 8 * scale, 0, Math.PI * 2); dCtx.stroke()
        dCtx.strokeStyle = `rgba(188, 31, 255, ${0.35 + breathe * 0.3})`
        dCtx.lineWidth = 0.8 * scale
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 5.5 * scale, 0, Math.PI * 2); dCtx.stroke()
        dCtx.strokeStyle = `rgba(255, 255, 255, ${0.3 + breathe * 0.2})`
        dCtx.lineWidth = 0.6 * scale
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 3.5 * scale, 0, Math.PI * 2); dCtx.stroke()
        dCtx.fillStyle = '#fff'
        dCtx.beginPath(); dCtx.arc(s.x, s.y, 1.8 * scale, 0, Math.PI * 2); dCtx.fill()
      })

      // ⑨ 列车 — 带拖尾的发光胶囊
      LN.forEach(ln => {
        ln.tr.forEach(train => {
          train.v = (train.v + train.s) % 1
          const pos = posOnPath(ln.p, train.v)
          dCtx.save()
          dCtx.translate(pos.x, pos.y)
          dCtx.rotate(pos.ax)
          const grad = dCtx.createLinearGradient(-14 * scale, 0, 6 * scale, 0)
          grad.addColorStop(0, 'transparent')
          grad.addColorStop(0.5, ln.c + '40')
          grad.addColorStop(1, ln.c)
          dCtx.fillStyle = grad
          dCtx.fillRect(-14 * scale, -1.6 * scale, 20 * scale, 3.2 * scale)
          dCtx.fillStyle = '#fff'
          dCtx.shadowBlur = 7 * scale; dCtx.shadowColor = ln.c
          dCtx.beginPath()
          dCtx.roundRect(-4.5 * scale, -1.8 * scale, 9 * scale, 3.6 * scale, 1.8 * scale)
          dCtx.fill()
          dCtx.restore()
        })
      })

      decorFrameId = requestAnimationFrame(draw)
    }
    draw()
  }

  onResize = () => resize()
  window.addEventListener('resize', onResize)
  resize()
  initDecor()
  frameId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  if (frameId) cancelAnimationFrame(frameId)
  if (decorFrameId) cancelAnimationFrame(decorFrameId)
  if (onResize) {
    window.removeEventListener('resize', onResize)
    onResize = null
  }
})
</script>

<template>
  <section class="welcome" aria-label="欢迎页">
    <!-- 主 Canvas：绘制 METRO STUDIO -->
    <canvas ref="canvasRef" class="welcome__canvas" aria-hidden="true"></canvas>
    
    <!-- 装饰性 UI 元素 -->
    <div class="welcome__ui-top" aria-hidden="true">
      <div class="welcome__ui-line"></div>
    </div>

    <div class="welcome__ui-bottom" aria-hidden="true">
    </div>

    <div class="welcome__scanline" aria-hidden="true"></div>
    <div class="welcome__noise" aria-hidden="true"></div>
    
    <div class="welcome__corners" aria-hidden="true">
      <i class="welcome__corner welcome__corner--tl"></i>
      <i class="welcome__corner welcome__corner--tr"></i>
      <i class="welcome__corner welcome__corner--bl"></i>
      <i class="welcome__corner welcome__corner--br"></i>
    </div>

    <main class="welcome__hero">
      <div
        class="welcome__mode-badge"
        :class="isTrial ? 'welcome__mode-badge--free' : 'welcome__mode-badge--paid'"
        aria-label="license mode"
      >
        {{ isTrial ? 'FREE' : 'PAID' }}
      </div>

      <header class="welcome__header">
        <div class="welcome__subtitle">
          <span class="welcome__subtitle-line"></span>
          <span class="welcome__subtitle-id">#{{ welcomeSubtitleId }}</span>
        </div>
        <div class="welcome__title-shell">
          <!-- 隐形标题，用于 SEO 和占位，实际视觉由 Canvas 提供 -->
          <h1 class="welcome__title-ghost"  aria-label="METRO STUDIO"></h1>
        </div>
      </header>

      <div class="welcome__actions-wrap">
        <div class="welcome__section-label">COMMAND CENTER / 导航指令</div>
        <div class="welcome__actions-grid">
          <button class="welcome__action-card welcome__action-card--tutorial" type="button" @click="emit('enter-directly')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <span style="font-size:20px;color:var(--ark-bg-deep);line-height:1;">▥</span>
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">QUICK START</span>
                <strong>快速开始</strong>
              </span>
              <span class="welcome__action-key">NEW</span>
            </div>
          </button>

          <button class="welcome__action-card welcome__action-card--primary" type="button" @click="emit('create-project')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <span style="font-size:20px;color:var(--ark-pink);line-height:1;">▣</span>
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">CREATE PROJECT</span>
                <strong>新建工程</strong>
              </span>
              <span class="welcome__action-key">F1</span>
            </div>
          </button>

          <button class="welcome__action-card" type="button" @click="emit('import-project')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <span style="font-size:20px;color:var(--ark-pink);line-height:1;">▧</span>
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">IMPORT PROJECT</span>
                <strong>导入工程</strong>
              </span>
              <span class="welcome__action-key">F2</span>
            </div>
          </button>

          <button class="welcome__action-card welcome__action-card--ghost" type="button" @click="emit('show-about')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <span style="font-size:20px;color:var(--ark-pink);line-height:1;">▨</span>
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">ABOUT</span>
                <strong>关于</strong>
              </span>
              <span class="welcome__action-key">ESC</span>
            </div>
          </button>

          <a v-if="isTrial" class="welcome__action-card welcome__action-card--buy" :href="PURCHASE_URL" target="_blank" rel="noopener">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box welcome__icon-box--buy">
                <span style="font-size:20px;color:var(--ark-pink);line-height:1;">▤</span>
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">UPGRADE LICENSE</span>
                <strong>购买正式版 ¥49</strong>
              </span>
              <span class="welcome__action-key">PRO</span>
            </div>
          </a>
        </div>

      </div>
    </main>

    <!-- 底部城市卡片横铺 -->
    <div class="welcome__city-cards">
      <button
        v-for="(city, index) in CITIES"
        :key="city.id"
        class="welcome__city-card"
        type="button"
        @click="emit('import-city', city.id)"
      >
        <div
          class="welcome__city-preview"
          :aria-label="`${city.name}地铁线网预览`"
          v-html="CITY_SVGS[city.id]"
        />
        <div class="welcome__city-info">
          <span class="welcome__city-name-en">{{ city.nameEn }}</span>
          <span class="welcome__city-name-zh">{{ city.name }}</span>
        </div>
      </button>
    </div>

    <!-- 地铁换乘网络背景 -->
    <aside class="welcome__decoration" aria-hidden="true">
      <canvas ref="decorCanvasRef" class="welcome__network-canvas"></canvas>
    </aside>
  </section>
</template>

<style scoped>
.welcome {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  background: var(--ark-bg-deep);
  color: var(--ark-text);
  font-family: var(--app-font-mono);
}

.welcome__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Canvas 在文字层下方，但又要在背景上方 */
  z-index: 1; 
  opacity: 0.9;
}

/* 顶部/底部 UI 装饰 */
.welcome__ui-top {
  position: absolute;
  top: 24px;
  left: 40px;
  right: 40px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10;
  pointer-events: none;
}

.welcome__ui-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--ark-pink), transparent);
}

.welcome__ui-tag {
  font-size: 10px;
  color: var(--ark-text-dim);
  letter-spacing: 0.1em;
  padding: 2px 6px;
  border-left: 2px solid var(--ark-purple);
}

.welcome__ui-bottom {
  position: absolute;
  bottom: 24px;
  left: 40px;
  right: 40px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  z-index: 10;
  pointer-events: none;
}

.welcome__ui-ver, .welcome__ui-serial {
  font-size: 10px;
  color: var(--ark-text-dim);
  letter-spacing: 0.05em;
}

.welcome__scanline {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.15;
  background: linear-gradient(to bottom, transparent 0%, transparent 50%, rgba(0, 0, 0, 0.4) 50%, rgba(0, 0, 0, 0.4) 100%);
  background-size: 100% 4px;
  animation: scan 10s linear infinite;
  z-index: 2;
}

.welcome__noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.08;
  mix-blend-mode: screen;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  z-index: 2;
}

/* 边角装饰 */
.welcome__corner {
  position: absolute;
  width: 40px;
  height: 40px;
  border-color: var(--ark-border);
  border-style: solid;
  border-width: 0;
  z-index: 2;
}

.welcome__corner--tl { top: 20px; left: 20px; border-top-width: 1px; border-left-width: 1px; }
.welcome__corner--tr { top: 20px; right: 20px; border-top-width: 1px; border-right-width: 1px; }
.welcome__corner--bl { bottom: 20px; left: 20px; border-bottom-width: 1px; border-left-width: 1px; }
.welcome__corner--br { bottom: 20px; right: 20px; border-bottom-width: 1px; border-right-width: 1px; }

/* Hero 内容 */
.welcome__hero {
  position: relative;
  z-index: 5;
  padding: 0 clamp(40px, 8vw, 120px);
  padding-bottom: 200px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  pointer-events: none;
}

.welcome__header {
  position: absolute;
  top: 15vh;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.welcome__subtitle {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.25em;
  color: var(--ark-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-family: 'Rajdhani', 'Rajdhani-Medium', var(--app-font-mono);
}

.welcome__subtitle-line {
  width: 40px;
  height: 1px;
  background: var(--ark-pink);
}

.welcome__subtitle-id {
  color: var(--ark-pink);
  opacity: 0.6;
}

.welcome__title-ghost {
  font-family: 'Orbitron', 'Orbitron-Regular', var(--app-font-display);
  font-size: clamp(60px, 10vw, 120px);
  color: transparent;
  margin: -10px 0 0 -5px;
  user-select: none;
  letter-spacing: 0.05em;
}

.welcome__title-shell {
  position: relative;
  width: fit-content;
}

.welcome__mode-badge {
  position: absolute;
  right: clamp(20px, 19vw, 120px);
  top: calc(15vh - 60px);
  padding: 4px 14px 6px;
  border: 1px solid rgba(249, 0, 191, 0.75);
  border-radius: 3px;
  font-family: 'Orbitron', 'Orbitron-Black', var(--app-font-display);
  font-size: clamp(22px, 2.4vw, 34px);
  font-weight: 900;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
  color: #ffd9ff;
  background: rgba(39, 6, 45, 0.28);
  transform-origin: center;
  transform: rotate(-14deg) scale(1);
  text-shadow:
    0 0 4px rgba(249, 0, 191, 0.95),
    0 0 12px rgba(188, 31, 255, 0.92),
    0 0 28px rgba(188, 31, 255, 0.82);
  box-shadow:
    0 0 6px rgba(249, 0, 191, 0.55),
    0 0 22px rgba(188, 31, 255, 0.42),
    inset 0 0 10px rgba(249, 0, 191, 0.22);
  animation:
    mode-neon-flicker 2.1s steps(1, end) infinite,
    mode-splash-bounce 0.62s ease-in-out infinite;
}

.welcome__mode-badge--paid {
  border-color: rgba(249, 0, 191, 0.85);
}

.welcome__mode-badge--free {
  border-color: rgba(188, 31, 255, 0.85);
  color: #ffe8ff;
}

.welcome__actions-wrap {
  margin-top: 20vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(600px, 100%);
  pointer-events: auto;
}

.welcome__section-label {
  font-size: 10px;
  color: var(--ark-text-dim);
  letter-spacing: 0.2em;
  margin-bottom: 8px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.welcome__section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ark-grid);
}

.welcome__actions-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  background: var(--ark-grid);
  border: 1px solid var(--ark-border-dim);
}

.welcome__action-card {
  position: relative;
  background: rgba(15, 15, 20, 0.85);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.welcome__card-inner {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  transition: background var(--transition-fast);
}

.welcome__action-card--buy {
  text-decoration: none;
  background: linear-gradient(90deg, rgba(249, 0, 191, 0.08), rgba(188, 31, 255, 0.06));
  border-top: 1px solid rgba(249, 0, 191, 0.3);
}

.welcome__action-card--buy:hover {
  background: linear-gradient(90deg, rgba(249, 0, 191, 0.18), rgba(188, 31, 255, 0.12));
}

.welcome__icon-box--buy {
  border-color: var(--ark-pink);
  color: var(--ark-pink);
}

.welcome__action-card--primary {
  background: rgba(249, 0, 191, 0.04);
}

.welcome__action-card:hover {
  background: rgba(188, 31, 255, 0.12);
}

.welcome__action-card--primary:hover {
  background: rgba(249, 0, 191, 0.12);
}

.welcome__action-card--tutorial {
  background: var(--ark-pink);
}

.welcome__action-card--tutorial:hover {
  background: var(--ark-pink-light);
}

.welcome__action-card--tutorial .welcome__icon-box {
  border-color: rgba(5, 5, 8, 0.22);
  background: rgba(5, 5, 8, 0.16);
}

.welcome__action-card--tutorial .welcome__action-en,
.welcome__action-card--tutorial .welcome__action-copy strong,
.welcome__action-card--tutorial .welcome__action-key {
  color: var(--ark-bg-deep);
}

.welcome__action-card--tutorial .welcome__action-key {
  border-color: rgba(5, 5, 8, 0.28);
  opacity: 1;
}

.welcome__icon-box {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--ark-border-dim);
  color: var(--ark-text-muted);
}

.welcome__action-card:hover .welcome__icon-box {
  border-color: var(--ark-pink);
  color: var(--ark-pink);
}

.welcome__action-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.welcome__action-en {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--ark-text-dim);
  font-weight: 600;
  font-family: 'Rajdhani', 'Rajdhani-SemiBold', var(--app-font-mono);
}

.welcome__action-copy strong {
  font-family: 'Rajdhani', 'Rajdhani-SemiBold', var(--app-font-family);
  font-size: 20px;
  color: var(--ark-text);
  font-weight: 600;
  letter-spacing: 0.2em;
  line-height: 1.1;
  text-shadow: 0 0 1px rgba(255, 255, 255, 0.2);
}

.welcome__action-key {
  font-size: 10px;
  font-family: var(--app-font-mono);
  color: var(--ark-text-dim);
  padding: 2px 6px;
  border: 1px solid var(--ark-border-dim);
  opacity: 0.6;
}

.welcome__city-cards {
  position: absolute;
  bottom: 24px;
  left: clamp(40px, 8vw, 120px);
  right: clamp(40px, 8vw, 120px);
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
  pointer-events: auto;
}

.welcome__city-card {
  position: relative;
  border: 1px solid var(--ark-border-dim);
  background: rgba(10, 10, 12, 0.85);
  padding: 6px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.welcome__city-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(188, 31, 255, 0.03) 100%);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.welcome__city-card:hover {
  border-color: var(--ark-pink);
  box-shadow: 0 0 16px rgba(249, 0, 191, 0.18);
  transform: translateY(-2px);
}

.welcome__city-card:hover::before {
  opacity: 1;
}

.welcome__city-preview {
  width: min(100%, 112px);
  aspect-ratio: 1;
  background: rgba(5, 5, 7, 0.6);
  border: 1px solid rgba(188, 31, 255, 0.15);
  border-radius: 2px;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome__city-preview :deep(svg) {
  width: 100%;
  height: 100%;
}

.welcome__city-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.welcome__city-name-en {
  font-family: 'Rajdhani', 'Rajdhani-SemiBold', var(--app-font-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ark-text-dim);
  font-weight: 600;
  text-transform: uppercase;
}

.welcome__city-name-zh {
  font-family: 'Orbitron', 'Orbitron-Bold', var(--app-font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ark-text);
  text-transform: uppercase;
}

.welcome__footer-stats {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--ark-grid);
}

.welcome__stat-item {
  padding: 8px 12px;
  background: rgba(10, 10, 12, 0.4);
}

.welcome__stat-label {
  font-size: 9px;
  color: var(--ark-text-dim);
  letter-spacing: 0.1em;
  margin-bottom: 2px;
}

.welcome__stat-value {
  font-size: 11px;
  color: var(--ark-purple);
  font-weight: 700;
}

/* 全屏地铁网络背景 */
.welcome__decoration {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0.35;
}

.welcome__network-canvas {
  width: 100%;
  height: 100%;
}

/* 动画 */
@keyframes scan {
  from { background-position-y: 0; }
  to { background-position-y: 100%; }
}

@keyframes mode-splash-bounce {
  0%, 100% {
    transform: rotate(-14deg) scale(0.96);
  }
  50% {
    transform: rotate(-14deg) scale(1.12);
  }
}

@keyframes mode-neon-flicker {
  0%, 18%, 22%, 62%, 67%, 100% {
    opacity: 1;
  }
  20%, 64% {
    opacity: 0.88;
  }
  21%, 65% {
    opacity: 0.42;
  }
  66% {
    opacity: 0.7;
  }
}

@media (max-width: 1024px) {
  .welcome__city-cards {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .welcome__city-name-zh {
    font-size: 16px;
  }
}

@media (max-width: 768px) {
  .welcome__hero {
    padding-left: 20px;
  }
  /* 移动端需要调整 Canvas 字母的大小，可能比较难适配，这里简单处理 */
  .welcome__title-ghost {
      display: none; /* 移动端暂时隐藏大标题 */
  }

  .welcome__title-shell {
    width: 100%;
    min-height: 32px;
  }

  .welcome__mode-badge {
    right: 20px;
    top: calc(15vh + 30px);
    font-size: clamp(18px, 7vw, 26px);
    padding: 3px 10px 5px;
  }

  .welcome__subtitle {
      font-size: 10px;
      letter-spacing: 0.2em;
  }
  .welcome__header {
      height: auto;
      margin-bottom: 40px;
  }
  .welcome__subtitle {
      font-size: 16px;
      margin-bottom: 0;
  }
  .welcome__action-copy strong {
    font-size: 22px;
  }

  .welcome__city-cards {
    grid-template-columns: repeat(3, 1fr);
  }

  .welcome__city-name-zh {
    font-size: 14px;
  }

  .welcome__city-name-en {
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .welcome__city-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
