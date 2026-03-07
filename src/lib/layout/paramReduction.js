const LAYOUT_REDUCTION_AXES = [
  {
    key: 'skeleton',
    label: '骨架展开',
    hint: '更贴近地理骨架，拉开主干走向。',
  },
  {
    key: 'junction',
    label: '枢纽分流',
    hint: '增强不同方向汇入时的分流与入口间距。',
  },
  {
    key: 'compactness',
    label: '紧凑程度',
    hint: '正值更紧凑，负值更舒展。',
  },
  {
    key: 'straightness',
    label: '直线优先',
    hint: '提高直线延续和主方向一致性。',
  },
  {
    key: 'labels',
    label: '标签避让',
    hint: '增大标签与线路、标签之间的安全距离。',
  },
]

function clampAxis(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(-3, Math.min(3, numeric))
}

function getNormalizedAxisValue(deltas, index) {
  return clampAxis(Array.isArray(deltas) ? deltas[index] : 0) / 3
}

function scaleByAxis(base, axis, ratio) {
  return base * (1 + axis * ratio)
}

function roundTo(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildWorkerLayoutConfig(layoutConfig = {}) {
  const deltas = layoutConfig?.paramReduction?.deltas || []
  const skeleton = getNormalizedAxisValue(deltas, 0)
  const junction = getNormalizedAxisValue(deltas, 1)
  const compactness = getNormalizedAxisValue(deltas, 2)
  const straightness = getNormalizedAxisValue(deltas, 3)
  const labels = getNormalizedAxisValue(deltas, 4)

  const geoSeedScale = roundTo(Math.max(0.1, 6 + skeleton * 4.6 - compactness * 0.9), 2)
  const minStationDistance = roundTo(Math.max(30, scaleByAxis(50, -compactness, 0.2) + junction * 3.2), 2)
  const minEdgeLength = roundTo(Math.max(24, scaleByAxis(32, -compactness, 0.12) + junction * 4.2), 2)
  const maxEdgeLength = roundTo(Math.max(96, scaleByAxis(160, -compactness, 0.16) + skeleton * 8), 2)

  return {
    geoSeedScale,
    anchorWeight: roundTo(Math.max(0.006, scaleByAxis(0.0135, skeleton, 0.28)), 4),
    geoAngleBias: roundTo(Math.max(0.3, Math.min(0.92, 0.7 + skeleton * 0.14 + straightness * 0.06)), 3),
    minStationDistance,
    minEdgeLength,
    maxEdgeLength,
    displacementLimit: roundTo(Math.max(150, scaleByAxis(230, -compactness, 0.16) + skeleton * 14), 2),
    junctionSpreadWeight: roundTo(Math.max(0.08, scaleByAxis(0.24, junction, 1.05)), 3),
    junctionSpacingPasses: Math.max(8, Math.round(18 + junction * 8)),
    junctionAdjacentMinDistance: roundTo(Math.max(28, 42 + junction * 12 - compactness * 4), 2),
    proximityRepelWeight: roundTo(Math.max(4, scaleByAxis(12, junction, 0.8)), 2),
    proximityRepelMaxDistance: roundTo(Math.max(12, 22 + junction * 6), 2),
    straightenStrength: roundTo(Math.max(0.35, Math.min(0.95, 0.72 + straightness * 0.18)), 3),
    straightenTurnToleranceDeg: roundTo(Math.max(10, Math.min(40, 25 + straightness * 8)), 2),
    lineMainDirectionWeight: roundTo(Math.max(0.2, 0.52 + straightness * 0.24), 3),
    lineTurnPenalty: roundTo(Math.max(0.8, 1.55 + straightness * 0.75), 3),
    lineShortRunPenalty: roundTo(Math.max(1.2, 2.8 + straightness * 0.9), 3),
    octilinearBlend: roundTo(Math.max(0.18, Math.min(0.72, 0.38 + straightness * 0.12)), 3),
    labelPadding: roundTo(Math.max(4, 6 + labels * 2), 2),
    labelLineClearance: roundTo(Math.max(5, 9.5 + labels * 4), 2),
    labelRelaxIterations: Math.max(10, Math.round(26 + labels * 10)),
    labelRelaxMaxOffset: roundTo(Math.max(28, 52 + labels * 16), 2),
    labelPairPadding: roundTo(Math.max(1.5, 3.5 + labels * 2), 2),
  }
}

export { LAYOUT_REDUCTION_AXES, buildWorkerLayoutConfig }
