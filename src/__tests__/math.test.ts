import { describe, expect, it } from 'vitest'
import {
  arrowHeadPoints,
  controlFromOffsetCubic,
  cubicPoint,
  cubicTangent,
  normalizedAngleDelta,
  perpLeft,
  rotate,
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
  it('returns symmetric control points', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 0 }
    const [c1, c2] = controlFromOffsetCubic(p0, p3, 0)
    // With zero offset, controls are symmetric about midpoint along the chord
    expect(c1.y).toBeCloseTo(c2.y)
  })

  it('offsets control points perpendicular to chord', () => {
    const p0 = { x: 0, y: 0 }
    const p3 = { x: 100, y: 0 }
    const [c1pos] = controlFromOffsetCubic(p0, p3, 10)
    const [c1neg] = controlFromOffsetCubic(p0, p3, -10)
    // Positive offset should go in opposite direction of negative
    expect(Math.sign(c1pos.y)).not.toBe(Math.sign(c1neg.y))
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
