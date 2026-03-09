import { PROJECT_SCHEMA_VERSION } from './projectModel'
import { syncEdgeTimelineSummary } from './edgeTimeline'

/**
 * Ordered list of version strings from oldest to newest.
 * Each entry in MIGRATIONS maps a source version to { target, migrate }.
 */
const MIGRATIONS = {
  '0.0.0': {
    target: '1.0.0',
    migrate(data) {
      // Ensure timelineEvents array exists
      if (!Array.isArray(data.timelineEvents)) {
        data.timelineEvents = []
      }

      // Ensure all edges have openingYear and phase
      if (Array.isArray(data.edges)) {
        data.edges = data.edges.map((edge) => syncEdgeTimelineSummary({
          ...edge,
          openingYear: edge.openingYear ?? null,
          phase: edge.phase ?? '',
          lineTimeline: edge?.lineTimeline && typeof edge.lineTimeline === 'object' ? edge.lineTimeline : {},
        }))
      }

      // Ensure layoutConfig exists with geoSeedScale
      if (!data.layoutConfig || typeof data.layoutConfig !== 'object') {
        data.layoutConfig = { geoSeedScale: 6 }
      } else if (!Number.isFinite(data.layoutConfig.geoSeedScale)) {
        data.layoutConfig.geoSeedScale = 6
      }

      return data
    },
  },
}

/**
 * All known versions in ascending order, derived from the migration chain.
 * Used for ordered traversal from source version to current.
 */
const VERSION_CHAIN = buildVersionChain()

function buildVersionChain() {
  const chain = []
  const sources = new Set(Object.keys(MIGRATIONS))

  // Find the earliest version (a source that is not any migration's target)
  const allTargets = new Set(Object.values(MIGRATIONS).map((m) => m.target))
  let current = null
  for (const src of sources) {
    if (!allTargets.has(src)) {
      current = src
      break
    }
  }

  // Walk the chain from earliest to latest
  while (current && MIGRATIONS[current]) {
    chain.push(current)
    current = MIGRATIONS[current].target
  }

  return chain
}

/**
 * Compare two semver-style version strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Returns true if the raw project data needs migration to the current schema version.
 * @param {object} rawData
 * @returns {boolean}
 */
export function needsMigration(rawData) {
  const dataVersion = rawData?.projectVersion || '0.0.0'
  return compareVersions(dataVersion, PROJECT_SCHEMA_VERSION) < 0
}

/**
 * Applies all necessary migrations in order to bring rawData up to PROJECT_SCHEMA_VERSION.
 * Returns the migrated data with an updated projectVersion field.
 * If no migration is needed, returns the data as-is.
 * @param {object} rawData
 * @returns {object}
 */
export function migrateProject(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    return rawData
  }

  const dataVersion = rawData.projectVersion || '0.0.0'

  if (compareVersions(dataVersion, PROJECT_SCHEMA_VERSION) >= 0) {
    return rawData
  }

  let data = { ...rawData }

  // Find the starting point in the chain and apply migrations sequentially
  let applying = false
  for (const sourceVersion of VERSION_CHAIN) {
    if (!applying && compareVersions(sourceVersion, dataVersion) >= 0) {
      applying = true
    }
    if (applying) {
      const migration = MIGRATIONS[sourceVersion]
      if (migration) {
        data = migration.migrate(data)
        data.projectVersion = migration.target
      }
    }
  }

  return data
}
