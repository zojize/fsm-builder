import { describe, expect, it } from 'vitest'
import { computeLabelLayout, computeNonSelfEdgeGeom, computeSelfEdgeGeom } from '../fsm/edges'

describe('computeSelfEdgeGeom', () => {
  it('produces a valid SVG arc path', () => {
    const geom = computeSelfEdgeGeom({ x: 100, y: 100 }, 30, 0)
    expect(geom.d).toMatch(/^M .+ A .+/)
    expect(geom.tipPt).toBeDefined()
    expect(geom.tangUnit).toBeDefined()
    expect(geom.mid).toBeDefined()
  })

  it('snapshot default self-loop geometry', () => {
    const geom = computeSelfEdgeGeom({ x: 100, y: 100 }, 30, 0)
    expect(geom.d).toMatchSnapshot()
  })

  it('rotation changes geometry', () => {
    const g0 = computeSelfEdgeGeom({ x: 100, y: 100 }, 30, 0)
    const g90 = computeSelfEdgeGeom({ x: 100, y: 100 }, 30, 90)
    expect(g0.d).not.toBe(g90.d)
  })
})

describe('computeNonSelfEdgeGeom', () => {
  it('produces a valid SVG cubic path', () => {
    const geom = computeNonSelfEdgeGeom({ x: 0, y: 0 }, { x: 100, y: 0 }, 30, 0)
    expect(geom.d).toMatch(/^M .+ C .+/)
    expect(geom.tipPt).toBeDefined()
    expect(geom.tangUnit).toBeDefined()
  })

  it('tip point is near the target circle', () => {
    const endCenter = { x: 200, y: 0 }
    const radius = 30
    const geom = computeNonSelfEdgeGeom({ x: 0, y: 0 }, endCenter, radius, 0)
    const dist = Math.hypot(geom.tipPt.x - endCenter.x, geom.tipPt.y - endCenter.y)
    // Should be approximately at the edge of the circle
    expect(dist).toBeCloseTo(radius, 0)
  })

  it('snapshot straight edge', () => {
    const geom = computeNonSelfEdgeGeom({ x: 0, y: 0 }, { x: 200, y: 0 }, 30, 0)
    expect(geom.d).toMatchSnapshot()
  })

  it('offset changes the curve', () => {
    const g0 = computeNonSelfEdgeGeom({ x: 0, y: 0 }, { x: 100, y: 0 }, 30, 0)
    const g20 = computeNonSelfEdgeGeom({ x: 0, y: 0 }, { x: 100, y: 0 }, 30, 20)
    expect(g0.d).not.toBe(g20.d)
  })
})

describe('computeLabelLayout', () => {
  it('returns a position and text anchor', () => {
    const geom = {
      mid: { x: 50, y: 50 },
      midTangUnit: { x: 1, y: 0 },
    }
    const layout = computeLabelLayout(geom, 'right', 15)
    expect(layout.pt).toBeDefined()
    expect(['start', 'middle', 'end']).toContain(layout.textAnchor)
  })

  it('left and right produce different positions', () => {
    const geom = {
      mid: { x: 50, y: 50 },
      midTangUnit: { x: 1, y: 0 },
    }
    const left = computeLabelLayout(geom, 'left', 15)
    const right = computeLabelLayout(geom, 'right', 15)
    // With horizontal tangent, perpendicular is vertical so y differs
    expect(left.pt.y).not.toBeCloseTo(right.pt.y)
  })
})
