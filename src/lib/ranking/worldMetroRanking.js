import { haversineDistanceMeters } from '../geo'

const WIKI_METRO_SYSTEMS_API_URL =
  'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_metro_systems&prop=text&format=json&formatversion=2&origin=*'
const WIKI_METRO_TABLE_SELECTOR = 'table.wikitable'

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseLengthKm(text) {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return null
  const kmMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*km\b/)
  if (kmMatch?.[1]) return Number(kmMatch[1])
  const miMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*mi\b/)
  if (miMatch?.[1]) return Number(miMatch[1]) * 1.609344
  const plainNumberMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (plainNumberMatch?.[1]) return Number(plainNumberMatch[1])
  return null
}

function normalizeHeader(value) {
  return normalizeText(value).toLowerCase()
}

function findHeaderIndex(headers, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias))
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]
    if (!header) continue
    if (normalizedAliases.some((alias) => header.includes(alias))) {
      return i
    }
  }
  return -1
}

function isLengthHeader(header) {
  if (!header || !header.includes('length')) return false
  if (header.includes('system length') || header.includes('route length') || header.includes('network length')) {
    return true
  }
  if (header === 'length') return true
  return /total|km|mi/.test(header)
}

function resolveColumnIndexes(headers) {
  const cityIndex = findHeaderIndex(headers, ['city', 'urban area', 'metropolitan area'])
  const countryIndex = findHeaderIndex(headers, ['country', 'countries'])
  const nameIndex = findHeaderIndex(headers, ['name', 'system', 'network'])
  const lengthIndex = headers.findIndex((header) => isLengthHeader(header))
  if (cityIndex < 0 || nameIndex < 0 || lengthIndex < 0) return null
  return { cityIndex, countryIndex, nameIndex, lengthIndex }
}

function parseEntriesFromRows(rows, indexes) {
  const dedupe = new Set()
  const parsed = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const city = normalizeText(row[indexes.cityIndex])
    const country = indexes.countryIndex >= 0 ? normalizeText(row[indexes.countryIndex]) : ''
    const systemName = normalizeText(row[indexes.nameIndex])
    const lengthKm = parseLengthKm(row[indexes.lengthIndex])
    if (!city || !systemName || !Number.isFinite(lengthKm) || lengthKm <= 0) continue

    const dedupeKey = `${city}::${country}::${systemName}`.toLowerCase()
    if (dedupe.has(dedupeKey)) continue
    dedupe.add(dedupeKey)
    parsed.push({
      city,
      country,
      systemName,
      lengthKm,
    })
  }
  parsed.sort((a, b) => b.lengthKm - a.lengthKm)
  return parsed
}

function fillCarryCells(carryCells, row, startColumn) {
  let column = startColumn
  while (carryCells[column]) {
    row[column] = carryCells[column].value
    carryCells[column].rowsLeft -= 1
    if (carryCells[column].rowsLeft <= 0) {
      delete carryCells[column]
    }
    column += 1
  }
  return column
}

function tableToRows(tableElement) {
  const rows = []
  const carryCells = []
  const trList = Array.from(tableElement.querySelectorAll('tr'))

  for (const tr of trList) {
    const row = []
    let column = fillCarryCells(carryCells, row, 0)
    const cells = Array.from(tr.children).filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
    for (const cell of cells) {
      column = fillCarryCells(carryCells, row, column)
      const text = normalizeText(cell.textContent)
      const rowSpan = Math.max(1, Number(cell.getAttribute('rowspan')) || 1)
      const colSpan = Math.max(1, Number(cell.getAttribute('colspan')) || 1)
      for (let offset = 0; offset < colSpan; offset += 1) {
        const targetColumn = column + offset
        row[targetColumn] = text
        if (rowSpan > 1) {
          carryCells[targetColumn] = {
            value: text,
            rowsLeft: rowSpan - 1,
          }
        }
      }
      column += colSpan
    }
    if (row.some((value) => normalizeText(value))) {
      rows.push(row)
    }
  }

  return rows
}

function parseMetroRankingFromHtml(html) {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  const tables = Array.from(document.querySelectorAll(WIKI_METRO_TABLE_SELECTOR))
  if (!tables.length) return []

  let bestEntries = []
  for (const table of tables) {
    const rows = tableToRows(table)
    if (rows.length < 2) continue
    const headers = rows[0].map(normalizeHeader)
    const indexes = resolveColumnIndexes(headers)
    if (!indexes) continue
    const entries = parseEntriesFromRows(rows, indexes)
    if (entries.length > bestEntries.length) {
      bestEntries = entries
    }
  }

  return bestEntries
}

export async function fetchWorldMetroRanking(options = {}) {
  const { signal } = options
  const response = await fetch(WIKI_METRO_SYSTEMS_API_URL, { signal, cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`排行榜拉取失败（HTTP ${response.status}）`)
  }
  const payload = await response.json()
  const html = payload?.parse?.text
  if (!html) {
    throw new Error('排行榜响应缺少表格 HTML')
  }
  const entries = parseMetroRankingFromHtml(html)
  if (!entries.length) {
    throw new Error('未解析出有效的轨道交通排行榜数据')
  }
  return {
    source: 'Wikipedia: List of metro systems',
    fetchedAt: new Date().toISOString(),
    entries,
  }
}

function computeWaypointsLengthMeters(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return 0
  let total = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) continue
    total += haversineDistanceMeters(a, b)
  }
  return total
}

function resolveEdgeLengthMeters(edge, stationById) {
  if (Number.isFinite(edge?.lengthMeters) && edge.lengthMeters > 0) return edge.lengthMeters
  if (Array.isArray(edge?.waypoints) && edge.waypoints.length >= 2) {
    return computeWaypointsLengthMeters(edge.waypoints)
  }
  const fromStation = stationById.get(edge?.fromStationId)
  const toStation = stationById.get(edge?.toStationId)
  if (!Array.isArray(fromStation?.lngLat) || !Array.isArray(toStation?.lngLat)) return 0
  return haversineDistanceMeters(fromStation.lngLat, toStation.lngLat)
}

export function computeProjectRailLengthKm(project) {
  const edges = project?.edges || []
  const stations = project?.stations || []
  if (!edges.length) return 0

  const stationById = new Map(stations.map((station) => [station.id, station]))
  const visited = new Set()
  let totalMeters = 0

  for (const edge of edges) {
    if (!edge?.id || visited.has(edge.id)) continue
    visited.add(edge.id)
    totalMeters += resolveEdgeLengthMeters(edge, stationById)
  }

  return totalMeters / 1000
}

export function buildProjectMetroRanking(projectLengthKm, rankingEntries = []) {
  const normalizedLength = Number.isFinite(projectLengthKm) && projectLengthKm > 0 ? projectLengthKm : 0
  const entries = (Array.isArray(rankingEntries) ? rankingEntries : [])
    .filter((entry) => Number.isFinite(entry?.lengthKm) && entry.lengthKm > 0)
    .slice()
    .sort((a, b) => b.lengthKm - a.lengthKm)

  if (!entries.length) {
    return {
      rank: 1,
      total: 1,
      playerLengthKm: normalizedLength,
      above: null,
      below: null,
    }
  }

  let rank = entries.length + 1
  for (let i = 0; i < entries.length; i += 1) {
    if (normalizedLength >= entries[i].lengthKm) {
      rank = i + 1
      break
    }
  }

  const above = rank > 1 ? entries[rank - 2] : null
  const below = rank <= entries.length ? entries[rank - 1] : null
  return {
    rank,
    total: entries.length + 1,
    playerLengthKm: normalizedLength,
    above,
    below,
  }
}
