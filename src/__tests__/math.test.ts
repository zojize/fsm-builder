import { describe, expect, it } from 'vitest'
import {
  arrowHeadPoints,
  controlFromOffsetCubic,
  cubicPoint,
  cubicTangent,
  findMaxDeviation,
  normalizedAngleDelta,
  offsetFromDeviation,
  perpLeft,
  rotate,
  STRAIGHT_SNAP_RATIO,
  unitVec,
} from '../fsm/math'

describe('unitVec', () => {
  it('normalizes a vector', () => {
    const v = unitVec(3, 4)
    expect(v.x).toBeCloseTo(0.6)
    expect(v.y).toBeCloseTo(0.8)
  })

  it('handles zero vector', () => {
    const v = unitVec(0, 0)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
  })

  it('returns unit length', () => {
    const v = unitVec(7, -3)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1)
  })
})

describe('perpLeft', () => {
  it('rotates 90° counter-clockwise', () => {
    const r1 = perpLeft({ x: 1, y: 0 })
    expect(r1.x).toBeCloseTo(0)
    expect(r1.y).toBeCloseTo(1)
    const r2 = perpLeft({ x: 0, y: 1 })
    expect(r2.x).toBeCloseTo(-1)
    expect(r2.y).toBeCloseTo(0)
  })
})

describe('rotate', () => {
  it('rotates by pi/2', () => {
    const v = rotate({ x: 1, y: 0 }, Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
  })

  it('rotates by pi', () => {
    const v = rotate({ x: 1, y: 0 }, Math.PI)
    expect(v.x).toBeCloseTo(-1)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('cubicPoint', () => {
  const p0 = { x: 0, y: 0 }
  const p1 = { x: 0, y: 100 }
  const p2 = { x: 100, y: 100 }
  const p3 = { x: 100, y: 0 }

  it('returns start at t=0', () => {
    const pt = cubicPoint(p0, p1, p2, p3, 0)
    expect(pt.x).toBeCloseTo(0)
    expect(pt.y).toBeCloseTo(0)
  })

  it('returns end at t=1', () => {
    const pt = cubicPoint(p0, p1, p2, p3, 1)
    expect(pt.x).toBeCloseTo(100)
    expect(pt.y).toBeCloseTo(0)
  })

  it('returns midpoint at t=0.5', () => {
    const pt = cubicPoint(p0, p1, p2, p3, 0.5)
    expect(pt.x).toBeCloseTo(50)
    expect(pt.y).toBeCloseTo(75)
  })
})

describe('cubicTangent', () => {
  const p0 = { x: 0, y: 0 }
  const p3 = { x: 100, y: 0 }
  // Straight line: control points on the chord
  const p1 = { x: 33, y: 0 }
  const p2 = { x: 66, y: 0 }

  it('returns horizontal tangent for a straight horizontal curve', () => {
    const t = cubicTangent(p0, p1, p2, p3, 0.5)
    expect(t.y).toBeCloseTo(0)
    expect(t.x).toBeGreaterThan(0)
  })
})

describe('controlFromOffsetCubic', () => {
  it('places control points at L/3 and 2L/3 with zero offset', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 300, y: 0 }
    const [c1, c2] = controlFromOffsetCubic(p0, p3, 0)
    expect(c1.x).toBeCloseTo(100)
    expect(c1.y).toBeCloseTo(0)
    expect(c2.x).toBeCloseTo(200)
    expect(c2.y).toBeCloseTo(0)
  })

  it('curve midpoint equals chord midpoint + offset·n', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    const offset = 40
    const [c1, c2] = controlFromOffsetCubic(p0, p3, offset)
    const mid = cubicPoint(p0, c1, c2, p3, 0.5)
    expect(mid.x).toBeCloseTo(100)
    expect(mid.y).toBeCloseTo(offset)
  })

  it('offsets control points perpendicular to chord', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 0 }
    const [c1pos] = controlFromOffsetCubic(p0, p3, 10)
    const [c1neg] = controlFromOffsetCubic(p0, p3, -10)
    // Positive offset should go in opposite direction of negative
    expect(Math.sign(c1pos.y)).not.toBe(Math.sign(c1neg.y))
  })

  it('snaps to straight when |offset|/L < STRAIGHT_SNAP_RATIO', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    // offset=3, L=200 → ratio=0.015 < 0.04 → should snap
    const [c1, c2] = controlFromOffsetCubic(p0, p3, 3)
    expect(c1.y).toBeCloseTo(0)
    expect(c2.y).toBeCloseTo(0)
  })

  it('does not snap when |offset|/L >= STRAIGHT_SNAP_RATIO', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    // offset=10, L=200 → ratio=0.05 >= 0.04 → should NOT snap
    const [c1] = controlFromOffsetCubic(p0, p3, 10)
    expect(c1.y).not.toBeCloseTo(0)
  })

  it('sTRAIGHT_SNAP_RATIO is a reasonable value', () => {
    expect(STRAIGHT_SNAP_RATIO).toBeGreaterThan(0)
    expect(STRAIGHT_SNAP_RATIO).toBeLessThan(0.2)
  })
})

describe('findMaxDeviation', () => {
  it('returns null for empty trail', () => {
    expect(findMaxDeviation([], { x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull()
  })

  it('returns null for degenerate chord', () => {
    const trail = [{ x: 5, y: 5 }]
    expect(findMaxDeviation(trail, { x: 50, y: 50 }, { x: 50, y: 50 })).toBeNull()
  })

  it('finds the point with maximum perpendicular deviation', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 0 }
    const trail = [
      { x: 20, y: 5 },
      { x: 50, y: 40 },
      { x: 80, y: -10 },
    ]
    const result = findMaxDeviation(trail, p0, p3)!
    expect(result.point).toBe(trail[1])
    expect(result.deviation).toBeCloseTo(40)
  })

  it('returns signed deviation (negative for right-side)', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 0 }
    const trail = [{ x: 50, y: -30 }]
    const result = findMaxDeviation(trail, p0, p3)!
    expect(result.deviation).toBeCloseTo(-30)
  })
})

describe('offsetFromDeviation', () => {
  it('returns 0 for degenerate chord', () => {
    expect(offsetFromDeviation({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 })).toBe(0)
  })

  it('at chord midpoint (s=0.5), offset equals perpendicular distance', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    const q = { x: 100, y: 60 }
    const offset = offsetFromDeviation(p0, p3, q)
    // At s=0.5: offset = qPerp / (4 * 0.5 * 0.5) = qPerp / 1 = 60
    expect(offset).toBeCloseTo(60)
  })

  it('amplifies deviation near endpoints', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    const qMid = { x: 100, y: 30 }
    const qNearStart = { x: 40, y: 30 }
    const offsetMid = offsetFromDeviation(p0, p3, qMid)
    const offsetNear = offsetFromDeviation(p0, p3, qNearStart)
    // Same perpendicular distance but closer to endpoint needs larger offset
    expect(Math.abs(offsetNear)).toBeGreaterThan(Math.abs(offsetMid))
  })

  it('produces offset that makes the curve midpoint match expected displacement', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 200, y: 0 }
    const q = { x: 100, y: 50 }
    const offset = offsetFromDeviation(p0, p3, q)
    // At chord midpoint (s=0.5), offset should equal perpendicular distance
    expect(offset).toBeCloseTo(50)
    const [c1, c2] = controlFromOffsetCubic(p0, p3, offset)
    const mid = cubicPoint(p0, c1, c2, p3, 0.5)
    expect(mid.y).toBeCloseTo(50)
  })
})

describe('normalizedAngleDelta', () => {
  it('handles positive sweep', () => {
    const delta = normalizedAngleDelta(0, Math.PI / 2, 1)
    expect(delta).toBeCloseTo(Math.PI / 2)
  })

  it('wraps negative delta for sweep=1', () => {
    const delta = normalizedAngleDelta(Math.PI / 2, 0, 1)
    expect(delta).toBeCloseTo(2 * Math.PI - Math.PI / 2)
  })

  it('handles negative sweep', () => {
    const delta = normalizedAngleDelta(Math.PI / 2, 0, 0)
    expect(delta).toBeCloseTo(-Math.PI / 2)
  })
})

describe('arrowHeadPoints', () => {
  it('returns a points string with 3 vertices', () => {
    const result = arrowHeadPoints({ x: 100, y: 50 }, { x: 1, y: 0 })
    const points = result.split(' ')
    expect(points).toHaveLength(3)
    // Tip should be the first point
    expect(points[0]).toBe('100,50')
  })

  it('snapshot default arrow', () => {
    expect(arrowHeadPoints({ x: 100, y: 50 }, { x: 1, y: 0 })).toMatchInlineSnapshot(`"100,50 84,56 84,44"`)
  })
})
