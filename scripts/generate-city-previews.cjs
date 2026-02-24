/**
 * 生成城市线网预览图 (768x768 PNG)
 * 
 * 用法: node scripts/generate-city-previews.js
 * 
 * 从 Overpass API 获取北京/上海/广州的真实地铁数据，
 * 绘制线网图并保存为 PNG。
 */

const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const SIZE = 768
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'images', 'city-previews')

const CITIES = [
  {
    id: 'beijing',
    name: '北京',
    relationId: 912940,
    center: [116.40, 39.90],
    zoom: 10,
    bbox: [115.7, 39.4, 117.1, 40.5],
  },
  {
    id: 'shanghai',
    name: '上海',
    relationId: 913067,
    center: [121.47, 31.23],
    zoom: 10,
    bbox: [120.8, 30.7, 122.1, 31.8],
  },
  {
    id: 'guangzhou',
    name: '广州',
    relationId: 3287346,
    center: [113.26, 23.13],
    zoom: 10,
    bbox: [112.7, 22.5, 114.0, 23.8],
  },
]

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// ── Overpass 查询 ──

async function postOverpass(query, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        console.log(`  [${attempt + 1}/${retries}] 请求 ${endpoint.split('/')[2]}...`)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) {
          console.log(`  HTTP ${res.status}, 换端点...`)
          continue
        }

        const data = await res.json()
        if (!data?.elements) {
          console.log('  无效响应, 换端点...')
          continue
        }

        return data
      } catch (err) {
        console.log(`  失败: ${err.message}`)
      }
    }

    if (attempt < retries - 1) {
      const wait = (attempt + 1) * 5000
      console.log(`  等待 ${wait / 1000}s 后重试...`)
      await new Promise(r => setTimeout(r, wait))
    }
  }

  throw new Error('所有 Overpass 端点均失败')
}

function buildMetroQuery(bbox) {
  const bb = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`
  return `
[out:json][timeout:90];
(
  relation(${bb})["type"="route"]["route"~"subway|light_rail"];
);
out body;
>;
out skel qt;
`.trim()
}

// ── 数据解析 ──

function parseMetroData(elements) {
  const nodes = new Map()
  const ways = new Map()
  const relations = []

  for (const el of elements) {
    if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} })
    } else if (el.type === 'way' && Array.isArray(el.nodes)) {
      ways.set(el.id, { nodeRefs: el.nodes, tags: el.tags || {} })
    } else if (el.type === 'relation') {
      relations.push(el)
    }
  }

  // 提取线路
  const lines = []
  for (const rel of relations) {
    const tags = rel.tags || {}
    if (tags.type !== 'route') continue
    const route = tags.route || tags.construction || ''
    if (!['subway', 'light_rail'].includes(route) && !tags['construction:route']) continue

    const color = tags.colour || tags.color || null
    const name = tags['name:zh'] || tags.name || tags.ref || '未知线路'

    const wayMembers = (rel.members || []).filter(m => m.type === 'way')
    const stopMembers = (rel.members || []).filter(m =>
      m.type === 'node' && /stop|platform|station/i.test(m.role || '')
    )

    lines.push({ name, color, wayMembers, stopMembers, tags })
  }

  return { nodes, ways, lines }
}

// ── 坐标转换 ──

function createProjection(bbox, size, padding = 40) {
  const lonMin = bbox[0], latMin = bbox[1], lonMax = bbox[2], latMax = bbox[3]
  const drawSize = size - padding * 2

  // 墨卡托投影
  function latToY(lat) {
    return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))
  }

  const yMin = latToY(latMin)
  const yMax = latToY(latMax)
  const lonRange = lonMax - lonMin
  const yRange = yMax - yMin

  // 保持比例
  const scaleX = drawSize / lonRange
  const scaleY = drawSize / yRange
  const scale = Math.min(scaleX, scaleY)

  const offsetX = padding + (drawSize - lonRange * scale) / 2
  const offsetY = padding + (drawSize - yRange * scale) / 2

  return function project(lon, lat) {
    const x = offsetX + (lon - lonMin) * scale
    const y = offsetY + (yMax - latToY(lat)) * scale
    return [x, y]
  }
}

// ── 合并同名线路 ──

function mergeLinesByName(lines) {
  const map = new Map()
  for (const line of lines) {
    // 提取线路核心名（去掉方向后缀）
    const baseName = line.name.replace(/[（(].*[）)]/, '').replace(/[-—].*$/, '').trim()
    if (!map.has(baseName)) {
      map.set(baseName, { name: baseName, color: line.color, wayMembers: [], stopMembers: [] })
    }
    const merged = map.get(baseName)
    if (!merged.color && line.color) merged.color = line.color
    merged.wayMembers.push(...line.wayMembers)
    merged.stopMembers.push(...line.stopMembers)
  }
  return [...map.values()]
}

// ── 默认颜色 ──

const DEFAULT_COLORS = [
  '#C8102E', '#004098', '#D9A520', '#8E4585', '#007F3E',
  '#E60012', '#009944', '#B41E8D', '#0099CC', '#FF9F35',
  '#A059AD', '#00A651', '#EB9E00', '#D400D9', '#FFD100',
]

// ── 绘制 ──

function drawCity(city, metroData) {
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')

  // 背景
  ctx.fillStyle = '#050507'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // 微弱网格
  ctx.strokeStyle = 'rgba(188, 31, 255, 0.04)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= SIZE; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke()
  }

  const { nodes, ways, lines: rawLines } = metroData
  const lines = mergeLinesByName(rawLines)
  const project = createProjection(city.bbox, SIZE, 50)

  console.log(`  ${city.name}: ${lines.length} 条线路`)

  // 收集换乘站
  const stationLineCount = new Map()
  for (const line of lines) {
    for (const m of line.stopMembers) {
      stationLineCount.set(m.ref, (stationLineCount.get(m.ref) || 0) + 1)
    }
  }

  // 绘制线路
  lines.forEach((line, idx) => {
    const color = line.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]

    // 发光底层
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.globalAlpha = 0.15
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const wm of line.wayMembers) {
      const way = ways.get(wm.ref)
      if (!way) continue
      const coords = way.nodeRefs.map(nid => nodes.get(nid)).filter(Boolean)
      if (coords.length < 2) continue

      ctx.beginPath()
      const [sx, sy] = project(coords[0].lon, coords[0].lat)
      ctx.moveTo(sx, sy)
      for (let i = 1; i < coords.length; i++) {
        const [x, y] = project(coords[i].lon, coords[i].lat)
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 实线层
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.85

    for (const wm of line.wayMembers) {
      const way = ways.get(wm.ref)
      if (!way) continue
      const coords = way.nodeRefs.map(nid => nodes.get(nid)).filter(Boolean)
      if (coords.length < 2) continue

      ctx.beginPath()
      const [sx, sy] = project(coords[0].lon, coords[0].lat)
      ctx.moveTo(sx, sy)
      for (let i = 1; i < coords.length; i++) {
        const [x, y] = project(coords[i].lon, coords[i].lat)
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    ctx.globalAlpha = 1.0
  })

  // 绘制站点
  const drawnStations = new Set()
  for (const line of lines) {
    for (const m of line.stopMembers) {
      if (drawnStations.has(m.ref)) continue
      drawnStations.add(m.ref)

      const node = nodes.get(m.ref)
      if (!node) continue

      const [x, y] = project(node.lon, node.lat)
      const isTransfer = (stationLineCount.get(m.ref) || 0) > 1

      if (isTransfer) {
        // 换乘站：大白圆 + 光晕
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      } else {
        // 普通站：小白点
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.beginPath()
        ctx.arc(x, y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // 边角装饰
  ctx.strokeStyle = 'rgba(188, 31, 255, 0.3)'
  ctx.lineWidth = 1
  const cornerSize = 20
  // 左上
  ctx.beginPath(); ctx.moveTo(10, 10 + cornerSize); ctx.lineTo(10, 10); ctx.lineTo(10 + cornerSize, 10); ctx.stroke()
  // 右上
  ctx.beginPath(); ctx.moveTo(SIZE - 10 - cornerSize, 10); ctx.lineTo(SIZE - 10, 10); ctx.lineTo(SIZE - 10, 10 + cornerSize); ctx.stroke()
  // 左下
  ctx.beginPath(); ctx.moveTo(10, SIZE - 10 - cornerSize); ctx.lineTo(10, SIZE - 10); ctx.lineTo(10 + cornerSize, SIZE - 10); ctx.stroke()
  // 右下
  ctx.beginPath(); ctx.moveTo(SIZE - 10 - cornerSize, SIZE - 10); ctx.lineTo(SIZE - 10, SIZE - 10); ctx.lineTo(SIZE - 10, SIZE - 10 - cornerSize); ctx.stroke()

  return canvas
}

// ── 主流程 ──

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  for (const city of CITIES) {
    console.log(`\n=== ${city.name} (${city.id}) ===`)
    console.log('  正在查询 Overpass API...')

    const query = buildMetroQuery(city.bbox)
    const data = await postOverpass(query)
    console.log(`  获取到 ${data.elements.length} 个元素`)

    const metroData = parseMetroData(data.elements)
    console.log(`  解析到 ${metroData.lines.length} 条原始线路, ${metroData.nodes.size} 个节点, ${metroData.ways.size} 条路径`)

    const canvas = drawCity(city, metroData)
    const outPath = path.join(OUTPUT_DIR, `${city.id}.png`)
    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(outPath, buffer)
    console.log(`  已保存: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`)

    // 请求间隔，避免被限流
    if (city !== CITIES[CITIES.length - 1]) {
      console.log('  等待 3s...')
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  console.log('\n全部完成!')
}

main().catch(err => {
  console.error('生成失败:', err)
  process.exit(1)
})
