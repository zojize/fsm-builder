/** 2D vector used throughout geometry helpers. */
export interface Vec2 { x: number, y: number }

/** Returns the unit vector in direction `(vx, vy)`. Returns `{x:0,y:0}` for zero-length input. */
export function unitVec(vx: number, vy: number): Vec2 {
  const m = Math.hypot(vx, vy) || 1
  return { x: vx / m, y: vy / m }
}

/** Returns the vector rotated 90° counter-clockwise (the left perpendicular). */
export function perpLeft(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

/** Rotates vector `v` by `angleRad` radians counter-clockwise. */
export function rotate(v: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y }
}

/** Evaluates a cubic Bézier curve at parameter `t` ∈ [0,1]. */
export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  }
}

/** Returns the (unnormalized) tangent of a cubic Bézier at parameter `t`. */
export function cubicTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  }
}

/**
 * Compute symmetric cubic Bézier control points that produce a curve with its
 * midpoint offset from the chord by `offset` pixels along the chord normal.
 */
export function controlFromOffsetCubic(p0: Vec2, p3: Vec2, offset: number): [Vec2, Vec2] {
  // arbitrary scaling to make links feel snappier with cursor
  offset *= 1.5
  const dir = unitVec(p3.x - p0.x, p3.y - p0.y)
  const n = perpLeft(dir)
  const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
  const sepScale = 0.4
  const dispScale = 0.8
  const sep = Math.abs(offset) * sepScale
  const disp = offset * dispScale
  const p1 = { x: m.x - dir.x * sep + n.x * disp, y: m.y - dir.y * sep + n.y * disp }
  const p2 = { x: m.x + dir.x * sep + n.x * disp, y: m.y + dir.y * sep + n.y * disp }
  return [p1, p2]
}

/** Parameters for drawing a self-loop arc via SVG `A` command. */
export function selfLoopArcParams(center: Vec2, r: number, theta: number) {
  const Rs = 0.8 * r
  const d = r
  const Cs = { x: center.x + d * Math.cos(theta), y: center.y + d * Math.sin(theta) }
  let cosBeta = (d * d + Rs * Rs - r * r) / (2 * d * Rs)
  cosBeta = Math.max(-1, Math.min(1, cosBeta))
  const beta = Math.acos(cosBeta)
  const baseSmall = Math.atan2(center.y - Cs.y, center.x - Cs.x)
  const a1 = baseSmall + beta
  const a2 = baseSmall - beta
  const startPt = { x: Cs.x + Rs * Math.cos(a1), y: Cs.y + Rs * Math.sin(a1) }
  const endPt = { x: Cs.x + Rs * Math.cos(a2), y: Cs.y + Rs * Math.sin(a2) }
  const largeArcFlag: 0 | 1 = 1
  const sweepFlag: 0 | 1 = 1
  return { center: Cs, radius: Rs, startAngle: a1, endAngle: a2, startPt, endPt, largeArcFlag, sweepFlag }
}

/** Returns an SVG `points` string for a filled arrowhead at `tip` pointing in `dirUnit`. */
export function arrowHeadPoints(tip: Vec2, dirUnit: Vec2, len = 16, wid = 12): string {
  const baseX = tip.x - len * dirUnit.x
  const baseY = tip.y - len * dirUnit.y
  const px = -dirUnit.y
  const py = dirUnit.x
  const wid2 = wid / 2
  return [
    `${tip.x},${tip.y}`,
    `${baseX + wid2 * px},${baseY + wid2 * py}`,
    `${baseX - wid2 * px},${baseY - wid2 * py}`,
  ].join(' ')
}

/** Newton-Raphson + bisection hybrid to find the last t where |B(t)-center|=radius. */
export function findCubicCircleIntersectionT(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  center: Vec2,
  radius: number,
): number {
  const r2 = radius * radius
  const f = (t: number) => {
    const q = cubicPoint(p0, p1, p2, p3, t)
    const dx = q.x - center.x
    const dy = q.y - center.y
    return dx * dx + dy * dy - r2
  }
  const df = (t: number) => {
    const q = cubicPoint(p0, p1, p2, p3, t)
    const dq = cubicTangent(p0, p1, p2, p3, t)
    return 2 * ((q.x - center.x) * dq.x + (q.y - center.y) * dq.y)
  }

  let t = 0.95
  for (let i = 0; i < 10; i++) {
    const ft = f(t)
    const dft = df(t)
    if (!Number.isFinite(dft) || Math.abs(dft) < 1e-6)
      break
    const tNext = t - ft / dft
    if (!Number.isFinite(tNext))
      break
    t = Math.max(0, Math.min(1, tNext))
    if (Math.abs(ft) < 1e-4)
      break
  }

  if (!(t >= 0 && t <= 1) || f(t) > 1e-3) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (f(mid) > 0)
        lo = mid
      else
        hi = mid
    }
    t = hi
  }
  return Math.max(0, Math.min(1, t))
}

/** Reconstruct arc circle center and endpoint angles from SVG `A`-command parameters. */
export function arcCenterFromEndpoints(p0: Vec2, p1: Vec2, R: number, largeArcFlag: 0 | 1, sweepFlag: 0 | 1) {
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const d = Math.sqrt(dx * dx + dy * dy)
  const r = Math.max(R, d / 2)
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)))
  const ux = -dy / (d || 1)
  const uy = dx / (d || 1)
  const c1 = { x: mx + ux * h, y: my + uy * h }
  const c2 = { x: mx - ux * h, y: my - uy * h }

  function angles(c: Vec2) {
    return { a0: Math.atan2(p0.y - c.y, p0.x - c.x), a1: Math.atan2(p1.y - c.y, p1.x - c.x) }
  }
  function angleDelta(a0: number, a1: number, sweep: 0 | 1) {
    let delta = a1 - a0
    if (sweep === 1) {
      if (delta < 0)
        delta += 2 * Math.PI
    }
    else {
      if (delta > 0)
        delta -= 2 * Math.PI
    }
    return delta
  }

  const cand1 = angles(c1)
  const cand2 = angles(c2)
  const d1 = angleDelta(cand1.a0, cand1.a1, sweepFlag)
  const d2ang = angleDelta(cand2.a0, cand2.a1, sweepFlag)
  const use1 = largeArcFlag === 1 ? Math.abs(d1) > Math.PI : Math.abs(d1) <= Math.PI
  const use2 = largeArcFlag === 1 ? Math.abs(d2ang) > Math.PI : Math.abs(d2ang) <= Math.PI

  let center: Vec2
  let startAngle: number
  let endAngle: number

  if (use1 && !use2) {
    center = c1
    startAngle = cand1.a0
    endAngle = cand1.a1
  }
  else if (!use1 && use2) {
    center = c2
    startAngle = cand2.a0
    endAngle = cand2.a1
  }
  else {
    const pref = largeArcFlag === 1 ? Math.abs(d1) - Math.abs(d2ang) : Math.abs(d2ang) - Math.abs(d1)
    if (pref <= 0) {
      center = c1
      startAngle = cand1.a0
      endAngle = cand1.a1
    }
    else {
      center = c2
      startAngle = cand2.a0
      endAngle = cand2.a1
    }
  }

  return { center, startAngle, endAngle }
}

/** Returns the signed angular delta from `a0` to `a1` normalised to the given sweep direction. */
/** Returns the signed angular delta from `a0` to `a1`, normalised to the given sweep direction. */
export function normalizedAngleDelta(a0: number, a1: number, sweep: 0 | 1): number {
  let delta = a1 - a0
  if (sweep === 1) {
    if (delta < 0)
      delta += 2 * Math.PI
  }
  else {
    if (delta > 0)
      delta -= 2 * Math.PI
  }
  return delta
}
