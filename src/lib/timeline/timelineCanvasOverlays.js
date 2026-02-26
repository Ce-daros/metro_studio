/**
 * Overlay rendering functions for timeline canvas.
 * Renders year, stats, event banners, scale bar, branding, line info, and loading screen.
 */

import { metersPerPixel } from './timelineTileRenderer'
import { easeOutCubic, easeOutBack } from './timelineCanvasEasing'
import { roundRect, uiScale, measurePillWidth, drawStatPill } from './timelineCanvasGeometry'
import { FONT_FAMILY } from './timelineCanvasFont'

// ─── Overlay: Year + Stats block (bottom-left, reference layout) ─

/**
 * Render year + stats overlay at bottom-left.
 *
 * opts.stats: { km, stations, lines }
 * opts.yearTransition: 0..1 — year change animation (0 = just changed, 1 = settled)
 * opts.prevYear: previous year label (for crossfade)
 * opts.displayStats: { km, stations } — animated (counting-up) display values
 */
export function renderOverlayYear(ctx, year, alpha, width, height, opts = {}) {
  if (alpha <= 0 || year == null) return
  const { yearTransition = 1, prevYear } = opts
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  // ── Measure year text ──
  const yearFontSize = 120 * s
  const yearFont = `900 ${yearFontSize}px ${FONT_FAMILY}`
  ctx.font = yearFont
  const yearStr = String(year)
  const yearTextW = ctx.measureText(yearStr).width

  // ── Layout: dark rounded rect containing only year ──
  const padH = 28 * s
  const padV = 18 * s
  const rectW = yearTextW + padH * 2
  const rectH = yearFontSize * 1.1 + padV * 2
  const rectX = 48 * s
  const rectY = height - rectH - 48 * s
  const cornerR = 14 * s

  // Semi-transparent dark background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  roundRect(ctx, rectX, rectY, rectW, rectH, cornerR)
  ctx.fill()

  // ── Year text with crossfade transition ──
  const yearCenterY = rectY + rectH / 2
  const yearX = rectX + padH

  if (yearTransition < 1 && prevYear != null) {
    // Outgoing year: slide up + fade out
    const outT = easeOutCubic(yearTransition)
    const outAlpha = 1 - outT
    const outOffsetY = -yearFontSize * 0.3 * outT
    ctx.save()
    ctx.globalAlpha = alpha * outAlpha
    ctx.fillStyle = '#ffffff'
    ctx.font = yearFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(prevYear), yearX, yearCenterY + outOffsetY)
    ctx.restore()

    // Incoming year: slide up from below + fade in
    const inAlpha = outT
    const inOffsetY = yearFontSize * 0.3 * (1 - outT)
    ctx.save()
    ctx.globalAlpha = alpha * inAlpha
    ctx.fillStyle = '#ffffff'
    ctx.font = yearFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(yearStr, yearX, yearCenterY + inOffsetY)
    ctx.restore()
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.font = yearFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(yearStr, yearX, yearCenterY)
  }

  ctx.restore()
}

// ─── Overlay: Stats pills (left side, below year) ───────────────

export function renderOverlayStats(ctx, stats, alpha, width, height) {
  if (alpha <= 0 || !stats) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  const baseX = 48 * s
  const baseY = height * 0.52 + 80 * s  // below the large year

  const pillH = 36 * s
  const pillR = pillH / 2
  const gap = 12 * s

  // KM pill
  const kmText = `${stats.km.toFixed(1)} KM`
  const stText = `${stats.stations} ST.`

  drawStatPill(ctx, baseX, baseY, pillH, pillR, s, kmText)
  const kmWidth = measurePillWidth(ctx, kmText, s, pillH)
  drawStatPill(ctx, baseX + kmWidth + gap, baseY, pillH, pillR, s, stText)

  ctx.restore()
}

// ─── Overlay: Event banner (top-left) ───────────────────────────

export function renderOverlayEvent(ctx, text, lineColor, alpha, width, height, opts = {}) {
  if (alpha <= 0) return
  const { nameZh, phase, deltaKm, slideT = 1, intervalFrom, intervalTo } = opts
  const s = uiScale(width, height)

  if (!text && !nameZh) return

  const CJK_FONT = FONT_FAMILY
  const padH = 28 * s
  const padV = 18 * s
  const elemGap = 12 * s

  // ── Capsule: short name (digits or first char) ──
  const capsuleFontSize = 32 * s
  const capsuleFont = `700 ${capsuleFontSize}px ${CJK_FONT}`
  const capsuleH = 44 * s
  const capsulePadH = 16 * s
  const capsuleR = 10 * s

  let shortName = nameZh || text
  const digitMatch = shortName.match(/^\d+/)
  shortName = digitMatch ? digitMatch[0] : [...shortName][0]

  ctx.font = capsuleFont
  const capsuleW = ctx.measureText(shortName).width + capsulePadH * 2

  // ── Build inline text segments: "一期 段店⇄齐鲁软件园 开通运营" ──
  const textFont = `600 ${30 * s}px ${CJK_FONT}`
  ctx.font = textFont

  let inlineText = ''
  if (phase) inlineText += phase + ' '
  if (intervalFrom && intervalTo) {
    inlineText += `${intervalFrom}⇄${intervalTo} `
  }
  inlineText += '开通运营'

  const inlineW = ctx.measureText(inlineText).width

  // ── Banner size (single line) ──
  const contentW = capsuleW + elemGap + inlineW
  const bannerW = contentW + padH * 2
  const bannerH = capsuleH + padV * 2

  // Slide-in animation
  const easedSlide = easeOutCubic(Math.max(0, Math.min(1, slideT)))
  const slideOffset = -(bannerW + 24 * s) * (1 - easedSlide)

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * easedSlide))

  const bannerX = 24 * s + slideOffset
  const bannerY = 24 * s
  const centerY = bannerY + bannerH / 2

  // Dark background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)'
  roundRect(ctx, bannerX, bannerY, bannerW, bannerH, 14 * s)
  ctx.fill()

  // ── Color capsule ──
  const capsuleX = bannerX + padH
  ctx.fillStyle = lineColor || '#2563EB'
  roundRect(ctx, capsuleX, centerY - capsuleH / 2, capsuleW, capsuleH, capsuleR)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = capsuleFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(shortName, capsuleX + capsuleW / 2, centerY)

  // ── Inline text ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = textFont
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(inlineText, capsuleX + capsuleW + elemGap, centerY)

  ctx.restore()
}

// ─── Overlay: Scale bar (bottom-left) ────────────────────────────

export function renderOverlayScaleBar(ctx, camera, alpha, width, height) {
  if (alpha <= 0) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.7

  const mpp = metersPerPixel(camera.centerLat, camera.zoom)
  // Choose a nice round distance
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  let targetMeters = 1000
  for (const c of candidates) {
    const px = c / mpp
    if (px >= 40 * s && px <= 160 * s) {
      targetMeters = c
      break
    }
  }
  const barPx = targetMeters / mpp
  const label = targetMeters >= 1000 ? `${targetMeters / 1000} KM` : `${targetMeters} M`

  const x = 48 * s
  const y = height - 36 * s
  const barH = 3 * s

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, barPx, barH)
  // End ticks
  ctx.fillRect(x, y - 4 * s, 1.5 * s, barH + 8 * s)
  ctx.fillRect(x + barPx - 1.5 * s, y - 4 * s, 1.5 * s, barH + 8 * s)

  ctx.fillStyle = '#ffffff'
  ctx.font = `500 ${10 * s}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x + barPx / 2, y - 5 * s)

  ctx.restore()
}

// ─── Overlay: Branding (bottom-right, minimal) ──────────────────

export function renderOverlayBranding(ctx, projectName, author, alpha, width, height) {
  if (alpha <= 0) return
  const s = uiScale(width, height)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.5

  const x = width - 48 * s
  const y = height - 16 * s

  // OSM attribution only — no logo
  ctx.fillStyle = '#ffffff'
  ctx.font = `400 ${9 * s}px ${FONT_FAMILY}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('© OpenStreetMap contributors', x, y)

  ctx.restore()
}

// ─── Overlay: Line legend (bottom-left, above year block) ────────

export function renderOverlayLineInfo(ctx, yearPlan, stats, alpha, width, height, opts = {}) {
  if (alpha <= 0) return
  const { cumulativeLineStats, lineAppearProgress, displayLineStats, displayStats } = opts
  const lineEntries = cumulativeLineStats || []
  if (!lineEntries.length) return

  const s = uiScale(width, height)

  // ── Stats pills (between line cards and year block) ──
  const pillFontSize = 32 * s
  const pillFont = `700 ${pillFontSize}px ${FONT_FAMILY}`
  const pillH = 32 * s
  const pillR = pillH / 2
  const pillGap = 10 * s
  const showStats = displayStats || stats
  let kmPillW = 0, stPillW = 0, kmText = '', stText = ''
  const hasPills = !!showStats
  if (showStats) {
    kmText = `${showStats.km.toFixed(1)} KM`
    stText = `${showStats.stations} ST.`
    ctx.font = pillFont
    kmPillW = ctx.measureText(kmText).width + pillH
    stPillW = ctx.measureText(stText).width + pillH
  }

  // Year block geometry
  const yearBlockH = 120 * s * 1.1 + 36 * s
  const yearBlockBottom = height - 48 * s
  const yearBlockTop = yearBlockBottom - yearBlockH

  const gapBetween = 20 * s
  const pillsRowH = hasPills ? pillH : 0
  const pillsRowTop = yearBlockTop - gapBetween - pillsRowH
  const baseX = 48 * s
  const cornerR = 14 * s

  // ── Determine layout: up to 6 columns, shrink 20% when >10 lines ──
  const topMargin = 24 * s
  const availableH = pillsRowTop - gapBetween - topMargin

  // Base dimensions
  const BASE_CARD_H = 88 * s
  const BASE_CARD_PAD_H = 22 * s
  const BASE_CARD_GAP = 8 * s
  const BASE_NAME_FONT_SIZE = 44 * s
  const BASE_KM_FONT_SIZE = 18 * s

  const count = lineEntries.length
  let cardScale = count > 10 ? 0.8 : 1

  // Determine columns: fill vertically first, add columns as needed (max 6)
  let columns = 1
  for (let c = 1; c <= 6; c++) {
    const perCol = Math.ceil(count / c)
    const colH = perCol * (BASE_CARD_H * cardScale + BASE_CARD_GAP * cardScale) - BASE_CARD_GAP * cardScale
    if (colH <= availableH) { columns = c; break }
    columns = c
  }
  // If still overflows at 6 columns, shrink further
  const perCol = Math.ceil(count / columns)
  const neededH = perCol * (BASE_CARD_H * cardScale + BASE_CARD_GAP * cardScale) - BASE_CARD_GAP * cardScale
  if (neededH > availableH) {
    cardScale *= availableH / neededH
  }

  const cardH = BASE_CARD_H * cardScale
  const cardPadH = BASE_CARD_PAD_H * cardScale
  const cardGap = BASE_CARD_GAP * cardScale
  const nameFontSize = BASE_NAME_FONT_SIZE * cardScale
  const kmFontSize = BASE_KM_FONT_SIZE * cardScale
  const scaledCornerR = cornerR * cardScale

  const nameFont = `700 ${nameFontSize}px ${FONT_FAMILY}`
  const kmFont = `600 ${kmFontSize}px ${FONT_FAMILY}`

  // Build card data with short display names (always digits or first char)
  const cards = []
  let maxCardW = 0
  for (const entry of lineEntries) {
    const digitMatch = entry.name.match(/^\d+/)
    const displayName = digitMatch ? digitMatch[0] : [...entry.name][0]
    ctx.font = nameFont
    const textW = ctx.measureText(displayName).width
    const kmStr = `${entry.km.toFixed(1)}`
    ctx.font = kmFont
    const kmTextW = ctx.measureText(kmStr).width
    const cardW = Math.max(textW, kmTextW) + cardPadH * 2
    if (cardW > maxCardW) maxCardW = cardW
    cards.push({ ...entry, displayName, kmStr, cardW })
  }
  // Uniform width
  for (const card of cards) card.cardW = maxCardW

  // Compute layout
  const rowsPerCol = Math.ceil(cards.length / columns)
  const totalCardsH = rowsPerCol * (cardH + cardGap) - cardGap
  const baseY = pillsRowTop - gapBetween - totalCardsH - 12 * s

  const colGap = 6 * s

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

  // ── Draw stats pills ──
  if (hasPills) {
    const pillBaseY = pillsRowTop

    const pillsTotalW = kmPillW + pillGap + stPillW
    const bgPadH = 12 * s
    const bgPadV = 8 * s
    const bgX = baseX
    const bgY = pillBaseY - bgPadV
    const bgW = pillsTotalW + bgPadH * 2
    const bgH = pillH + bgPadV * 2
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    roundRect(ctx, bgX, bgY, bgW, bgH, 14 * s)
    ctx.fill()

    const pillBaseX = baseX + bgPadH

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1.2 * s
    roundRect(ctx, pillBaseX, pillBaseY, kmPillW, pillH, pillR)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = pillFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(kmText, pillBaseX + kmPillW / 2, pillBaseY + pillH / 2)

    const stPillX = pillBaseX + kmPillW + pillGap
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1.2 * s
    roundRect(ctx, stPillX, pillBaseY, stPillW, pillH, pillR)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = pillFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(stText, stPillX + stPillW / 2, pillBaseY + pillH / 2)
  }

  // ── Draw line cards ──
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const col = Math.floor(i / rowsPerCol)
    const row = i - col * rowsPerCol
    const cardY = baseY + row * (cardH + cardGap)
    const cardX = baseX + col * (maxCardW + colGap)

    // Per-card slide-in animation
    let progress = 1
    if (lineAppearProgress && lineAppearProgress.has(card.lineId)) {
      progress = lineAppearProgress.get(card.lineId)
    }

    const easedProgress = easeOutBack(progress)
    const translateX = -(1 - progress) * (card.cardW + cardPadH)
    const translateY = (1 - progress) * 12 * s
    const cardAlpha = easeOutCubic(progress)

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * cardAlpha))
    ctx.translate(translateX, translateY)

    // Card background = line color
    ctx.fillStyle = card.color || '#2563EB'
    roundRect(ctx, cardX, cardY, card.cardW, cardH, scaledCornerR)
    ctx.fill()

    // Line number (upper part)
    ctx.fillStyle = '#ffffff'
    ctx.font = nameFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const nameY = cardY + cardH * 0.38
    ctx.fillText(card.displayName, cardX + card.cardW / 2, nameY)

    // Divider line
    const divY = cardY + cardH * 0.58
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1 * s * cardScale
    ctx.beginPath()
    ctx.moveTo(cardX + cardPadH * 0.6, divY)
    ctx.lineTo(cardX + card.cardW - cardPadH * 0.6, divY)
    ctx.stroke()

    // KM value (lower part)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.font = kmFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.kmStr, cardX + card.cardW / 2, cardY + cardH * 0.78)

    ctx.restore()
  }

  ctx.restore()
}

// ─── Scan-line loading animation ─────────────────────────────────

/**
 * Render the scan-line tile loading animation.
 */
export function renderScanLineLoading(ctx, width, height, opts) {
  const {
    scanY,
    progress,
    themeColor = '#2563EB',
    elapsed = 0,
    camera,
    tileCache,
    renderTilesFn,
  } = opts

  const s = uiScale(width, height)

  // 1. Dark background
  ctx.fillStyle = '#0f1117'
  ctx.fillRect(0, 0, width, height)

  // 2. Dashed grid below scan line
  const gridSpacing = 48 * s
  if (scanY < height) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, scanY, width, height - scanY)
    ctx.clip()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([4 * s, 8 * s])

    // Vertical lines
    for (let x = gridSpacing; x < width; x += gridSpacing) {
      ctx.beginPath()
      ctx.moveTo(x, scanY)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    // Horizontal lines
    for (let y = scanY + gridSpacing - (scanY % gridSpacing); y < height; y += gridSpacing) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    ctx.setLineDash([])
    ctx.restore()
  }

  // 3. Real tiles above scan line (clipped), with fading grey overlay
  if (scanY > 0 && camera && tileCache && renderTilesFn) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, width, scanY)
    ctx.clip()

    renderTilesFn(ctx, camera, width, height, tileCache)

    // Grey overlay that fades as progress increases
    const overlayAlpha = Math.max(0, 0.45 * (1 - progress))
    if (overlayAlpha > 0.001) {
      ctx.fillStyle = `rgba(15, 17, 23, ${overlayAlpha})`
      ctx.fillRect(0, 0, width, scanY)
    }

    ctx.restore()
  }

  // 4. Scan line glow band + bright core
  const bandHeight = 32 * s
  const bandTop = scanY - bandHeight / 2
  const bandBottom = scanY + bandHeight / 2

  // Glow gradient band
  const glowGrad = ctx.createLinearGradient(0, bandTop, 0, bandBottom)
  glowGrad.addColorStop(0, themeColor + '00')    // transparent
  glowGrad.addColorStop(0.35, themeColor + '30')  // subtle glow
  glowGrad.addColorStop(0.5, themeColor + '60')   // peak glow
  glowGrad.addColorStop(0.65, themeColor + '30')
  glowGrad.addColorStop(1, themeColor + '00')
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, bandTop, width, bandHeight)

  // Bright core line (2px)
  const coreHeight = 2 * s
  ctx.save()
  ctx.fillStyle = themeColor
  ctx.globalAlpha = 0.9
  ctx.fillRect(0, scanY - coreHeight / 2, width, coreHeight)

  // White highlight on core for extra brightness
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.fillRect(0, scanY - coreHeight / 4, width, coreHeight / 2)
  ctx.restore()

  // 5. Bottom-left: percentage + subtitle
  const pctFontSize = Math.max(36, 64 * s)
  const subFontSize = Math.max(12, 18 * s)
  const marginX = 48 * s
  const marginY = height - 48 * s

  // Breathing pulse for subtitle (sine wave, period ~2s)
  const breathe = 0.5 + 0.5 * Math.sin(elapsed / 1000 * Math.PI)
  const subAlpha = 0.4 + 0.35 * breathe

  // Percentage number
  const pctText = `${Math.floor(progress * 100)}%`
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${pctFontSize}px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(pctText, marginX, marginY - subFontSize - 8 * s)

  // Subtitle
  ctx.globalAlpha = subAlpha
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.font = `500 ${subFontSize}px ${FONT_FAMILY}`
  ctx.textBaseline = 'bottom'
  ctx.fillText('Loading tiles...', marginX, marginY)

  ctx.restore()
}

// ─── Stress test: 100 line capsules ──────────────────────────────

/**
 * Stress test: render 100 fake line capsules.
 * Auto-finds the timeline canvas, clears it, and draws.
 * Usage: window.__stressLineInfo()
 */
export function stressTestLineInfo(ctx, width, height) {
  const COLORS = [
    '#e53935','#d81b60','#8e24aa','#5e35b1','#3949ab',
    '#1e88e5','#039be5','#00acc1','#00897b','#43a047',
    '#7cb342','#c0ca33','#fdd835','#ffb300','#fb8c00',
    '#f4511e','#6d4c41','#757575','#546e7a','#26a69a',
  ]
  const entries = []
  for (let i = 1; i <= 100; i++) {
    const isText = i > 90
    entries.push({
      lineId: `stress-${i}`,
      name: isText ? ['机场线','磁浮线','APM线','浦江线','金山线','崇明线','南汇线','嘉闵线','宝嘉线','示范线'][i - 91] : `${i}号线`,
      color: COLORS[i % COLORS.length],
      km: +(Math.random() * 80 + 5).toFixed(1),
      stations: Math.floor(Math.random() * 40 + 3),
    })
  }
  ctx.fillStyle = '#0f1117'
  ctx.fillRect(0, 0, width, height)
  renderOverlayLineInfo(ctx, null, { km: 999, stations: 999, lines: 100 }, 1, width, height, {
    cumulativeLineStats: entries,
    lineAppearProgress: new Map(),
    displayStats: { km: 2500, stations: 1200 },
  })
}

if (typeof window !== 'undefined') {
  window.__stressLineInfo = () => {
    const c = document.querySelector('.preview-view__canvas')
    if (!c) { console.error('No timeline canvas found — open the preview tab first'); return }
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    stressTestLineInfo(ctx, c.width / dpr, c.height / dpr)
  }
}
