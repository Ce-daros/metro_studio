const TTS_BASE = import.meta.env.VITE_TTS_BASE_URL || 'http://localhost:9880'

/**
 * Call TTS server to generate a single announcement audio.
 * @param {string} text - Text to synthesize
 * @param {string} filename - Output filename
 * @param {string} language - "Chinese" or "English"
 */
export async function generateTTS(text, filename, language = 'Chinese') {
  const res = await fetch(`${TTS_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, filename, language }),
  })
  if (!res.ok) throw new Error(`TTS failed: ${res.statusText}`)
  return res.json()
}

/**
 * Call TTS server to generate a batch of announcements.
 * @param {Array<{text: string, filename: string, language?: string}>} items
 */
export async function generateTTSBatch(items) {
  const res = await fetch(`${TTS_BASE}/tts/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map(i => ({ ...i, language: i.language || 'Chinese' })) }),
  })
  if (!res.ok) throw new Error(`TTS batch failed: ${res.statusText}`)
  return res.json()
}

/** Get playback URL for a generated audio file. */
export function getTTSAudioUrl(filename) {
  return `${TTS_BASE}/tts/output/${encodeURIComponent(filename)}`
}

/** Check if TTS server is running. */
export async function checkTTSHealth() {
  try {
    const res = await fetch(`${TTS_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch multiple generated audio files, decode and concatenate them into
 * a single WAV blob URL that can be used with <audio controls>.
 * @param {string[]} filenames - Array of generated filenames
 * @returns {Promise<string>} Blob URL of the concatenated WAV
 */
export async function concatenateAudioFiles(filenames) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const buffers = await Promise.all(
      filenames.map(async f => {
        const res = await fetch(getTTSAudioUrl(f))
        const arr = await res.arrayBuffer()
        return ctx.decodeAudioData(arr)
      }),
    )
    if (!buffers.length) return null

    const sampleRate = buffers[0].sampleRate
    const numChannels = buffers[0].numberOfChannels
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0)

    const combined = ctx.createBuffer(numChannels, totalLength, sampleRate)
    let offset = 0
    for (const buf of buffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        combined.getChannelData(ch).set(buf.getChannelData(ch), offset)
      }
      offset += buf.length
    }

    return URL.createObjectURL(encodeWav(combined))
  } finally {
    ctx.close()
  }
}

function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels
  const sr = buffer.sampleRate
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataLen = buffer.length * blockAlign
  const buf = new ArrayBuffer(44 + dataLen)
  const v = new DataView(buf)

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  v.setUint32(4, 36 + dataLen, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, numCh, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * blockAlign, true)
  v.setUint16(32, blockAlign, true)
  v.setUint16(34, 16, true)
  writeStr(36, 'data')
  v.setUint32(40, dataLen, true)

  let off = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      off += 2
    }
  }

  return new Blob([buf], { type: 'audio/wav' })
}
