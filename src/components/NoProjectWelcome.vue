<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import IconBase from './IconBase.vue'
import { isTrial } from '../composables/useLicense'

const emit = defineEmits(['create-project', 'import-project', 'enter-directly'])

const canvasRef = ref(null)
const decorCanvasRef = ref(null)
let frameId = 0
let decorFrameId = 0
let onResize = null

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

  // --- 右侧装饰动画逻辑：迷你地铁演示图 ---
  const initDecor = () => {
    const dCanvas = decorCanvasRef.value
    if (!dCanvas) return
    const dCtx = dCanvas.getContext('2d')
    const size = 300
    dCanvas.width = size
    dCanvas.height = size

    // 工业化地铁网络拓扑 (45度/90度法则)
    const STATIONS = [
      { id: 'N1', x: 60, y: 60, code: 'N-01' },
      { id: 'N2', x: 150, y: 60, code: 'N-02' },
      { id: 'N3', x: 240, y: 60, code: 'N-03' },
      { id: 'C1', x: 150, y: 150, code: 'CTR', transfer: true },
      { id: 'S1', x: 60, y: 240, code: 'S-01' },
      { id: 'S2', x: 150, y: 240, code: 'S-02' },
      { id: 'S3', x: 240, y: 240, code: 'S-03' },
      { id: 'E1', x: 240, y: 150, code: 'E-01' }
    ]

    const LINES = [
      { id: 'L1', color: '#bc1fff', path: ['N1', 'N2', 'N3', 'E1', 'S3', 'S2', 'S1'], trains: [{ p: 0, s: 0.0008 }, { p: 0.5, s: 0.0008 }] },
      { id: 'L2', color: '#f900bf', path: ['N2', 'C1', 'S2'], trains: [{ p: 0.2, s: 0.0015 }] },
      { id: 'L3', color: '#26c6da', path: ['S1', 'C1', 'E1'], trains: [{ p: 0.7, s: 0.0012 }] }
    ]

    function getStation(id) { return STATIONS.find(s => s.id === id) }

    function drawDecor() {
      dCtx.clearRect(0, 0, size, size)
      
      // 背景网格与边框装饰
      dCtx.strokeStyle = 'rgba(188, 31, 255, 0.05)'
      dCtx.lineWidth = 0.5
      for(let i=0; i<=size; i+=30) {
        dCtx.beginPath(); dCtx.moveTo(i, 0); dCtx.lineTo(i, size); dCtx.stroke()
        dCtx.beginPath(); dCtx.moveTo(0, i); dCtx.lineTo(size, i); dCtx.stroke()
      }

      // 1. 绘制轨道 (双层发光)
      LINES.forEach(line => {
        dCtx.beginPath()
        const start = getStation(line.path[0])
        dCtx.moveTo(start.x, start.y)
        for (let i = 1; i < line.path.length; i++) {
          const p = getStation(line.path[i])
          dCtx.lineTo(p.x, p.y)
        }
        dCtx.setLineDash([])
        dCtx.strokeStyle = line.color
        dCtx.globalAlpha = 0.2; dCtx.lineWidth = 6; dCtx.stroke()
        dCtx.globalAlpha = 1.0; dCtx.lineWidth = 1.5; dCtx.stroke()
      })

      // 2. 绘制站点与编号
      STATIONS.forEach(s => {
        dCtx.fillStyle = '#050505'
        dCtx.strokeStyle = s.transfer ? '#fff' : '#555'
        dCtx.lineWidth = s.transfer ? 2 : 1
        dCtx.beginPath()
        dCtx.arc(s.x, s.y, s.transfer ? 5 : 2.5, 0, Math.PI * 2)
        dCtx.fill(); dCtx.stroke()
        
        dCtx.fillStyle = s.transfer ? '#fff' : 'rgba(255,255,255,0.4)'
        dCtx.font = '7px JetBrains Mono'
        dCtx.fillText(s.code, s.x + 8, s.y + 3)
      })

      // 3. 运行列车 (胶囊体)
      LINES.forEach(line => {
        line.trains.forEach(train => {
          train.p = (train.p + train.s) % 1
          const segmentCount = line.path.length - 1
          const segmentIdx = Math.floor(train.p * segmentCount)
          const segmentT = (train.p * segmentCount) % 1
          const p1 = getStation(line.path[segmentIdx])
          const p2 = getStation(line.path[segmentIdx + 1])
          const tx = p1.x + (p2.x - p1.x) * segmentT
          const ty = p1.y + (p2.y - p1.y) * segmentT
          
          dCtx.save()
          dCtx.translate(tx, ty)
          dCtx.rotate(Math.atan2(p2.y - p1.y, p2.x - p1.x))
          dCtx.fillStyle = '#fff'
          dCtx.shadowBlur = 10; dCtx.shadowColor = '#fff'
          dCtx.fillRect(-4, -1.5, 8, 3)
          dCtx.restore()
        })
      })

      // 4. 实时数据装饰 (右下角)
      const now = Date.now()
      dCtx.fillStyle = 'rgba(188, 31, 255, 0.6)'
      dCtx.font = '9px JetBrains Mono'
      dCtx.fillText(`SYS_MS: ${now % 100000}`, 10, size - 25)
      dCtx.fillText(`MAP_HASH: 0x${Math.floor(now/1000).toString(16).toUpperCase()}`, 10, size - 10)
      dCtx.fillText(`NETWORK: ONLINE`, size - 90, size - 10)
      
      // 5. 绘制十字准心 (工业感)
      dCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      dCtx.lineWidth = 1
      const cp = { x: 150, y: 150 } // 中心准心
      dCtx.beginPath()
      dCtx.moveTo(cp.x - 10, cp.y); dCtx.lineTo(cp.x + 10, cp.y)
      dCtx.moveTo(cp.x, cp.y - 10); dCtx.lineTo(cp.x, cp.y + 10)
      dCtx.stroke()

      decorFrameId = requestAnimationFrame(drawDecor)
    }
    drawDecor()
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
      <div class="welcome__ui-tag">SYSTEM STATUS: NETWORK BUILDING</div>
      <div class="welcome__ui-tag">REGION: 02-B14 / L-4</div>
    </div>

    <div class="welcome__ui-bottom" aria-hidden="true">
      <div class="welcome__ui-ver">PRTS-v2.0.4-LOCKED</div>
      <div class="welcome__ui-serial">SN-0941-RMAP-{{ new Date().getFullYear() }}</div>
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
      <header class="welcome__header">
        <div class="welcome__subtitle">
          <span class="welcome__subtitle-line"></span>
          RAILWAY MAP DESIGN SYSTEM / VERSION 2.0
          <span class="welcome__subtitle-id">#{{ Math.random().toString(16).slice(2, 8).toUpperCase() }}</span>
        </div>
        <div class="welcome__title-shell">
          <!-- 隐形标题，用于 SEO 和占位，实际视觉由 Canvas 提供 -->
          <h1 class="welcome__title-ghost" aria-label="METRO STUDIO">METRO STUDIO</h1>
          <div
            class="welcome__mode-badge"
            :class="isTrial ? 'welcome__mode-badge--free' : 'welcome__mode-badge--paid'"
            aria-label="license mode"
          >
            {{ isTrial ? 'FREE' : 'PAID' }}
          </div>
        </div>
      </header>

      <div class="welcome__actions-wrap">
        <div class="welcome__section-label">COMMAND CENTER / 导航指令</div>
        <div class="welcome__actions-grid">
          <button class="welcome__action-card welcome__action-card--primary" type="button" @click="emit('create-project')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <IconBase name="plus-circle" :size="20" />
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
                <IconBase name="upload" :size="20" />
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">IMPORT PROJECT</span>
                <strong>导入工程</strong>
              </span>
              <span class="welcome__action-key">F2</span>
            </div>
          </button>

          <button class="welcome__action-card welcome__action-card--ghost" type="button" @click="emit('enter-directly')">
            <div class="welcome__card-inner">
              <span class="welcome__icon-box">
                <IconBase name="zap" :size="20" />
              </span>
              <span class="welcome__action-copy">
                <span class="welcome__action-en">QUICK START</span>
                <strong>直接进入</strong>
              </span>
              <span class="welcome__action-key">ESC</span>
            </div>
          </button>
        </div>

        <div class="welcome__footer-stats">
          <div class="welcome__stat-item">
            <div class="welcome__stat-label">GEO-BUFFER</div>
            <div class="welcome__stat-value">READY</div>
          </div>
          <div class="welcome__stat-item">
            <div class="welcome__stat-label">MAP-TILES</div>
            <div class="welcome__stat-value">OSM/PBF</div>
          </div>
          <div class="welcome__stat-item">
            <div class="welcome__stat-label">AXIS-X/Y</div>
            <div class="welcome__stat-value">AUTO</div>
          </div>
        </div>
      </div>
    </main>

    <!-- 右侧装饰组件：自我完善网络 -->
    <aside class="welcome__decoration" aria-hidden="true">
      <div class="welcome__network-container">
        <canvas ref="decorCanvasRef" class="welcome__network-canvas"></canvas>
        <div class="welcome__network-ring"></div>
        <div class="welcome__network-label">SELF-OPTIMIZING NETWORK</div>
      </div>
      <div class="welcome__side-strip">
        <div v-for="i in 5" :key="i" class="welcome__side-block"></div>
      </div>
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  pointer-events: none;
}

.welcome__header {
  position: absolute;
  top: 15vh;
  left: clamp(40px, 8vw, 120px);
  right: clamp(40px, 8vw, 120px);
  display: flex;
  flex-direction: column;
}

.welcome__subtitle {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--ark-text-muted);
  font-weight: 600;
  text-transform: uppercase;
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
  font-family: var(--app-font-display);
  font-size: clamp(60px, 10vw, 120px);
  color: transparent;
  margin: -10px 0 0 -5px;
  user-select: none;
}

.welcome__title-shell {
  position: relative;
  width: fit-content;
}

.welcome__mode-badge {
  position: absolute;
  right: -24px;
  bottom: -18px;
  padding: 4px 14px 6px;
  border: 1px solid rgba(249, 0, 191, 0.75);
  border-radius: 3px;
  font-family: var(--app-font-display);
  font-size: clamp(22px, 2.4vw, 34px);
  font-weight: 900;
  letter-spacing: 0.08em;
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
  gap: 12px;
  width: min(600px, 100%);
  pointer-events: auto;
}

.welcome__section-label {
  font-size: 10px;
  color: var(--ark-text-dim);
  letter-spacing: 0.2em;
  margin-bottom: 8px;
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

.welcome__action-card--primary {
  background: rgba(249, 0, 191, 0.04);
}

.welcome__action-card:hover {
  background: rgba(188, 31, 255, 0.12);
}

.welcome__action-card--primary:hover {
  background: rgba(249, 0, 191, 0.12);
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
  letter-spacing: 0.15em;
  color: var(--ark-text-dim);
  font-weight: 700;
}

.welcome__action-copy strong {
  font-family: var(--app-font-family);
  font-size: 20px;
  color: var(--ark-text);
  font-weight: 600;
  letter-spacing: 0.18em; /* 增强指令感 */
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

/* 右侧装饰 */
.welcome__decoration {
  position: absolute;
  right: clamp(40px, 8vw, 140px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 40px;
  pointer-events: none;
  z-index: 5;
}

.welcome__network-container {
  position: relative;
  width: 300px;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome__network-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.8;
}

.welcome__network-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 1px dashed var(--ark-border-dim);
  border-radius: 50% !important;
  animation: rotate 60s linear infinite;
}

.welcome__network-label {
  position: absolute;
  bottom: -30px;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ark-purple);
  text-transform: uppercase;
}

.welcome__side-strip {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.welcome__side-block {
  width: 4px;
  height: 24px;
  background: var(--ark-border-dim);
}

.welcome__side-block:nth-child(2),
.welcome__side-block:nth-child(4) {
  background: var(--ark-pink);
  height: 40px;
}

/* 动画 */
@keyframes scan {
  from { background-position-y: 0; }
  to { background-position-y: 100%; }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  .welcome__decoration {
    display: none;
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
    right: 0;
    bottom: 2px;
    font-size: clamp(18px, 7vw, 26px);
    padding: 3px 10px 5px;
  }

  .welcome__subtitle {
      font-size: 10px; /* 减小移动端副标题字号以适应更长的标题 */
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
}
</style>
