function toUniqueLineIds(lineIds = []) {
  const result = []
  const seen = new Set()
  for (const rawLineId of Array.isArray(lineIds) ? lineIds : []) {
    const lineId = String(rawLineId || '').trim()
    if (!lineId || seen.has(lineId)) continue
    seen.add(lineId)
    result.push(lineId)
  }
  return result
}

function normalizeOpeningYear(value) {
  if (value == null || value === '') return null
  const year = Number(value)
  if (!Number.isFinite(year) || !Number.isInteger(year)) return null
  return year
}

function normalizePhase(value) {
  return String(value || '').trim()
}

function normalizeTimelineEntry(rawEntry = {}, fallbackOpeningYear = null, fallbackPhase = '') {
  return {
    openingYear: normalizeOpeningYear(rawEntry?.openingYear ?? fallbackOpeningYear),
    phase: normalizePhase(rawEntry?.phase ?? fallbackPhase),
  }
}

export function normalizeEdgeLineTimeline(
  rawTimeline,
  sharedByLineIds = [],
  legacyOpeningYear = null,
  legacyPhase = '',
) {
  const lineIds = toUniqueLineIds(sharedByLineIds)
  const source = rawTimeline && typeof rawTimeline === 'object' ? rawTimeline : {}
  const legacyEntry = normalizeTimelineEntry(
    { openingYear: legacyOpeningYear, phase: legacyPhase },
    null,
    '',
  )
  const hasLegacyEntry = legacyEntry.openingYear != null || Boolean(legacyEntry.phase)
  let legacyAssigned = false

  const timeline = {}
  for (const lineId of lineIds) {
    const rawEntry = source[lineId]
    if (rawEntry && typeof rawEntry === 'object') {
      timeline[lineId] = normalizeTimelineEntry(rawEntry, null, '')
      continue
    }
    if (!legacyAssigned && hasLegacyEntry) {
      timeline[lineId] = { ...legacyEntry }
      legacyAssigned = true
      continue
    }
    timeline[lineId] = normalizeTimelineEntry()
  }
  return timeline
}

export function getEdgeTimelineEntries(edge, lineIds = null) {
  const orderedLineIds = lineIds == null
    ? toUniqueLineIds(edge?.sharedByLineIds)
    : toUniqueLineIds(lineIds)
  const timeline = normalizeEdgeLineTimeline(
    edge?.lineTimeline,
    orderedLineIds,
    edge?.openingYear,
    edge?.phase,
  )
  return orderedLineIds.map((lineId) => ({
    lineId,
    openingYear: timeline[lineId]?.openingYear ?? null,
    phase: timeline[lineId]?.phase || '',
  }))
}

export function getEdgeLineTimeline(edge, lineId) {
  const targetLineId = String(lineId || '').trim()
  if (!targetLineId) {
    return getEdgeTimelineEntries(edge)[0] || { lineId: '', openingYear: null, phase: '' }
  }
  return getEdgeTimelineEntries(edge, [targetLineId])[0] || {
    lineId: targetLineId,
    openingYear: null,
    phase: '',
  }
}

export function getEdgeEarliestOpeningYear(edge, lineIds = null) {
  let earliest = null
  for (const entry of getEdgeTimelineEntries(edge, lineIds)) {
    if (entry.openingYear == null) return null
    if (earliest == null || entry.openingYear < earliest) {
      earliest = entry.openingYear
    }
  }
  return earliest
}

export function getEdgePrimaryPhase(edge, lineIds = null) {
  const entries = getEdgeTimelineEntries(edge, lineIds)
  const finiteEntries = entries
    .filter((entry) => entry.openingYear != null)
    .sort((a, b) => a.openingYear - b.openingYear)

  const withYear = finiteEntries.find((entry) => entry.phase)
  if (withYear) return withYear.phase

  return entries.find((entry) => entry.phase)?.phase || ''
}

export function syncEdgeTimelineSummary(edge) {
  if (!edge || typeof edge !== 'object') return edge
  edge.sharedByLineIds = toUniqueLineIds(edge.sharedByLineIds)
  edge.lineTimeline = normalizeEdgeLineTimeline(
    edge.lineTimeline,
    edge.sharedByLineIds,
    edge.openingYear,
    edge.phase,
  )
  edge.openingYear = getEdgeEarliestOpeningYear(edge)
  edge.phase = getEdgePrimaryPhase(edge)
  return edge
}

export function cloneEdgeLineTimeline(edge, lineIds = null) {
  const nextTimeline = {}
  for (const entry of getEdgeTimelineEntries(edge, lineIds)) {
    nextTimeline[entry.lineId] = {
      openingYear: entry.openingYear,
      phase: entry.phase,
    }
  }
  return nextTimeline
}

export function getEdgeVisibleLineIdsAtYear(edge, year) {
  if (year == null) return toUniqueLineIds(edge?.sharedByLineIds)
  const filterYear = Number(year)
  if (!Number.isFinite(filterYear)) return []
  return getEdgeTimelineEntries(edge)
    .filter((entry) => entry.openingYear == null || entry.openingYear <= filterYear)
    .map((entry) => entry.lineId)
}

export function isEdgeVisibleAtYear(edge, year) {
  return getEdgeVisibleLineIdsAtYear(edge, year).length > 0
}

export function getEdgeSnapshotAtYear(edge, year) {
  if (edge == null) return null
  if (year == null) return syncEdgeTimelineSummary({ ...edge })

  const visibleLineIds = getEdgeVisibleLineIdsAtYear(edge, year)
  if (!visibleLineIds.length) return null

  const nextEdge = {
    ...edge,
    sharedByLineIds: visibleLineIds,
    lineTimeline: cloneEdgeLineTimeline(edge, visibleLineIds),
  }
  return syncEdgeTimelineSummary(nextEdge)
}

export function buildProjectEdgesSnapshotAtYear(project, year) {
  return (project?.edges || [])
    .map((edge) => getEdgeSnapshotAtYear(edge, year))
    .filter(Boolean)
}

export function getProjectTimelineYears(project) {
  const years = new Set()
  for (const edge of project?.edges || []) {
    for (const entry of getEdgeTimelineEntries(edge)) {
      if (entry.openingYear != null) years.add(entry.openingYear)
    }
  }
  return [...years].sort((a, b) => a - b)
}

export function hasEdgeOpeningAtYear(edge, year) {
  const targetYear = Number(year)
  if (!Number.isFinite(targetYear)) return false
  return getEdgeTimelineEntries(edge).some((entry) => entry.openingYear === targetYear)
}

export function applyEdgeTimelinePatchToAllLines(edge, patch = {}) {
  if (!edge) return false
  syncEdgeTimelineSummary(edge)
  let changed = false
  for (const lineId of edge.sharedByLineIds || []) {
    const current = edge.lineTimeline?.[lineId] || { openingYear: null, phase: '' }
    const next = {
      openingYear: patch.openingYear !== undefined
        ? normalizeOpeningYear(patch.openingYear)
        : current.openingYear ?? null,
      phase: patch.phase !== undefined
        ? normalizePhase(patch.phase)
        : current.phase || '',
    }
    if (current.openingYear !== next.openingYear || (current.phase || '') !== next.phase) {
      edge.lineTimeline[lineId] = next
      changed = true
    }
  }
  if (changed) syncEdgeTimelineSummary(edge)
  return changed
}

export function applyEdgeTimelinePatchForLine(edge, lineId, patch = {}) {
  const targetLineId = String(lineId || '').trim()
  if (!edge || !targetLineId) return false
  syncEdgeTimelineSummary(edge)
  if (!edge.sharedByLineIds.includes(targetLineId)) return false

  const current = edge.lineTimeline?.[targetLineId] || { openingYear: null, phase: '' }
  const next = {
    openingYear: patch.openingYear !== undefined
      ? normalizeOpeningYear(patch.openingYear)
      : current.openingYear ?? null,
    phase: patch.phase !== undefined
      ? normalizePhase(patch.phase)
      : current.phase || '',
  }

  if (current.openingYear === next.openingYear && (current.phase || '') === next.phase) {
    return false
  }

  edge.lineTimeline[targetLineId] = next
  syncEdgeTimelineSummary(edge)
  return true
}

export function haveSameEdgeTimelineForLineIds(edgeA, edgeB, lineIds = null) {
  const orderedLineIds = lineIds == null
    ? toUniqueLineIds(edgeA?.sharedByLineIds)
    : toUniqueLineIds(lineIds)
  for (const lineId of orderedLineIds) {
    const left = getEdgeLineTimeline(edgeA, lineId)
    const right = getEdgeLineTimeline(edgeB, lineId)
    if ((left.openingYear ?? null) !== (right.openingYear ?? null)) return false
    if ((left.phase || '') !== (right.phase || '')) return false
  }
  return true
}
