/**
 * OSM tile rendering for timeline animation.
 *
 * Handles Web Mercator projection, tile math, async tile loading with
 * concurrency control, caching, and canvas rendering.
 *
 * Tile source: CartoDB raster tiles (dark/light, 256×256).
 */

const TILE_SIZE = 256
const TILE_URL_TEMPLATES = {
  dark: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
}
const MAX_CONCURRENT_FETCHES = 12
const MAX_CACHE_SIZE = 2048
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

// ─── Web Mercator projection ────────────────────────────────────

/**
 * Convert lng/lat to fractional tile coordinates at a given zoom level.
 * Returns { tileX, tileY, pixelX, pixelY } where pixelX/Y are the
 * offset within the tile (0..255).
 */
export function lngLatToTileXY(lng, lat, zoom) {
  const n = Math.pow(2, zoom)
  const latRad = Math.max(-85.051129, Math.min(85.051129, lat)) * DEG_TO_RAD
  const x = ((lng + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const tileX = Math.floor(x)
  const tileY = Math.floor(y)
  const pixelX = Math.floor((x - tileX) * TILE_SIZE)
  const pixelY = Math.floor((y - tileY) * TILE_SIZE)
  return { tileX, tileY, pixelX, pixelY, fracX: x, fracY: y }
}

/**
 * Convert tile coordinates back to lng/lat (top-left corner of tile).
 */
export function tileXYToLngLat(tileX, tileY, zoom) {
  const n = Math.pow(2, zoom)
  const lng = (tileX / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n)))
  const lat = latRad * RAD_TO_DEG
  return [lng, lat]
}

/**
 * Project lng/lat to canvas pixel coordinates given a geographic camera.
 *
 * Camera: { centerLng, centerLat, zoom }
 * Returns [px, py] in canvas coordinates.
 */
export function lngLatToPixel(lng, lat, camera, width, height) {
  const scale = Math.pow(2, camera.zoom) * TILE_SIZE
  // World pixel coordinates (continuous)
  const worldX = ((lng + 180) / 360) * scale
  const latRad = Math.max(-85.051129, Math.min(85.051129, lat)) * DEG_TO_RAD
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale

  // Center world pixel
  const centerWorldX = ((camera.centerLng + 180) / 360) * scale
  const centerLatRad = Math.max(-85.051129, Math.min(85.051129, camera.centerLat)) * DEG_TO_RAD
  const centerWorldY =
    ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale

  const px = (worldX - centerWorldX) + width / 2
  const py = (worldY - centerWorldY) + height / 2
  return [px, py]
}

/**
 * Convert canvas pixel back to lng/lat.
 */
export function pixelToLngLat(px, py, camera, width, height) {
  const scale = Math.pow(2, camera.zoom) * TILE_SIZE
  const centerWorldX = ((camera.centerLng + 180) / 360) * scale
  const centerLatRad = Math.max(-85.051129, Math.min(85.051129, camera.centerLat)) * DEG_TO_RAD
  const centerWorldY =
    ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale

  const worldX = (px - width / 2) + centerWorldX
  const worldY = (py - height / 2) + centerWorldY

  const lng = (worldX / scale) * 360 - 180
  const lat = RAD_TO_DEG * Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / scale)))
  return [lng, lat]
}

/**
 * Select the best integer zoom level to fit a geographic bounding box
 * into the given canvas dimensions, with optional padding factor.
 */
export function selectZoomLevel(bbox, width, height, padding = 0.85) {
  if (!bbox || width <= 0 || height <= 0) return 12
  const { minLng, minLat, maxLng, maxLat } = bbox
  const lngSpan = Math.max(Math.abs(maxLng - minLng), 0.001)
  const latSpan = Math.max(Math.abs(maxLat - minLat), 0.001)

  // For each candidate zoom, compute how many pixels the bbox would span
  for (let z = 18; z >= 1; z--) {
    const scale = Math.pow(2, z) * TILE_SIZE
    const pxWidth = (lngSpan / 360) * scale
    const minLatRad = Math.max(-85.051129, Math.min(85.051129, minLat)) * DEG_TO_RAD
    const maxLatRad = Math.max(-85.051129, Math.min(85.051129, maxLat)) * DEG_TO_RAD
    const yMin = ((1 - Math.log(Math.tan(maxLatRad) + 1 / Math.cos(maxLatRad)) / Math.PI) / 2) * scale
    const yMax = ((1 - Math.log(Math.tan(minLatRad) + 1 / Math.cos(minLatRad)) / Math.PI) / 2) * scale
    const pxHeight = Math.abs(yMax - yMin)

    if (pxWidth <= width * padding && pxHeight <= height * padding) {
      return z
    }
  }
  return 1
}

/**
 * Compute a fractional zoom level for precise fitting.
 */
export function selectZoomLevelFractional(bbox, width, height, padding = 0.85) {
  if (!bbox || width <= 0 || height <= 0) return 12
  const { minLng, minLat, maxLng, maxLat } = bbox
  const lngSpan = Math.max(Math.abs(maxLng - minLng), 0.001)
  const latSpan = Math.max(Math.abs(maxLat - minLat), 0.001)

  // Estimate zoom from longitude span
  const zoomLng = Math.log2((width * padding * 360) / (lngSpan * TILE_SIZE))

  // Estimate zoom from latitude span using Mercator
  const minLatRad = Math.max(-85.051129, Math.min(85.051129, minLat)) * DEG_TO_RAD
  const maxLatRad = Math.max(-85.051129, Math.min(85.051129, maxLat)) * DEG_TO_RAD
  const mercatorSpan = Math.abs(
    Math.log(Math.tan(maxLatRad) + 1 / Math.cos(maxLatRad)) -
    Math.log(Math.tan(minLatRad) + 1 / Math.cos(minLatRad))
  )
  const zoomLat = mercatorSpan > 0
    ? Math.log2((height * padding * Math.PI) / (mercatorSpan * TILE_SIZE * 0.5))
    : 18

  return Math.max(1, Math.min(18, Math.min(zoomLng, zoomLat)))
}

// ─── Tile cache ─────────────────────────────────────────────────

export class TileCache {
  constructor(basemapMode = 'light') {
    /** @type {Map<string, ImageBitmap|HTMLImageElement>} */
    this._cache = new Map()
    /** @type {Map<string, Promise<ImageBitmap|HTMLImageElement|null>>} */
    this._pending = new Map()
    this._activeFetches = 0
    /** @type {Array<() => void>} */
    this._queue = []
    this._basemapMode = basemapMode === 'dark' ? 'dark' : 'light'
    /** @type {(() => void)|null} */
    this.onTileLoaded = null
    /** @type {{ total: number, loaded: number, onProgress: ((loaded: number, total: number) => void)|null }|null} */
    this._progress = null
  }

  setBasemapMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light'
    if (normalized === this._basemapMode) return
    this._basemapMode = normalized
    this.clear()
    if (this._progress) {
      this._progress.loaded = 0
    }
  }

  _buildTileUrl(z, x, y) {
    const template = TILE_URL_TEMPLATES[this._basemapMode] || TILE_URL_TEMPLATES.light
    return template
      .replace('{z}', z)
      .replace('{x}', x)
      .replace('{y}', y)
  }

  /**
   * Start tracking tile load progress. Resets counters.
   * @param {(loaded: number, total: number) => void} [onProgress]
   * @param {number} [precomputedTotal] If provided, total is fixed and fetch() won't increment it.
   */
  startProgressTracking(onProgress, precomputedTotal) {
    this._progress = {
      total: precomputedTotal || 0,
      loaded: 0,
      fixedTotal: precomputedTotal != null,
      onProgress: onProgress || null,
    }
  }

  /**
   * Stop tracking progress and return final counts.
   * @returns {{ loaded: number, total: number }}
   */
  stopProgressTracking() {
    const result = this._progress
      ? { loaded: this._progress.loaded, total: this._progress.total }
      : { loaded: 0, total: 0 }
    this._progress = null
    return result
  }

  /**
   * Get current progress snapshot.
   * @returns {{ loaded: number, total: number }}
   */
  getProgress() {
    if (!this._progress) return { loaded: 0, total: 0 }
    return { loaded: this._progress.loaded, total: this._progress.total }
  }

  _key(z, x, y) {
    return `${this._basemapMode}/${z}/${x}/${y}`
  }

  /**
   * Get a cached tile image, or null if not yet loaded.
   */
  get(z, x, y) {
    return this._cache.get(this._key(z, x, y)) || null
  }

  /**
   * Request a tile. Returns a promise that resolves to the image or null on failure.
   * Uses concurrency limiting and LRU eviction.
   */
  fetch(z, x, y) {
    const key = this._key(z, x, y)
    if (this._cache.has(key)) {
      if (this._progress) {
        if (!this._progress.fixedTotal) { this._progress.total++; }
        this._progress.loaded++
        this._progress.onProgress?.(this._progress.loaded, this._progress.total)
      }
      return Promise.resolve(this._cache.get(key))
    }
    if (this._pending.has(key)) return this._pending.get(key)

    if (this._progress && !this._progress.fixedTotal) {
      this._progress.total++
    }

    const promise = new Promise((resolve) => {
      const doFetch = () => {
        this._activeFetches++
        const url = this._buildTileUrl(z, x, y)

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          // Try to create ImageBitmap for better performance
          if (typeof createImageBitmap === 'function') {
            createImageBitmap(img).then((bitmap) => {
              this._store(key, bitmap)
              this._activeFetches--
              this._drainQueue()
              resolve(bitmap)
            }).catch(() => {
              this._store(key, img)
              this._activeFetches--
              this._drainQueue()
              resolve(img)
            })
          } else {
            this._store(key, img)
            this._activeFetches--
            this._drainQueue()
            resolve(img)
          }
        }
        img.onerror = () => {
          this._pending.delete(key)
          this._activeFetches--
          // Failed tile still counts as "loaded" to avoid progress stalling
          if (this._progress) {
            this._progress.loaded++
            this._progress.onProgress?.(this._progress.loaded, this._progress.total)
          }
          this._drainQueue()
          resolve(null)
        }
        img.src = url
      }

      if (this._activeFetches < MAX_CONCURRENT_FETCHES) {
        doFetch()
      } else {
        this._queue.push(doFetch)
      }
    })

    this._pending.set(key, promise)
    return promise
  }

  _store(key, image) {
    this._cache.set(key, image)
    this._pending.delete(key)
    // Track successful load for progress
    if (this._progress) {
      this._progress.loaded++
      this._progress.onProgress?.(this._progress.loaded, this._progress.total)
    }
    // LRU eviction
    if (this._cache.size > MAX_CACHE_SIZE) {
      const firstKey = this._cache.keys().next().value
      const evicted = this._cache.get(firstKey)
      if (evicted && typeof evicted.close === 'function') {
        evicted.close() // Close ImageBitmap to free memory
      }
      this._cache.delete(firstKey)
    }
    // Notify listener that a tile has loaded (for triggering repaints)
    this.onTileLoaded?.()
  }

  _drainQueue() {
    while (this._activeFetches < MAX_CONCURRENT_FETCHES && this._queue.length > 0) {
      const next = this._queue.shift()
      next()
    }
  }

  /**
   * Collect unique tile keys for a bounding box at a given zoom (no fetching).
   * @param {Set<string>} keySet - Set to add keys into
   */
  collectTileKeysForBounds(bbox, zoom, keySet) {
    if (!bbox) return
    const z = Math.round(Math.max(0, Math.min(18, zoom)))
    const topLeft = lngLatToTileXY(bbox.minLng, bbox.maxLat, z)
    const bottomRight = lngLatToTileXY(bbox.maxLng, bbox.minLat, z)
    const n = Math.pow(2, z)
    for (let x = topLeft.tileX; x <= bottomRight.tileX; x++) {
      for (let y = topLeft.tileY; y <= bottomRight.tileY; y++) {
        const wrappedX = ((x % n) + n) % n
        if (y < 0 || y >= n) continue
        keySet.add(this._key(z, wrappedX, y))
      }
    }
  }

  /**
   * Prefetch all tiles needed for a geographic bounding box at a given zoom.
   * Returns a promise that resolves when all tiles are loaded (or failed).
   */
  prefetchForBounds(bbox, zoom) {
    if (!bbox) return Promise.resolve()
    const z = Math.round(Math.max(0, Math.min(18, zoom)))
    const topLeft = lngLatToTileXY(bbox.minLng, bbox.maxLat, z)
    const bottomRight = lngLatToTileXY(bbox.maxLng, bbox.minLat, z)
    const n = Math.pow(2, z)

    const promises = []
    for (let x = topLeft.tileX; x <= bottomRight.tileX; x++) {
      for (let y = topLeft.tileY; y <= bottomRight.tileY; y++) {
        const wrappedX = ((x % n) + n) % n
        if (y < 0 || y >= n) continue
        promises.push(this.fetch(z, wrappedX, y))
      }
    }
    return Promise.all(promises)
  }

  /**
   * Get the number of cached tiles.
   */
  get size() {
    return this._cache.size
  }

  /**
   * Clear all cached tiles and pending requests.
   */
  clear() {
    for (const image of this._cache.values()) {
      if (image && typeof image.close === 'function') {
        image.close()
      }
    }
    this._cache.clear()
    this._pending.clear()
    this._queue.length = 0
  }
}

// ─── Tile rendering ─────────────────────────────────────────────

/**
 * Render visible base map tiles onto a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ centerLng: number, centerLat: number, zoom: number }} camera
 * @param {number} width  - Canvas logical width
 * @param {number} height - Canvas logical height
 * @param {TileCache} tileCache
 */
export function renderTiles(ctx, camera, width, height, tileCache) {
  const z = Math.round(Math.max(0, Math.min(18, camera.zoom)))
  const n = Math.pow(2, z)

  // Use the FRACTIONAL zoom for world-pixel math so that tile positions
  // align perfectly with lngLatToPixel() which also uses camera.zoom directly.
  const fracScale = Math.pow(2, camera.zoom) * TILE_SIZE
  const tileDisplaySize = fracScale / n  // effective pixel size of one tile at fractional zoom

  // Center of canvas in fractional-zoom world pixel coordinates
  const centerWorldX = ((camera.centerLng + 180) / 360) * fracScale
  const centerLatRad = Math.max(-85.051129, Math.min(85.051129, camera.centerLat)) * DEG_TO_RAD
  const centerWorldY =
    ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * fracScale

  // Visible world pixel range (fractional-zoom space)
  const worldLeft = centerWorldX - width / 2
  const worldTop = centerWorldY - height / 2
  const worldRight = centerWorldX + width / 2
  const worldBottom = centerWorldY + height / 2

  // Convert to tile indices (integer zoom tiles)
  const tileLeft = Math.floor(worldLeft / tileDisplaySize)
  const tileTop = Math.max(0, Math.floor(worldTop / tileDisplaySize))
  const tileRight = Math.floor(worldRight / tileDisplaySize)
  const tileBottom = Math.min(n - 1, Math.floor(worldBottom / tileDisplaySize))

  // Track whether any tiles are still loading
  let hasMissing = false

  // Draw tiles
  for (let tx = tileLeft; tx <= tileRight; tx++) {
    for (let ty = tileTop; ty <= tileBottom; ty++) {
      const wrappedTx = ((tx % n) + n) % n
      const tile = tileCache.get(z, wrappedTx, ty)

      // Canvas position: tile origin in fractional-zoom world space, then offset
      const canvasX = tx * tileDisplaySize - worldLeft
      const canvasY = ty * tileDisplaySize - worldTop

      if (tile) {
        ctx.drawImage(tile, canvasX, canvasY, tileDisplaySize, tileDisplaySize)
      } else {
        // Try lower-zoom fallback: find a cached ancestor tile and draw the relevant sub-region
        let drewFallback = false
        for (let dz = 1; dz <= 4; dz++) {
          const fallbackZ = z - dz
          if (fallbackZ < 0) break
          // Which tile at fallbackZ contains this tile?
          const scale = Math.pow(2, dz)
          const fbTx = Math.floor(wrappedTx / scale)
          const fbTy = Math.floor(ty / scale)
          const fbTile = tileCache.get(fallbackZ, fbTx, fbTy)
          if (fbTile) {
            // Sub-region within the fallback tile
            const subX = (wrappedTx % scale) / scale * TILE_SIZE
            const subY = (ty % scale) / scale * TILE_SIZE
            const subSize = TILE_SIZE / scale
            ctx.drawImage(fbTile, subX, subY, subSize, subSize, canvasX, canvasY, tileDisplaySize, tileDisplaySize)
            drewFallback = true
            break
          }
        }
        if (!drewFallback) {
          ctx.fillStyle = '#e8ecf0'
          ctx.fillRect(canvasX, canvasY, tileDisplaySize, tileDisplaySize)
        }
        // Trigger async fetch for the correct zoom tile
        tileCache.fetch(z, wrappedTx, ty)
        hasMissing = true
      }
    }
  }

  return hasMissing
}

/**
 * Compute the number of meters per pixel at a given latitude and zoom level.
 * Useful for scale bar rendering.
 */
export function metersPerPixel(lat, zoom) {
  const latRad = Math.max(-85.051129, Math.min(85.051129, lat)) * DEG_TO_RAD
  return (Math.cos(latRad) * 2 * Math.PI * 6378137) / (Math.pow(2, zoom) * TILE_SIZE)
}
