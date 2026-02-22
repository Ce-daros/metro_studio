import { normalizeHexColor, pickLineColor } from '../../colors'
import { createId } from '../../ids'
import { normalizeLineNamesForLoop } from '../../lineNaming'
import { EN_DIRECTION_SUFFIX_PATTERN, ZH_DIRECTION_SUFFIX_PATTERN } from './constants'

function cleanTagText(value) {
  return String(value || '').trim()
}

function stripDirectionalSuffix(rawName, isZh = true) {
  const raw = cleanTagText(rawName)
  if (!raw) return ''

  const colonParts = raw.split(/[：:]/u)
  if (colonParts.length > 1) {
    const prefix = cleanTagText(colonParts[0])
    if (prefix) return prefix
  }

  const pattern = isZh ? ZH_DIRECTION_SUFFIX_PATTERN : EN_DIRECTION_SUFFIX_PATTERN
  const stripped = raw.replace(pattern, '').trim()
  return stripped || raw
}

function normalizeLineRefZh(ref) {
  const raw = cleanTagText(ref)
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  if (/^\d+$/u.test(compact)) return `${compact}号线`
  if (/^\d+线$/u.test(compact)) return compact.replace(/线$/u, '号线')
  return compact
}

function normalizeLineRefEn(ref) {
  const raw = cleanTagText(ref)
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  if (/^\d+$/u.test(compact)) return `Line ${compact}`
  if (/^\d+号线$/u.test(compact)) return `Line ${compact.replace(/号线$/u, '')}`
  return raw
}

function resolveImportedLineNameZh(tags = {}, relationId) {
  const fromRef = normalizeLineRefZh(tags.ref)
  if (fromRef) return fromRef

  const fromName = stripDirectionalSuffix(tags['name:zh'] || tags.name, true)
  if (fromName) return fromName

  return `线路 ${tags.ref || relationId}`
}

function resolveImportedLineNameEn(tags = {}, relationId, fallbackZhName = '') {
  const fromRef = normalizeLineRefEn(tags.ref)
  if (fromRef) return fromRef

  const fromName = stripDirectionalSuffix(tags['name:en'] || tags.int_name, false)
  if (fromName) return fromName

  const fallbackZh = cleanTagText(fallbackZhName)
  if (fallbackZh) return fallbackZh

  return `Line ${tags.ref || relationId}`
}

function toLineKey(relation) {
  const tags = relation.tags || {}
  const fromRef = normalizeLineRefZh(tags.ref)
  if (fromRef) return fromRef
  const fromName = stripDirectionalSuffix(tags['name:zh'] || tags.name, true)
  return String(fromName || relation.id)
}

function readStationName(node) {
  const tags = node.tags || {}
  const nameZh = tags['name:zh'] || tags.name || tags['official_name:zh'] || `站点 ${node.id}`
  const nameEn = tags['name:en'] || tags.int_name || tags['name:latin'] || nameZh
  return { nameZh, nameEn }
}

function isLoopRelation(tags = {}) {
  const roundtrip = String(tags.roundtrip || '').toLowerCase()
  const circular = String(tags.circular || '').toLowerCase()
  const route = String(tags.route || '').toLowerCase()
  const nameZh = String(tags['name:zh'] || tags.name || '')
  const nameEn = String(tags['name:en'] || tags.int_name || '')

  if (roundtrip === 'yes' || circular === 'yes') return true
  if (route === 'loop') return true
  if (/环/u.test(nameZh)) return true
  if (/(loop|circle)/i.test(nameEn)) return true
  return false
}

function createLineFromRelation(relation, colorIndex, status) {
  const tags = relation.tags || {}
  const isLoop = isLoopRelation(tags)
  const nameZhRaw = resolveImportedLineNameZh(tags, relation.id)
  const nameEnRaw = resolveImportedLineNameEn(tags, relation.id, nameZhRaw)
  const normalizedNames = normalizeLineNamesForLoop({
    nameZh: nameZhRaw,
    nameEn: nameEnRaw,
    isLoop,
  })
  return {
    id: createId('line'),
    key: toLineKey(relation),
    nameZh: normalizedNames.nameZh || nameZhRaw,
    nameEn: normalizedNames.nameEn || nameEnRaw,
    color: normalizeHexColor(tags.colour, pickLineColor(colorIndex)),
    status,
    style: 'solid',
    isLoop,
    edgeIds: [],
  }
}

function normalizeStationName(name) {
  if (!name || typeof name !== 'string') return ''
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(][^()（）]*[)）]/g, '')
}

export {
  cleanTagText,
  stripDirectionalSuffix,
  normalizeLineRefZh,
  normalizeLineRefEn,
  resolveImportedLineNameZh,
  resolveImportedLineNameEn,
  toLineKey,
  readStationName,
  isLoopRelation,
  createLineFromRelation,
  normalizeStationName,
}
