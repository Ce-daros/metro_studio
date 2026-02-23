const TILE_SOURCES = {
  osm: {
    type: 'raster',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© Esri, Maxar, Earthstar Geographics',
  },
  topo: {
    type: 'raster',
    tiles: [
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 17,
    attribution: '© OpenTopoMap (CC-BY-SA)',
  },
  positron: {
    type: 'raster',
    tiles: [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© OpenStreetMap, © CARTO',
  },
  dark: {
    type: 'raster',
    tiles: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© OpenStreetMap, © CARTO',
  },
  voyager: {
    type: 'raster',
    tiles: [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© OpenStreetMap, © CARTO',
  },
  esriWorldStreet: {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 17,
    attribution: '© Esri',
  },
  esriWorldTopo: {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 20,
    attribution: '© Esri',
  },
  wikimedia: {
    type: 'raster',
    tiles: [
      'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 19,
    attribution: '© OpenStreetMap, © Wikimedia',
  },
}

function buildMapStyle(tileType = 'dark') {
  const source = TILE_SOURCES[tileType] || TILE_SOURCES.dark
  return {
    version: 8,
    sources: {
      'base-tiles': source,
    },
    layers: [
      {
        id: 'base-layer',
        type: 'raster',
        source: 'base-tiles',
        paint: {
          'raster-brightness-min': 0.2,
          'raster-brightness-max': 1,
        },
      },
    ],
  }
}

export { buildMapStyle, TILE_SOURCES }
