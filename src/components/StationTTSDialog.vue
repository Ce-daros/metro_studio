<script setup>
import { ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import { buildAnnouncementTexts } from '../lib/tts/announcementTemplates.js'
import { generateTTS, generateTTSBatch, getTTSAudioUrl, checkTTSHealth, concatenateAudioFiles } from '../lib/tts/ttsClient.js'

const props = defineProps({
  project: { type: Object, default: null },
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const generating = ref(false)
const currentId = ref(null)
const results = ref({})
const serverOk = ref(null)
const playingAudio = ref(null)
const playQueue = ref([])
const selectedLineId = ref(null)
const selectedStationId = ref(null)
const direction = ref(0)
const panelMode = ref('station') // 'station' | 'onboard'
const fromStationId = ref(null)
const toStationId = ref(null)
const onboardStatus = ref('')
const onboardFiles = ref([])
const onboardAudioUrl = ref(null)
const batchProgress = ref({ current: 0, total: 0 })

const lines = computed(() => props.project?.lines || [])
const currentLine = computed(() => lines.value.find(l => l.id === selectedLineId.value))

const lineEdges = computed(() => {
  if (!currentLine.value) return []
  return props.project.edges.filter(e => currentLine.value.edgeIds.includes(e.id))
})

const terminals = computed(() => {
  if (!lineEdges.value.length) return []
  const counts = {}
  lineEdges.value.forEach(e => {
    counts[e.fromStationId] = (counts[e.fromStationId] || 0) + 1
    counts[e.toStationId] = (counts[e.toStationId] || 0) + 1
  })
  return Object.entries(counts)
    .filter(([_, c]) => c === 1)
    .map(([id]) => props.project.stations.find(s => s.id === id))
    .filter(Boolean)
})

const isLoop = computed(() => lineEdges.value.length > 0 && !terminals.value.length)

// Chain-traverse edges to get ordered station list
const lineStations = computed(() => {
  const edges = lineEdges.value
  if (!edges.length) return []
  const adj = new Map()
  for (const e of edges) {
    if (!adj.has(e.fromStationId)) adj.set(e.fromStationId, [])
    if (!adj.has(e.toStationId)) adj.set(e.toStationId, [])
    adj.get(e.fromStationId).push({ to: e.toStationId, edgeId: e.id })
    adj.get(e.toStationId).push({ to: e.fromStationId, edgeId: e.id })
  }
  const visitedEdges = new Set()
  const start = terminals.value.length ? terminals.value[0].id : [...adj.keys()][0]
  const ordered = [start]
  let cur = start
  while (true) {
    const next = (adj.get(cur) || []).find(nb => !visitedEdges.has(nb.edgeId))
    if (!next) break
    visitedEdges.add(next.edgeId)
    if (next.to === start) break
    ordered.push(next.to)
    cur = next.to
  }
  const ids = (isLoop.value && direction.value === 1) ? ordered.slice().reverse() : ordered
  const sMap = new Map(props.project.stations.map(s => [s.id, s]))
  return ids.map(id => sMap.get(id)).filter(Boolean)
})

// In onboard mode on loop lines, "to" options = stations after "from" in order
const toStationOptions = computed(() => {
  if (!isLoop.value) return lineStations.value
  const idx = lineStations.value.findIndex(s => s.id === fromStationId.value)
  if (idx < 0) return lineStations.value
  return [...lineStations.value.slice(idx + 1), ...lineStations.value.slice(0, idx)]
})

const selectedStation = computed(() => {
  if (!selectedStationId.value) return null
  return props.project.stations.find(s => s.id === selectedStationId.value)
})

  const announcementData = computed(() => {
    if (!selectedStation.value || !currentLine.value) return null

    const transferLines = (selectedStation.value.transferLineIds || [])
      .filter(id => id !== currentLine.value.id)
      .map(id => props.project.lines.find(l => l.id === id)?.nameZh)
      .filter(Boolean)

  const virtualTransferLines = []
  props.project.manualTransfers?.forEach(t => {
    if (t.stationAId === selectedStation.value.id || t.stationBId === selectedStation.value.id) {
      const otherId = t.stationAId === selectedStation.value.id ? t.stationBId : t.stationAId
      const other = props.project.stations.find(s => s.id === otherId)
      other?.lineIds?.forEach(lid => {
        const line = props.project.lines.find(l => l.id === lid)
        if (line && !selectedStation.value.lineIds.includes(lid)) {
          virtualTransferLines.push(line.nameZh)
        }
      })
    }
  })

  const terminal = terminals.value[direction.value] || terminals.value[0]
  const isFirst = terminal ? terminals.value[1 - direction.value]?.id === selectedStation.value.id : false

  return buildAnnouncementTexts(
    selectedStation.value.nameZh || '未命名',
    selectedStation.value.nameEn || 'Unnamed',
    terminal?.nameZh || null,
    terminal?.nameEn || null,
    isFirst,
    transferLines,
    [...new Set(virtualTransferLines)],
    terminals.value.length ? undefined : direction.value,
  )
})

const hasGeneratedFiles = computed(() => {
  return Object.values(results.value).some(r => r.status === 'done')
})

watch(selectedLineId, () => {
  direction.value = 0
  onboardStatus.value = ''
  resetStationSelections()
})

watch(direction, () => {
  if (isLoop.value) resetStationSelections()
})

watch(fromStationId, () => {
  if (isLoop.value && toStationOptions.value.length && !toStationOptions.value.find(s => s.id === toStationId.value)) {
    toStationId.value = toStationOptions.value[0].id
  }
})

function resetStationSelections() {
  if (lineStations.value.length) {
    selectedStationId.value = lineStations.value[0].id
    fromStationId.value = lineStations.value[0].id
    toStationId.value = lineStations.value.length > 1 ? lineStations.value[1].id : lineStations.value[0].id
  }
}

async function onOpen() {
  results.value = {}
  serverOk.value = await checkTTSHealth()
  if (lines.value.length) selectedLineId.value = lines.value[0].id
}

const sid = computed(() => selectedStation.value?.id?.replace(/[^a-zA-Z0-9]/g, '') || 'x')

async function generateItem(item) {
  generating.value = true
  currentId.value = item.id
  results.value[item.id] = { status: 'generating' }
  try {
    const zhFile = `${sid.value}_${item.id}_zh.wav`
    await generateTTS(item.textZh, zhFile, 'Chinese')
    let enFile = null
    if (item.textEn) {
      enFile = `${sid.value}_${item.id}_en.wav`
      await generateTTS(item.textEn, enFile, 'English')
    }
    results.value[item.id] = { status: 'done', zhFile, enFile }
  } catch (e) {
    results.value[item.id] = { status: 'error', error: e.message }
  } finally {
    generating.value = false
    currentId.value = null
  }
}

async function generateSegment(segment) {
  generating.value = true
  const batchItems = []
  const itemMap = new Map()

  for (const item of segment.items) {
    const zhFile = `${sid.value}_${item.id}_zh.wav`
    batchItems.push({ text: item.textZh, filename: zhFile, language: 'Chinese' })

    let enFile = null
    if (item.textEn) {
      enFile = `${sid.value}_${item.id}_en.wav`
      batchItems.push({ text: item.textEn, filename: enFile, language: 'English' })
    }

    itemMap.set(item.id, { zhFile, enFile })
    results.value[item.id] = { status: 'generating' }
  }

  try {
    await generateTTSBatch(batchItems)
    for (const [id, files] of itemMap) {
      results.value[id] = { status: 'done', ...files }
    }
  } catch (e) {
    for (const id of itemMap.keys()) {
      results.value[id] = { status: 'error', error: e.message }
    }
  } finally {
    generating.value = false
  }
}

async function generateAll() {
  if (!announcementData.value) return

  generating.value = true
  const batchItems = []
  const itemMap = new Map()

  // 计算总数用于进度显示
  let totalItems = 0
  for (const seg of announcementData.value.segments) {
    totalItems += seg.items.length
  }
  batchProgress.value = { current: 0, total: totalItems }

  // 收集所有需要生成的项
  for (const seg of announcementData.value.segments) {
    for (const item of seg.items) {
      const zhFile = `${sid.value}_${item.id}_zh.wav`
      batchItems.push({ text: item.textZh, filename: zhFile, language: 'Chinese' })

      let enFile = null
      if (item.textEn) {
        enFile = `${sid.value}_${item.id}_en.wav`
        batchItems.push({ text: item.textEn, filename: enFile, language: 'English' })
      }

      itemMap.set(item.id, { zhFile, enFile })
      results.value[item.id] = { status: 'generating' }
    }
  }

  try {
    await generateTTSBatch(batchItems)
    // 标记所有项为完成
    batchProgress.value.current = totalItems
    for (const [id, files] of itemMap) {
      results.value[id] = { status: 'done', ...files }
    }
  } catch (e) {
    for (const id of itemMap.keys()) {
      results.value[id] = { status: 'error', error: e.message }
    }
  } finally {
    generating.value = false
    batchProgress.value = { current: 0, total: 0 }
  }
}

function play(filename) {
  if (playingAudio.value) { playingAudio.value.pause(); playingAudio.value = null }
  const audio = new Audio(getTTSAudioUrl(filename))
  audio.play()
  playingAudio.value = audio
}

function close() {
  stopPlayQueue()
  if (onboardAudioUrl.value) { URL.revokeObjectURL(onboardAudioUrl.value); onboardAudioUrl.value = null }
  emit('close')
}

function getStationTransfers(station, excludeLineId = null) {
  const transferLines = (station.transferLineIds || [])
    .filter(id => id !== excludeLineId)
    .map(id => props.project.lines.find(l => l.id === id)?.nameZh).filter(Boolean)
  const virtualTransferLines = []
  props.project.manualTransfers?.forEach(t => {
    if (t.stationAId === station.id || t.stationBId === station.id) {
      const otherId = t.stationAId === station.id ? t.stationBId : t.stationAId
      const other = props.project.stations.find(s => s.id === otherId)
      other?.lineIds?.forEach(lid => {
        const line = props.project.lines.find(l => l.id === lid)
        if (line && lid !== excludeLineId && !station.lineIds.includes(lid)) virtualTransferLines.push(line.nameZh)
      })
    }
  })
  return { transferLines, virtualTransferLines: [...new Set(virtualTransferLines)] }
}

function stopPlayQueue() {
  playQueue.value = []
  if (playingAudio.value) { playingAudio.value.pause(); playingAudio.value = null }
}

function playSequence(files) {
  stopPlayQueue()
  playQueue.value = [...files]
  playNext()
}

function playNext() {
  if (!playQueue.value.length) { playingAudio.value = null; return }
  const file = playQueue.value.shift()
  const audio = new Audio(getTTSAudioUrl(file))
  audio.addEventListener('ended', playNext)
  audio.play()
  playingAudio.value = audio
}

function playAllStation() {
  if (!announcementData.value) return
  const files = []
  for (const seg of announcementData.value.segments) {
    for (const item of seg.items) {
      const result = results.value[item.id]
      if (result?.status === 'done') {
        if (result.zhFile) files.push(result.zhFile)
        if (result.enFile) files.push(result.enFile)
      }
    }
  }
  if (files.length) playSequence(files)
}

async function downloadAllAudio() {
  if (!announcementData.value) return
  
  const files = []
  for (const seg of announcementData.value.segments) {
    for (const item of seg.items) {
      const result = results.value[item.id]
      if (result?.status === 'done') {
        files.push(result.zhFile)
        if (result.enFile) files.push(result.enFile)
      }
    }
  }
  
  if (!files.length) return
  
  try {
    const { default: JSZip } = await import('jszip')
    const blobs = await Promise.all(
      files.map(f => fetch(getTTSAudioUrl(f)).then(r => r.blob()))
    )
    
    const zip = new JSZip()
    files.forEach((filename, i) => {
      zip.file(filename, blobs[i])
    })
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tts_${selectedStation.value?.nameZh || 'all'}_${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('批量下载失败:', e)
    alert('批量下载失败: ' + e.message)
  }
}

async function generateOnboard() {
  const from = props.project.stations.find(s => s.id === fromStationId.value)
  const to = props.project.stations.find(s => s.id === toStationId.value)
  if (!from || !to || !currentLine.value) return

  generating.value = true
  onboardStatus.value = '生成中...'
  const terminal = terminals.value[direction.value] || terminals.value[0]
  const loopDir = isLoop.value ? direction.value : undefined
  const isFirst = terminal ? terminals.value[1 - direction.value]?.id === from.id : false

  const fromT = getStationTransfers(from, currentLine.value.id)
  const fromData = buildAnnouncementTexts(
    from.nameZh || '未命名', from.nameEn || 'Unnamed',
    terminal?.nameZh || null, terminal?.nameEn || null, isFirst, fromT.transferLines, fromT.virtualTransferLines, loopDir,
  )
  const toT = getStationTransfers(to, currentLine.value.id)
  const toData = buildAnnouncementTexts(
    to.nameZh || '未命名', to.nameEn || 'Unnamed',
    terminal?.nameZh || null, terminal?.nameEn || null, false, toT.transferLines, toT.virtualTransferLines, loopDir,
  )

  const boarding = fromData.segments[0].items[0]
  const idleItems = fromData.segments[1].items
  const idle = idleItems[Math.floor(Math.random() * idleItems.length)]
  const alighting = toData.segments[2].items[0]

  const batchItems = [
    { text: boarding.textZh, filename: 'onboard_boarding_zh.wav', language: 'Chinese' },
    ...(boarding.textEn ? [{ text: boarding.textEn, filename: 'onboard_boarding_en.wav', language: 'English' }] : []),
    { text: idle.textZh, filename: 'onboard_idle_zh.wav', language: 'Chinese' },
    { text: alighting.textZh, filename: 'onboard_alighting_zh.wav', language: 'Chinese' },
    ...(alighting.textEn ? [{ text: alighting.textEn, filename: 'onboard_alighting_en.wav', language: 'English' }] : []),
  ]

  try {
    await generateTTSBatch(batchItems)
    const files = batchItems.map(i => i.filename)
    onboardFiles.value = files
    onboardStatus.value = '正在拼接音频...'
    if (onboardAudioUrl.value) URL.revokeObjectURL(onboardAudioUrl.value)
    onboardAudioUrl.value = await concatenateAudioFiles(files)
    onboardStatus.value = ''
  } catch (e) {
    onboardStatus.value = `错误: ${e.message}`
    onboardFiles.value = []
    if (onboardAudioUrl.value) { URL.revokeObjectURL(onboardAudioUrl.value); onboardAudioUrl.value = null }
  } finally {
    generating.value = false
  }
}

async function downloadOnboardAudio() {
  if (!onboardFiles.value.length) return
  
  try {
    const { default: JSZip } = await import('jszip')
    const blobs = await Promise.all(
      onboardFiles.value.map(f => fetch(getTTSAudioUrl(f)).then(r => r.blob()))
    )
    
    const zip = new JSZip()
    onboardFiles.value.forEach((filename, i) => {
      zip.file(filename, blobs[i])
    })
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `onboard_${fromStation.value?.nameZh}_${toStation.value?.nameZh}_${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('批量下载失败:', e)
    alert('批量下载失败: ' + e.message)
  }
}

defineExpose({ onOpen })
</script>

<template>
  <NModal :show="visible" preset="card" title="报站生成" style="width:620px;max-height:85vh;max-width:calc(100vw - 32px)" @close="close" @mask-click="close">
    <template #header-extra>
      <div class="tts-mode-toggle">
        <button :class="['tts-dir-btn', { active: panelMode === 'station' }]" @click="panelMode = 'station'">单站模式</button>
        <button :class="['tts-dir-btn', { active: panelMode === 'onboard' }]" @click="panelMode = 'onboard'">车上模式</button>
      </div>
    </template>

        <div v-if="serverOk === false" class="tts-warning">
          TTS 服务未启动，请先运行 tts/start_server.bat
        </div>

        <div class="tts-controls">
          <div class="tts-row">
            <label class="pp-label">线路</label>
            <select v-model="selectedLineId" class="pp-input">
              <option v-for="line in lines" :key="line.id" :value="line.id">{{ line.nameZh }}</option>
            </select>
          </div>
          <template v-if="panelMode === 'station'">
            <div class="tts-row">
              <label class="pp-label">站点</label>
              <select v-model="selectedStationId" class="pp-input">
                <option v-for="s in lineStations" :key="s.id" :value="s.id">{{ s.nameZh }}</option>
              </select>
            </div>
          </template>
          <template v-else>
            <div class="tts-row">
              <label class="pp-label">上车</label>
              <select v-model="fromStationId" class="pp-input">
                <option v-for="s in lineStations" :key="s.id" :value="s.id">{{ s.nameZh }}</option>
              </select>
            </div>
            <div class="tts-row">
              <label class="pp-label">下车</label>
              <select v-model="toStationId" class="pp-input">
                <option v-for="s in toStationOptions" :key="s.id" :value="s.id">{{ s.nameZh }}</option>
              </select>
            </div>
          </template>
          <div v-if="currentLine" class="tts-row">
            <label class="pp-label">方向</label>
            <div class="tts-direction">
              <template v-if="terminals.length">
                <button
                  v-for="(term, i) in terminals" :key="i"
                  :class="['tts-dir-btn', { active: direction === i }]"
                  @click="direction = i"
                >开往 {{ term.nameZh }}</button>
              </template>
              <template v-else>
                <button :class="['tts-dir-btn', { active: direction === 0 }]" @click="direction = 0">内环运行</button>
                <button :class="['tts-dir-btn', { active: direction === 1 }]" @click="direction = 1">外环运行</button>
              </template>
            </div>
          </div>
        </div>

        <!-- 单站模式 -->
        <template v-if="panelMode === 'station'">
          <div class="tts-list">
            <template v-if="announcementData">
              <div v-for="seg in announcementData.segments" :key="seg.key" class="tts-segment">
                <div class="tts-seg-header">
                  <span class="tts-seg-label">{{ seg.label }}</span>
                  <button class="pp-btn pp-btn--sm" :disabled="generating || serverOk === false" @click="generateSegment(seg)">分段生成</button>
                </div>
                <div v-for="item in seg.items" :key="item.id" class="tts-item">
                  <div class="tts-item-header">
                    <span class="tts-item-label">{{ item.label }}</span>
                    <button class="pp-btn pp-btn--sm" :disabled="generating || serverOk === false" @click="generateItem(item)">{{ currentId === item.id ? '生成中...' : '生成' }}</button>
                  </div>
                  <p class="tts-text">{{ item.textZh }}</p>
                  <p v-if="item.textEn" class="tts-text tts-text-en">{{ item.textEn }}</p>
                  <div v-if="results[item.id]?.status === 'done'" class="tts-audio-section">
                    <div class="tts-audio-item">
                      <label class="tts-audio-label">中文</label>
                      <audio controls class="tts-audio-control">
                        <source :src="getTTSAudioUrl(results[item.id].zhFile)" type="audio/wav">
                      </audio>
                      <a :href="getTTSAudioUrl(results[item.id].zhFile)" :download="results[item.id].zhFile" class="pp-btn pp-btn--sm">下载</a>
                    </div>
                    <div v-if="results[item.id].enFile" class="tts-audio-item">
                      <label class="tts-audio-label">英文</label>
                      <audio controls class="tts-audio-control">
                        <source :src="getTTSAudioUrl(results[item.id].enFile)" type="audio/wav">
                      </audio>
                      <a :href="getTTSAudioUrl(results[item.id].enFile)" :download="results[item.id].enFile" class="pp-btn pp-btn--sm">下载</a>
                    </div>
                  </div>
                  <p v-if="results[item.id]?.status === 'error'" class="tts-error">{{ results[item.id].error }}</p>
                </div>
              </div>
            </template>
            <p v-else class="tts-empty">请先选择线路和站点</p>
          </div>
        </template>

        <!-- 车上模式 -->
        <template v-else>
          <div class="tts-list tts-onboard-body">
            <p v-if="onboardStatus" class="tts-onboard-status">{{ onboardStatus }}</p>
            <template v-if="onboardAudioUrl">
              <audio controls class="tts-audio-player" :src="onboardAudioUrl"></audio>
              <div class="tts-onboard-actions">
                <a :href="onboardAudioUrl" download="onboard_full.wav" class="pp-btn pp-btn--sm">下载完整音频</a>
                <button class="pp-btn pp-btn--sm" @click="downloadOnboardAudio">批量下载分段</button>
              </div>
            </template>
            <p v-else-if="!fromStationId || !toStationId" class="tts-empty">请选择上车站和下车站</p>
            <p v-else-if="fromStationId === toStationId" class="tts-empty">上车站和下车站不能相同</p>
          </div>
        </template>

    <template #footer>
      <div v-if="panelMode === 'station'" class="tts-footer">
        <button class="pp-btn pp-btn--primary" :disabled="generating || serverOk === false || !announcementData" @click="generateAll">
          {{ batchProgress.total > 0 ? `生成中... (${batchProgress.current}/${batchProgress.total})` : (generating ? '生成中...' : '整段生成') }}
        </button>
        <button class="pp-btn" :disabled="!hasGeneratedFiles" @click="playAllStation">播放全部</button>
        <button class="pp-btn" :disabled="!hasGeneratedFiles" @click="downloadAllAudio">批量下载</button>
        <button class="pp-btn" @click="close">关闭</button>
      </div>
      <div v-else class="tts-footer">
        <button class="pp-btn pp-btn--primary" :disabled="generating || serverOk === false || !fromStationId || !toStationId || fromStationId === toStationId" @click="generateOnboard">{{ generating ? '生成中...' : '生成并播放' }}</button>
        <button class="pp-btn" @click="close">关闭</button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.tts-warning {
  background: #fff3cd; color: #856404;
  padding: 10px 20px; font-size: 13px;
  border-bottom: 1px solid var(--workspace-panel-border);
}
.tts-controls { padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; }
.tts-row { display: flex; align-items: center; gap: 10px; }
.tts-row .pp-label { width: 40px; flex-shrink: 0; font-size: 13px; color: var(--toolbar-muted); }
.tts-row .pp-input { flex: 1; }
.tts-direction { display: flex; gap: 8px; flex: 1; }
.tts-dir-btn {
  flex: 1; padding: 6px 10px;
  background: var(--toolbar-input-bg); border: 1px solid var(--toolbar-input-border);
  border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--toolbar-text);
  transition: all 0.15s;
}
.tts-dir-btn:hover { background: var(--toolbar-hover-bg); }
.tts-dir-btn.active {
  background: var(--toolbar-primary-bg); border-color: var(--toolbar-primary-border);
  color: #fff; font-weight: 600;
}
.tts-list { flex: 1; overflow-y: auto; padding: 0 20px 12px; }
.tts-segment {
  margin-top: 12px;
  border: 1px solid var(--workspace-panel-border);
  border-radius: 8px; overflow: hidden;
}
.tts-seg-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px;
  background: var(--toolbar-input-bg);
  border-bottom: 1px solid var(--workspace-panel-border);
}
.tts-seg-label { font-weight: 600; font-size: 13px; color: var(--toolbar-text); }
.tts-item { padding: 10px 12px; border-bottom: 1px solid var(--workspace-panel-border); }
.tts-item:last-child { border-bottom: none; }
.tts-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tts-item-label { font-size: 12px; color: var(--toolbar-muted); }
.tts-text { font-size: 13px; color: var(--toolbar-text); line-height: 1.6; margin: 2px 0; }
.tts-text-en { opacity: 0.7; font-style: italic; }
.tts-actions { display: flex; gap: 8px; margin-top: 6px; }
.tts-audio-section { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.tts-audio-item { display: flex; align-items: center; gap: 8px; }
.tts-audio-label { font-size: 12px; color: var(--toolbar-muted); min-width: 32px; }
.tts-audio-control { flex: 1; height: 32px; }
.tts-error { color: #dc3545; font-size: 12px; margin-top: 4px; }
.tts-loop-hint { font-size: 12px; color: var(--toolbar-muted); font-style: italic; }
.tts-mode-toggle { display: flex; gap: 4px; }
.tts-onboard-body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px; gap: 12px; }
.tts-onboard-status { font-size: 13px; color: var(--toolbar-text); margin: 8px 0; }
.tts-audio-player { width: 100%; max-width: 400px; }
.tts-onboard-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.tts-empty { text-align: center; color: var(--toolbar-muted); font-size: 13px; padding: 24px 0; }
.tts-footer {
  display: flex; gap: 8px; justify-content: flex-end;
}
</style>
