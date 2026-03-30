import type { FSMContext } from './context'
import type { Vec2 } from './math'
import type { EdgeId, FSMTransition, NodeId } from './types'
import {
  applyInputAttributes,
  clientToSvg,
  createFOText,
  createSvgEl,
  editIsInvalid,
  getFontSize,
  getTextWidth,
  restoreInputState,
  saveInputState,
  setFOBounds,
  stopPointerEventPropagation,
  XHTML_NS,
} from './dom'
import {
  arcCenterFromEndpoints,
  arrowHeadPoints,
  controlFromOffsetCubic,
  cubicPoint,
  cubicTangent,
  findCubicCircleIntersectionT,
  normalizedAngleDelta,
  perpLeft,
  rotate,
  selfLoopArcParams,
  unitVec,

} from './math'
import { addEdgeToSelection, removeEdgeFromSelection, selectEdge } from './selection'
import { runValidation } from './validation'

/** Computed geometric data for a rendered FSM edge. */
export interface EdgeGeom { d: string, tipPt: Vec2, tangUnit: Vec2, mid: Vec2, midTangUnit: Vec2 }

/** Compute geometry for edge `id`, dispatching to self-loop or non-self helpers. */
export function computeEdgeGeom(ctx: FSMContext, id: EdgeId): EdgeGeom {
  const [from, { to, offset, rotation }] = ctx.edgeIdToTransition[id]
  const startNode = ctx.getNode(from)!
  const endNode = ctx.getNode(to)!
  if (from === to) {
    return computeSelfEdgeGeom({ x: startNode.x, y: startNode.y }, endNode.radius, rotation ?? 0)
  }
  return computeNonSelfEdgeGeom(
    { x: startNode.x, y: startNode.y },
    { x: endNode.x, y: endNode.y },
    endNode.radius,
    offset,
  )
}

/** Compute geometry for a self-loop edge centered at `startCenter` with the given rotation (degrees). */
export function computeSelfEdgeGeom(startCenter: Vec2, endRadius: number, rotationDeg: number): EdgeGeom {
  const theta = (rotationDeg * Math.PI) / 180
  const arc = selfLoopArcParams(startCenter, endRadius, theta)
  const d = `M ${arc.startPt.x} ${arc.startPt.y} A ${arc.radius} ${arc.radius} 0 ${arc.largeArcFlag} 1 ${arc.endPt.x} ${arc.endPt.y}`
  const arcGeom = arcCenterFromEndpoints(arc.startPt, arc.endPt, arc.radius, arc.largeArcFlag, 1)
  const tipA = arcGeom.endAngle
  const tipPt = { x: arcGeom.center.x + arc.radius * Math.cos(tipA), y: arcGeom.center.y + arc.radius * Math.sin(tipA) }
  const base = { x: -Math.sin(tipA), y: Math.cos(tipA) }
  const tangUnit = rotate(unitVec(base.x, base.y), -0.32)
  const delta = normalizedAngleDelta(arcGeom.startAngle, arcGeom.endAngle, 1)
  const midA = arcGeom.startAngle + delta / 2
  const mid = { x: arcGeom.center.x + arc.radius * Math.cos(midA), y: arcGeom.center.y + arc.radius * Math.sin(midA) }
  const midTangUnit = unitVec(-Math.sin(midA), Math.cos(midA))
  return { d, tipPt, tangUnit, mid, midTangUnit }
}

/** Compute geometry for a non-self cubic Bézier edge between two node centers. */
export function computeNonSelfEdgeGeom(startCenter: Vec2, endCenter: Vec2, endRadius: number, offset: number): EdgeGeom {
  const p0 = startCenter
  const p3 = endCenter
  const [p1, p2] = controlFromOffsetCubic(p0, p3, offset)
  const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`
  const tInt = findCubicCircleIntersectionT(p0, p1, p2, p3, endCenter, endRadius + 0.06)
  const tipPt = cubicPoint(p0, p1, p2, p3, tInt)
  const tan = cubicTangent(p0, p1, p2, p3, tInt)
  const tangUnit = unitVec(tan.x, tan.y)
  const mid = cubicPoint(p0, p1, p2, p3, 0.5)
  const mt = cubicTangent(p0, p1, p2, p3, 0.5)
  const midTangUnit = unitVec(mt.x, mt.y)
  return { d, tipPt, tangUnit, mid, midTangUnit }
}

/** Determine whether the edge label anchor sits left or right of the curve midpoint. */
export function getAutoAnchor(ctx: FSMContext, edgeId: EdgeId): 'left' | 'right' {
  const [from, trans] = ctx.edgeIdToTransition[edgeId]
  if (from === trans.to)
    return 'left'
  return (trans.offset ?? 0) >= 0 ? 'right' : 'left'
}

/** Compute the anchor point and CSS `text-align` value for positioning an edge label `<foreignObject>`. */
export function computeLabelLayout(
  geom: { mid: Vec2, midTangUnit: Vec2 },
  anchor: 'left' | 'right',
  offset: number,
): { pt: Vec2, textAnchor: 'start' | 'middle' | 'end' } {
  const nMid = perpLeft(geom.midTangUnit)
  let vDir: Vec2
  if (anchor === 'left')
    vDir = { x: -nMid.x, y: -nMid.y }
  else if (anchor === 'right')
    vDir = nMid
  else
    vDir = { x: 0, y: 0 }
  const pt = { x: geom.mid.x + vDir.x * offset, y: geom.mid.y + vDir.y * offset }
  const vOffset = { x: pt.x - geom.mid.x, y: pt.y - geom.mid.y }
  let textAnchor: 'start' | 'middle' | 'end'
  if (Math.abs(vOffset.x) < Math.abs(vOffset.y))
    textAnchor = 'middle'
  else
    textAnchor = vOffset.x >= 0 ? 'start' : 'end'
  return { pt, textAnchor }
}

/** Remove an edge by id, detaching DOM elements and splicing it from the source node's transition list. */
export function removeEdge(ctx: FSMContext, id: EdgeId): void {
  if (!(id in ctx.edgeIdToTransition)) {
    if (ctx.options.debug)
      console.warn(`FSM: could not find edge ${id} to remove`)
    return
  }
  const [from, transition, controller] = ctx.edgeIdToTransition[id]
  delete ctx.edgeIdToTransition[id]
  controller.abort()

  const fromNode = ctx.getNode(from)
  if (fromNode) {
    const idx = fromNode.transitions.indexOf(transition)
    if (idx !== -1) {
      fromNode.transitions.splice(idx, 1)
      ctx.tryOnChange(ctx.fsmState)
    }
    else if (ctx.options.debug) {
      console.warn(`FSM: could not find transition for edge ${id} in node ${from}`)
    }
  }
  else if (ctx.options.debug) {
    console.warn(`FSM: could not find source node ${from} for edge ${id}`)
  }

  ctx.edgesGroup.querySelector<SVGGElement>(`g.fsm-edge[data-edge-id="${id}"]`)?.remove()
  ctx.overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-edge-label-editor[data-edge-id="${id}"]`)?.remove()

  ctx.emitter.emit('edge:removed', { id })
  if (ctx.validationEnabled)
    runValidation(ctx, !ctx.autoValidate)
}

/** Convert an SVG text-anchor value to its CSS `text-align` equivalent. */
function textAnchorToAlign(textAnchor: 'start' | 'middle' | 'end'): 'left' | 'center' | 'right' {
  if (textAnchor === 'middle')
    return 'center'
  if (textAnchor === 'start')
    return 'left'
  return 'right'
}

// ─── Create edge ─────────────────────────────────────────────────────────────

/**
 * Create a new SVG edge element and register it.
 * @returns The EdgeId assigned to the new edge.
 */
export function createNewEdge(ctx: FSMContext, source: NodeId, transition: FSMTransition): EdgeId {
  const LABEL_NORMAL_OFFSET = 12

  const id = ctx.createEdgeId()
  if (id in ctx.edgeIdToTransition && ctx.options.debug) {
    console.warn(`FSM: duplicate edge id ${id}`)
  }
  ctx.edgeIdToTransition[id] = [source, transition, new AbortController()]
  const edgeEl = createEdgeElement()
  ctx.edgesGroup.appendChild(edgeEl)

  ctx.emitter.emit('edge:added', { id, from: source, transition })
  return id

  // Inner helpers

  function createEdgeElement(): SVGGElement {
    const g = createSvgEl('g')
    g.classList.add('fsm-edge')
    const hitPath = createSvgEl('path')
    hitPath.classList.add('fsm-edge-hit')
    const path = createSvgEl('path')
    path.classList.add('fsm-edge-path')
    g.dataset.from = source
    g.dataset.to = transition.to
    g.dataset.edgeId = id
    g.setAttribute('mask', `url(#${ctx.maskId})`)

    const geom = computeEdgeGeom(ctx, id)
    path.setAttribute('d', geom.d)
    hitPath.setAttribute('d', geom.d)

    const arrow = createSvgEl('polygon')
    arrow.classList.add('fsm-edge-arrow')
    arrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
    arrow.setAttribute('mask', `url(#${ctx.maskId})`)
    g.appendChild(arrow)
    g.appendChild(hitPath)
    g.appendChild(path)

    const { edgeFO, edgeInput } = initializeEdgeLabelEditor(geom)

    if (edgeInput) {
      initializeEdgeInteraction(g, path, hitPath, arrow, edgeFO, edgeInput)
    }

    const update = () => updateEdgeElement({ path, hitPath, arrow, edgeFO })
    const edgeSignal = ctx.edgeIdToTransition[id][2].signal
    const fromSignal = AbortSignal.any([ctx.nodeAbortControllers[source].signal, edgeSignal])
    const toSignal = AbortSignal.any([ctx.nodeAbortControllers[transition.to].signal, edgeSignal])
    ctx.emitter.on(`fsm:${source}-update-pos`, update, { signal: fromSignal })
    ctx.emitter.on(`fsm:${transition.to}-update-pos`, update, { signal: toSignal })

    const removeEdgeCb = () => removeEdge(ctx, id)
    ctx.emitter.on(`fsm:${source}-remove`, removeEdgeCb, { signal: edgeSignal })
    ctx.emitter.on(`fsm:${transition.to}-remove`, removeEdgeCb, { signal: edgeSignal })

    return g
  }

  function initializeEdgeLabelEditor(geom: EdgeGeom) {
    const layout = computeLabelLayout(geom, getAutoAnchor(ctx, id), LABEL_NORMAL_OFFSET)
    const edgeFO = createSvgEl('foreignObject') as SVGForeignObjectElement
    edgeFO.classList.add('fsm-edge-label-editor')
    edgeFO.dataset.from = source
    edgeFO.dataset.to = transition.to
    edgeFO.dataset.edgeId = id

    const fontSize = getFontSize((transition.label || '').length, ctx.options.fontSizeBreakpoints?.edge, ctx.defaultEdgeFontSize)
    const ew = getTextWidth(transition.label || 'M', `${fontSize} normal ${ctx.options.fontFamily}`)
    const eh = 40
    const pos0 = edgeLabelFOPosition(layout, ew, eh)
    setFOBounds(edgeFO, pos0.x, pos0.y, ew, eh)

    if (ctx.options.readonly) {
      const textEl = createFOText(transition.label || '', fontSize, textAnchorToAlign(layout.textAnchor))
      edgeFO.appendChild(textEl)
    }
    else {
      const edgeInput = document.createElementNS(XHTML_NS, 'input') as HTMLInputElement
      edgeInput.type = 'text'
      edgeInput.autocomplete = 'off'
      edgeInput.maxLength = 50
      edgeInput.classList.add('fsm-input')
      edgeInput.dataset.validateType = 'edge'
      if (ctx.validationEnabled) {
        const validateConfig = ctx.validateConfig
        const attrs = (validateConfig as any)?.edge?.inputAttributes
        applyInputAttributes(edgeInput, attrs)
      }
      edgeInput.style.fontSize = fontSize
      edgeInput.style.textAlign = textAnchorToAlign(layout.textAnchor)
      edgeInput.value = transition.label

      edgeInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === 'Escape') {
          ev.preventDefault()
          ev.stopPropagation()
          edgeInput.blur()
        }
      })
      stopPointerEventPropagation(edgeInput)
      let prevState = saveInputState(edgeInput)
      edgeInput.addEventListener('selectionchange', () => void (prevState = saveInputState(edgeInput)))
      edgeInput.addEventListener('input', (ev) => {
        if (editIsInvalid(ev)) {
          restoreInputState(edgeInput, prevState)
          return
        }
        prevState = saveInputState(edgeInput)
        const [, trans] = ctx.edgeIdToTransition[id]
        trans.label = edgeInput.value
        const newFontSize = getFontSize(edgeInput.value.length, ctx.options.fontSizeBreakpoints?.edge, ctx.defaultEdgeFontSize)
        edgeInput.style.fontSize = newFontSize
        const width = getTextWidth(edgeInput.value || 'M', `${newFontSize} normal ${ctx.options.fontFamily}`)
        const layout = computeLabelLayout(computeEdgeGeom(ctx, id), getAutoAnchor(ctx, id), LABEL_NORMAL_OFFSET)
        let x: number
        if (layout.textAnchor === 'middle')
          x = layout.pt.x - width / 2
        else if (layout.textAnchor === 'start')
          x = layout.pt.x
        else
          x = layout.pt.x - width
        edgeFO.setAttribute('x', `${x}`)
        edgeFO.setAttribute('width', `${width}`)
        ctx.tryOnChange(ctx.fsmState)
        ctx.emitter.emit('edge:changed', { id, transition: trans })
        if (ctx.validationEnabled)
          runValidation(ctx, !ctx.autoValidate)
      })
      edgeInput.addEventListener('blur', () => {
        ctx.emitter.emit('edge:committed', { id })
      })
      edgeFO.appendChild(edgeInput)
    }

    ctx.overlay.appendChild(edgeFO)
    const edgeInput = edgeFO.querySelector('input.fsm-input') as HTMLInputElement | null
    return { edgeFO, edgeInput }
  }

  function initializeEdgeInteraction(
    el: SVGGElement,
    path: SVGPathElement,
    hitPath: SVGPathElement,
    arrow: SVGPolygonElement,
    edgeFO: SVGForeignObjectElement,
    edgeInput: HTMLInputElement,
  ) {
    let dragging = false
    let moved = false
    let downX = 0
    let downY = 0
    let lastPt: Vec2 | null = null
    let dragEl: SVGGraphicsElement | null = null
    let dragBase: { m: Vec2, n: Vec2, startProj: number, startOffset: number } | null = null

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging)
        return
      if (!moved) {
        const dx = e.clientX - downX
        const dy = e.clientY - downY
        if (dx * dx + dy * dy > 144)
          moved = true
      }
      lastPt = clientToSvg(ctx.svg, e.clientX, e.clientY)
      if (!lastPt)
        return
      const pt = lastPt
      lastPt = null
      const startNode = ctx.getNode(source)!
      if (source === transition.to) {
        const ang = Math.atan2(pt.y - startNode.y, pt.x - startNode.x)
        const deg = (ang * 180) / Math.PI
        const [, trans] = ctx.edgeIdToTransition[id]
        trans.rotation = deg
      }
      else {
        if (!dragBase) {
          if (ctx.options.debug)
            console.error('Missing drag base for edge drag')
        }
        else {
          const v = { x: pt.x - dragBase.m.x, y: pt.y - dragBase.m.y }
          const proj = v.x * dragBase.n.x + v.y * dragBase.n.y
          const [, trans] = ctx.edgeIdToTransition[id]
          trans.offset = dragBase.startOffset + (proj - dragBase.startProj)
        }
      }
      updateEdgeElement({ path, hitPath, arrow, edgeFO })
      ctx.tryOnChange(ctx.fsmState)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (!dragging)
        return
      dragging = false
      el.classList.remove('dragging')
      if (dragEl) {
        dragEl.style.cursor = ''
        dragEl = null
      }
      dragBase = null
      if (!moved)
        edgeInput.focus()
      else
        ctx.emitter.emit('edge:move-end', { id })
    }

    const startDrag = (e: PointerEvent, el: SVGGraphicsElement) => {
      if (e.button !== 0 || e.detail > 1)
        return
      if (ctx.fsmContainer.dataset.editMode !== 'default')
        return
      e.preventDefault()
      edgeInput.blur()
      moved = false
      downX = e.clientX
      downY = e.clientY
      const startNode = ctx.getNode(source)!
      const endNode = ctx.getNode(transition.to)!
      if (source !== transition.to) {
        const p0 = { x: startNode.x, y: startNode.y }
        const p3 = { x: endNode.x, y: endNode.y }
        const dir = unitVec(p3.x - p0.x, p3.y - p0.y)
        const n = perpLeft(dir)
        const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
        const pt = clientToSvg(ctx.svg, e.clientX, e.clientY)
        const v0 = { x: pt.x - m.x, y: pt.y - m.y }
        const startProj = v0.x * n.x + v0.y * n.y
        const startOffset = ctx.edgeIdToTransition[id][1].offset ?? 0
        dragBase = { m, n, startProj, startOffset }
      }
      else {
        dragBase = null
      }
      dragging = true
      el.classList.add('dragging')
      dragEl = el
      el.style.cursor = 'grabbing'
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp, { once: true })
    }

    hitPath.addEventListener('pointerdown', (e: PointerEvent) => startDrag(e, hitPath))
    arrow.addEventListener('pointerdown', (e: PointerEvent) => startDrag(e, arrow))

    const onClick = (e: MouseEvent) => {
      if (e.detail !== 1)
        return
      const mode = ctx.fsmContainer.dataset.editMode
      if (mode === 'remove') {
        removeEdge(ctx, id)
        return
      }
      if (e.metaKey || e.ctrlKey) {
        if (ctx.selectedEdgeIds.has(id))
          removeEdgeFromSelection(ctx, id)
        else
          addEdgeToSelection(ctx, id)
      }
      else {
        selectEdge(ctx, id)
      }
      if (moved) {
        moved = false
        return
      }
      edgeInput.focus()
    }
    path.addEventListener('click', onClick)
    arrow.addEventListener('click', onClick)
    hitPath.addEventListener('click', onClick)

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      removeEdge(ctx, id)
    }
    path.addEventListener('contextmenu', onContextMenu)
    hitPath.addEventListener('contextmenu', onContextMenu)
  }

  function updateEdgeElement({
    path,
    hitPath,
    arrow,
    edgeFO,
  }: { path: SVGPathElement, hitPath: SVGPathElement, arrow: SVGPolygonElement, edgeFO: SVGForeignObjectElement }) {
    const geom = computeEdgeGeom(ctx, id)
    path.setAttribute('d', geom.d)
    hitPath.setAttribute('d', geom.d)
    arrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
    const layout = computeLabelLayout(geom, getAutoAnchor(ctx, id), LABEL_NORMAL_OFFSET)
    const ew = edgeFO.width.animVal.value
    const eh = edgeFO.height.animVal.value
    const pos = edgeLabelFOPosition(layout, ew, eh)
    setFOBounds(edgeFO, pos.x, pos.y, ew, eh)
    const input = edgeFO.querySelector<HTMLInputElement>('input.fsm-input')
    if (input) {
      input.style.textAlign = textAnchorToAlign(layout.textAnchor)
    }
  }

  function edgeLabelFOPosition(
    layout: { pt: Vec2, textAnchor: 'start' | 'middle' | 'end' },
    ew: number,
    eh: number,
  ): { x: number, y: number } {
    let xPos = layout.pt.x - ew / 2
    if (layout.textAnchor === 'start')
      xPos = layout.pt.x
    else if (layout.textAnchor === 'end')
      xPos = layout.pt.x - ew
    return { x: xPos, y: layout.pt.y - eh / 2 }
  }
}

/**
 * Create the SVG `<mask>` used to punch node-shaped holes in edges passing behind nodes.
 * Registers live-update listeners so the mask tracks node position and creation/removal.
 */
export function createEdgeMasks(ctx: FSMContext): void {
  const mask = createSvgEl('mask')
  mask.setAttribute('id', ctx.maskId)
  mask.setAttribute('maskUnits', 'userSpaceOnUse')
  mask.setAttribute('maskContentUnits', 'userSpaceOnUse')
  // With maskUnits="userSpaceOnUse", percentage values (e.g. "100%") resolve against
  // the SVG viewport's pixel dimensions, not the current viewBox. When the user pans,
  // the viewBox origin shifts away from (0,0) and nodes/edges move into negative or
  // large-positive user-space coordinates — outside the mask rect — making them invisible.
  // Using a large fixed extent ensures the mask covers the full reachable canvas area
  // regardless of how far the user has panned.
  mask.setAttribute('x', '-100000')
  mask.setAttribute('y', '-100000')
  mask.setAttribute('width', '200000')
  mask.setAttribute('height', '200000')

  const bg = createSvgEl('rect')
  bg.setAttribute('x', '-100000')
  bg.setAttribute('y', '-100000')
  bg.setAttribute('width', '200000')
  bg.setAttribute('height', '200000')
  bg.setAttribute('fill', 'white')
  mask.appendChild(bg)

  ctx.emitter.on('node:added', ({ id, node }) => {
    createNodeMaskShape(id, node)
  })
  ctx.emitter.on('node:removed', ({ id }) => {
    mask.querySelector<SVGCircleElement>(`circle[data-node-id="${id}"]`)?.remove()
  })

  ctx.defs.appendChild(mask)

  function createNodeMaskShape(id: NodeId, node: { x: number, y: number, radius: number }) {
    const circle = createSvgEl('circle')
    circle.dataset.nodeId = id
    updateMaskCircle(node, circle)
    mask.appendChild(circle)
    ctx.emitter.on(
      `fsm:${id}-update-pos`,
      () => updateMaskCircle(node, circle),
      { signal: ctx.nodeAbortControllers[id].signal },
    )
  }

  function updateMaskCircle(node: { x: number, y: number, radius: number }, circle: SVGCircleElement) {
    circle.setAttribute('cx', `${node.x}`)
    circle.setAttribute('cy', `${node.y}`)
    circle.setAttribute('r', `${node.radius + 0.6}`)
    circle.setAttribute('fill', 'black')
  }
}
