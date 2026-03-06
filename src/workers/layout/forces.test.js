import { describe, expect, it } from 'vitest'

import { applyCrossingRepel, applyProximityRepel } from './forces'

function cloneMatrix(points) {
  return points.map((point) => [...point])
}

describe('layout edge separation', () => {
  it('pushes apart coincident parallel edges during proximity repel', () => {
    const positions = cloneMatrix([
      [0, 0],
      [10, 0],
      [0, 0],
      [10, 0],
    ])
    const forces = positions.map(() => [0, 0])
    const edgeRecords = [
      { id: 'edge-a', fromIndex: 0, toIndex: 1 },
      { id: 'edge-b', fromIndex: 2, toIndex: 3 },
    ]

    applyProximityRepel(forces, positions, edgeRecords, {
      proximityRepelMaxDistance: 22,
      proximityRepelWeight: 12,
    })

    const hasNonZeroForce = forces.some(([x, y]) => Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6)
    expect(hasNonZeroForce).toBe(true)
  })

  it('pushes apart coincident intersecting edges during crossing repel', () => {
    const positions = cloneMatrix([
      [0, 0],
      [10, 0],
      [0, 0],
      [10, 0],
    ])
    const forces = positions.map(() => [0, 0])
    const edgeRecords = [
      { id: 'edge-a', fromIndex: 0, toIndex: 1 },
      { id: 'edge-b', fromIndex: 2, toIndex: 3 },
    ]

    applyCrossingRepel(forces, positions, edgeRecords, {
      crossingRepelWeight: 20,
      maxEdgeLength: 160,
    })

    const hasNonZeroForce = forces.some(([x, y]) => Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6)
    expect(hasNonZeroForce).toBe(true)
  })
})
