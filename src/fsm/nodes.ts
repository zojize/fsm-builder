import type { FSMContext } from './context'
import type { Vec2 } from './math'
import type { FSMNode, FSMTransition, NodeId } from './types'
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
} from './dom'
import {
  computeNonSelfEdgeGeom,
  computeSelfEdgeGeom,
  createNewEdge,
} from './edges'
import { arrowHeadPoints, offsetFromDeviation, unitVec } from './math'
import { addNodeToSelection, removeNodeFromSelection, selectNode } from './selection'
import { cloneTemplate } from './templates'
import { runValidation } from './validation'

export { clearSelection } from './selection'

/** Move a node to an absolute position, updating DOM and emitting position events. */
export function moveNodeTo(ctx: FSMContext, id: NodeId, x: number, y: number): void {
  const OUTER_LABEL_GAP = 5
  const node = ctx.getNode(id)
  if (!node)
    return
  node.x = x
  node.y = y
  const circle = ctx.nodesGroup.querySelector<SVGCircleElement>(
    `g.fsm-node[data-node-id="${id}"] circle.fsm-node-circle`,
  )
  if (circle) {
    circle.setAttribute('cx', `${x}`)
    circle.setAttribute('cy', `${y}`)
  }
  const innerFO = ctx.svg.querySelector<SVGForeignObjectElement>(
    `foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`,
  )
  if (innerFO) {
    const ew = node.radius * 2
    setFOBounds(innerFO, x - ew / 2, y - 20, ew, 40)
  }
  const outerFO = ctx.svg.querySelector<SVGForeignObjectElement>(
    `foreignObject.fsm-node-label-editor[data-node-id="${id}"]`,
  )
  if (outerFO) {
    const ew = outerFO.width.baseVal.value
    const oyAnchor = y + node.radius + 12 + OUTER_LABEL_GAP
    outerFO.setAttribute('x', `${x - ew / 2}`)
    outerFO.setAttribute('y', `${oyAnchor - 20}`)
  }
  ctx.emitter.emit(`fsm:${id}-update-pos`, node)
  ctx.emitter.emit('node:moved', { id, node })
}

/** Focus the inner-label `<input>` for `id`, enabling pointer events until it blurs. */
export function focusInnerNodeInput(ctx: FSMContext, id: NodeId): void {
  const innerFO = ctx.overlay.querySelector<SVGForeignObjectElement>(
    `foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`,
  )
  const input = innerFO?.querySelector<HTMLInputElement>('input.fsm-input')
  if (!input)
    return
  input.style.pointerEvents = 'auto'
  input.focus()
  input.select()
  input.addEventListener('blur', () => {
    input.style.pointerEvents = 'none'
  }, { once: true })
}

/** Toggle whether `id` is the start state, emitting `start:changed` and re-validating. */
export function toggleStartState(ctx: FSMContext, id: NodeId): void {
  if (ctx.fsmState.start === id) {
    delete ctx.fsmState.start
    ctx.emitter.emit('start:changed', { start: undefined })
  }
  else {
    ctx.fsmState.start = id
    ctx.emitter.emit('start:changed', { start: id })
  }
  ctx.tryOnChange(ctx.fsmState)
  if (ctx.validationEnabled)
    runValidation(ctx, !ctx.autoValidate)
}

/** Return the id of the node whose bounding circle contains `pt`, or `undefined` if none. */
export function findNodeAtPt(ctx: FSMContext, pt: Vec2): NodeId | undefined {
  let best: { id: NodeId, d: number } | undefined
  for (const [id, node] of Object.entries(ctx.fsmState.nodes)) {
    const d = Math.hypot(pt.x - node.x, pt.y - node.y)
    if (d <= node.radius + ctx.options.defaultRadius) {
      if (!best || d < best.d)
        best = { id: id as NodeId, d }
    }
  }
  return best?.id
}

/** Remove a node and all its edges, cleaning up DOM elements and abort controllers. */
export function removeNode(ctx: FSMContext, id: NodeId): void {
  // Suppress history captures during cascade so all connected-edge removals
  // are batched with the node removal into a single undo entry.
  const prevSuppress = ctx.suppressHistoryCapture
  ctx.suppressHistoryCapture = true
  ctx.emitter.emit(`fsm:${id}-remove`, undefined)
  ctx.suppressHistoryCapture = prevSuppress

  const abortController = ctx.nodeAbortControllers[id]
  if (abortController) {
    abortController.abort()
    delete ctx.nodeAbortControllers[id]
  }
  else if (ctx.options.debug) {
    console.warn(`FSM: could not find abort controller for node ${id}`)
  }

  delete ctx.fsmState.nodes[id]
  ctx.nodesGroup.querySelector<SVGGElement>(`g.fsm-node[data-node-id="${id}"]`)?.remove()
  ctx.overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)?.remove()
  ctx.overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-label-editor[data-node-id="${id}"]`)?.remove()

  ctx.emitter.emit('node:removed', { id })
  if (ctx.validationEnabled)
    runValidation(ctx, !ctx.autoValidate)
  ctx.tryOnChange(ctx.fsmState)
}

/**
 * Create an SVG node group with circle, label editors, and interaction handlers.
 * Appends to the nodes layer, emits `node:added`, and returns the group element.
 */
export function createNewNode(ctx: FSMContext, id: NodeId, node: FSMNode): SVGGElement {
  const OUTER_LABEL_GAP = 5

  const el = createNodeEl()
  initializeNodeLabelEditors()
  if (!ctx.options.readonly) {
    initializeNodeInteraction(el)
  }
  ctx.nodesGroup.appendChild(el)
  if (ctx.validationEnabled)
    runValidation(ctx, !ctx.autoValidate)
  ctx.emitter.emit('node:added', { id, node })
  return el

  // Inner helpers

  function createNodeEl(): SVGGElement {
    let g = ctx.svg.querySelector<SVGGElement>(`g[data-node-id="${id}"]`)
    if (!g) {
      const frag = cloneTemplate(ctx.templates, 'fsm-node')
      g = frag.querySelector('g')! as SVGGElement
      g.dataset.nodeId = id
    }
    let circle = g.querySelector<SVGCircleElement>('circle')
    if (!circle) {
      circle = cloneTemplate(ctx.templates, 'fsm-node').querySelector('circle')! as SVGCircleElement
      g.appendChild(circle)
    }
    circle.setAttribute('cx', `${node.x}`)
    circle.setAttribute('cy', `${node.y}`)
    circle.setAttribute('r', `${node.radius}`)
    return g
  }

  function initializeNodeLabelEditors() {
    // Inner label (centered inside circle)
    let innerFO = ctx.svg.querySelector<SVGForeignObjectElement>(
      `foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`,
    )
    const ewInner = node.radius * 2
    const ehInner = 40
    const ix = node.x - ewInner / 2
    const iy = node.y - ehInner / 2
    if (!innerFO) {
      innerFO = createSvgEl('foreignObject')
      innerFO.classList.add('fsm-node-inner-editor')
      innerFO.dataset.nodeId = id
      const fontSize = getFontSize((ctx.fsmState.nodes[id].innerLabel || '').length, ctx.options.fontSizeBreakpoints?.innerNode, ctx.defaultInnerNodeFontSize)
      if (ctx.options.readonly) {
        const text = createFOText(ctx.templates, ctx.fsmState.nodes[id].innerLabel || '', fontSize, 'center')
        innerFO.appendChild(text)
      }
      else {
        const input = cloneTemplate(ctx.templates, 'fsm-input').querySelector('input')! as HTMLInputElement
        input.dataset.validateType = 'innerNode'
        if (ctx.validationEnabled) {
          const validateConfig = ctx.validateConfig
          const attrs = (validateConfig as any)?.innerNode?.inputAttributes
          applyInputAttributes(input, attrs)
        }
        input.style.fontSize = fontSize
        input.style.textAlign = 'center'
        input.style.pointerEvents = 'none'
        input.value = ctx.fsmState.nodes[id].innerLabel || ''
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === 'Escape') {
            ev.preventDefault()
            ev.stopPropagation()
            input.blur()
          }
        })
        stopPointerEventPropagation(input)
        let prevState = saveInputState(input)
        input.addEventListener('selectionchange', () => void (prevState = saveInputState(input)))
        input.addEventListener('input', (ev) => {
          if (editIsInvalid(ev)) {
            restoreInputState(input, prevState)
            return
          }
          prevState = saveInputState(input)
          const n = ctx.getNode(id)
          if (n)
            n.innerLabel = input.value
          input.style.fontSize = getFontSize(input.value.length, ctx.options.fontSizeBreakpoints?.innerNode, ctx.defaultInnerNodeFontSize)
          ctx.tryOnChange(ctx.fsmState)
          const currentNode = ctx.getNode(id)
          if (currentNode)
            ctx.emitter.emit('node:changed', { id, node: currentNode })
          if (ctx.validationEnabled)
            runValidation(ctx, !ctx.autoValidate)
        })
        input.addEventListener('blur', () => {
          ctx.emitter.emit('node:committed', { id })
        })
        innerFO.appendChild(input)
      }
      ctx.overlay.appendChild(innerFO)
    }
    setFOBounds(innerFO, ix, iy, ewInner, ehInner)
    if (!ctx.options.readonly) {
      const innerInput = innerFO.querySelector<HTMLInputElement>('input.fsm-input')
      if (innerInput && document.activeElement !== innerInput) {
        innerInput.value = ctx.fsmState.nodes[id].innerLabel || ''
        innerInput.style.fontSize = getFontSize(innerInput.value.length, ctx.options.fontSizeBreakpoints?.innerNode, ctx.defaultInnerNodeFontSize)
      }
    }

    // Outer label (below circle)
    let outerFO = ctx.svg.querySelector<SVGForeignObjectElement>(
      `foreignObject.fsm-node-label-editor[data-node-id="${id}"]`,
    )
    const fontSize = getFontSize((node.label || '').length, ctx.options.fontSizeBreakpoints?.outerNode, ctx.defaultOuterNodeFontSize)
    const ewOuter = getTextWidth(node.label || 'label', `${fontSize} normal ${ctx.options.fontFamily}`)
    const ehOuter = 40
    const oyAnchor = node.y + node.radius + 12 + OUTER_LABEL_GAP
    const ox = node.x - ewOuter / 2
    const oy = oyAnchor - ehOuter / 2
    if (!outerFO) {
      outerFO = createSvgEl('foreignObject')
      outerFO.classList.add('fsm-node-label-editor')
      outerFO.dataset.nodeId = id
      if (ctx.options.readonly) {
        const text = createFOText(ctx.templates, node.label || '', fontSize, 'center')
        outerFO.appendChild(text)
      }
      else {
        const input = cloneTemplate(ctx.templates, 'fsm-input').querySelector('input')! as HTMLInputElement
        outerFO.addEventListener('click', () => input.focus())
        input.dataset.validateType = 'outerNode'
        if (ctx.validationEnabled) {
          const validateConfig = ctx.validateConfig
          const attrs = (validateConfig as any)?.outerNode?.inputAttributes
          applyInputAttributes(input, attrs)
        }
        input.style.fontSize = fontSize
        input.style.textAlign = 'center'
        input.value = node.label.length === 0 ? 'label' : node.label
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === 'Escape') {
            ev.preventDefault()
            ev.stopPropagation()
            input.blur()
          }
        })
        stopPointerEventPropagation(input)
        let prevState = saveInputState(input)
        input.addEventListener('selectionchange', () => void (prevState = saveInputState(input)))
        input.addEventListener('input', (ev) => {
          if (editIsInvalid(ev)) {
            restoreInputState(input, prevState)
            return
          }
          prevState = saveInputState(input)
          const n = ctx.getNode(id)
          if (n)
            n.label = input.value
          const newFontSize = getFontSize(input.value.length, ctx.options.fontSizeBreakpoints?.outerNode, ctx.defaultOuterNodeFontSize)
          input.style.fontSize = newFontSize
          const width = getTextWidth(input.value || 'label', `${newFontSize} normal ${ctx.options.fontFamily}`)
          const x = node.x - width / 2
          outerFO!.setAttribute('width', `${width}`)
          outerFO!.setAttribute('x', `${x}`)
          ctx.tryOnChange(ctx.fsmState)
          const currentNode = ctx.getNode(id)
          if (currentNode)
            ctx.emitter.emit('node:changed', { id, node: currentNode })
          if (ctx.validationEnabled)
            runValidation(ctx, !ctx.autoValidate)
        })
        input.addEventListener('blur', () => {
          ctx.emitter.emit('node:committed', { id })
        })
        outerFO.appendChild(input)
      }
      ctx.overlay.appendChild(outerFO)
    }
    setFOBounds(outerFO, ox, oy, ewOuter, ehOuter)
  }

  function addTransitionInternal({
    from,
    to,
    label,
    offset = 0,
    rotation,
  }: { from: NodeId, to: NodeId, label: string, offset?: number, rotation?: number }) {
    const fromNode = ctx.getNode(from)
    const toNode = ctx.getNode(to)
    if (!fromNode || !toNode)
      return
    const trans: FSMTransition = { to, label, offset, rotation }
    fromNode.transitions.push(trans)
    const edgeId = createNewEdge(ctx, from, trans)
    ctx.tryOnChange(ctx.fsmState)
    const edgeInput = ctx.overlay.querySelector<HTMLInputElement>(
      `foreignObject.fsm-edge-label-editor[data-edge-id="${edgeId}"] input.fsm-input`,
    )
    if (edgeInput) {
      edgeInput.style.pointerEvents = 'auto'
      requestAnimationFrame(() => edgeInput.focus())
    }
  }

  function initializeNodeInteraction(g: SVGGElement) {
    let dragging = false
    let moved = false
    let dragStartX = 0
    let dragStartY = 0
    let offX = 0
    let offY = 0
    let changeScheduled = false
    let wasSelectedOnDown = false

    const startLink = (e: PointerEvent): boolean => {
      const mode = ctx.fsmContainer.dataset.editMode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey)
        return false
      if (!(e.shiftKey || mode === 'link'))
        return false

      const start = { x: node.x, y: node.y }
      const liveRadius = node.radius

      const frag = cloneTemplate(ctx.templates, 'fsm-edge-preview')
      const previewG = frag.querySelector('g')! as SVGGElement
      previewG.setAttribute('mask', `url(#${ctx.maskId})`)
      const previewPath = previewG.querySelector('path')! as SVGPathElement
      const previewArrow = previewG.querySelector('polygon')! as SVGPolygonElement
      ctx.svg.appendChild(previewG)

      const onMoveLink = (ev: PointerEvent) => {
        const pt = clientToSvg(ctx.svg, ev.clientX, ev.clientY)
        const dir = unitVec(pt.x - start.x, pt.y - start.y)
        const fromBoundary = { x: start.x + liveRadius * dir.x, y: start.y + liveRadius * dir.y }
        const hoverId = findNodeAtPt(ctx, pt)
        if (hoverId) {
          if (hoverId === id) {
            const ang = Math.atan2(pt.y - start.y, pt.x - start.x)
            const geom = computeSelfEdgeGeom(start, liveRadius, (ang * 180) / Math.PI)
            previewPath.setAttribute('d', geom.d)
            previewArrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
          }
          else {
            const target = ctx.getNode(hoverId)!
            const offset = offsetFromDeviation(start, { x: target.x, y: target.y }, pt)
            const geom = computeNonSelfEdgeGeom(start, { x: target.x, y: target.y }, target.radius, offset)
            previewPath.setAttribute('d', geom.d)
            previewArrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
          }
        }
        else {
          previewPath.setAttribute('d', `M ${fromBoundary.x} ${fromBoundary.y} L ${pt.x} ${pt.y}`)
          const tangUnit = unitVec(pt.x - fromBoundary.x, pt.y - fromBoundary.y)
          previewArrow.setAttribute('points', arrowHeadPoints(pt, tangUnit))
        }
      }

      const onUpLink = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMoveLink)
        window.removeEventListener('pointerup', onUpLink)
        const pt = clientToSvg(ctx.svg, ev.clientX, ev.clientY)
        const toId = findNodeAtPt(ctx, pt)
        previewG.remove()
        if (toId) {
          if (toId === id) {
            const ang = Math.atan2(pt.y - start.y, pt.x - start.x)
            addTransitionInternal({ from: id, to: id, label: '', rotation: (ang * 180) / Math.PI })
          }
          else {
            const target = ctx.getNode(toId)!
            const offset = offsetFromDeviation(start, { x: target.x, y: target.y }, pt)
            addTransitionInternal({ from: id, to: toId, label: '', offset })
          }
          ctx.fsmContainer.dataset.editMode = 'default'
          if (ctx.validationEnabled)
            runValidation(ctx, !ctx.autoValidate)
        }
      }

      window.addEventListener('pointermove', onMoveLink)
      window.addEventListener('pointerup', onUpLink, { once: true })
      return true
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging)
        return
      const pt = clientToSvg(ctx.svg, e.clientX, e.clientY)
      let nx = pt.x - offX
      let ny = pt.y - offY
      if (!moved) {
        const dx = nx - dragStartX
        const dy = ny - dragStartY
        if (Math.hypot(dx, dy) > 1.8)
          moved = true
      }
      // Snap to other nodes' center coordinates
      const snap = ctx.options.snapDistance
      if (snap > 0) {
        let snappedX = false
        let snappedY = false
        for (const [otherId, other] of Object.entries(ctx.fsmState.nodes)) {
          if (otherId === id || ctx.selectedNodeIds.has(otherId))
            continue
          if (!snappedX && Math.abs(nx - other.x) <= snap) {
            nx = other.x
            snappedX = true
          }
          if (!snappedY && Math.abs(ny - other.y) <= snap) {
            ny = other.y
            snappedY = true
          }
          if (snappedX && snappedY)
            break
        }
      }

      // Compute delta before moving primary node
      const dx = nx - node.x
      const dy = ny - node.y
      moveNodeTo(ctx, id, nx, ny)
      // Move other selected nodes by the same delta
      if (ctx.selectedNodeIds.has(id) && ctx.selectedNodeIds.size > 1) {
        for (const otherId of ctx.selectedNodeIds) {
          if (otherId === id)
            continue
          const other = ctx.getNode(otherId)
          if (other)
            moveNodeTo(ctx, otherId, other.x + dx, other.y + dy)
        }
      }
      if (!changeScheduled) {
        changeScheduled = true
        requestAnimationFrame(() => {
          changeScheduled = false
          ctx.tryOnChange(ctx.fsmState)
        })
      }
    }

    const onPointerUp = () => {
      if (!dragging)
        return
      dragging = false
      g.classList.remove('dragging')
      window.removeEventListener('pointermove', onPointerMove)
      ctx.tryOnChange(ctx.fsmState)
      if (moved)
        ctx.emitter.emit('node:move-end', { id, node })
    }

    g.addEventListener('pointerdown', (e) => {
      const mode = ctx.fsmContainer.dataset.editMode
      if (startLink(e))
        return
      if (mode !== 'default')
        return

      wasSelectedOnDown = ctx.selectedNodeIds.has(id)
      // Cmd/Ctrl+click: add to selection (toggle-off deferred to click)
      if (e.metaKey || e.ctrlKey) {
        if (!wasSelectedOnDown)
          addNodeToSelection(ctx, id)
      }
      else if (!wasSelectedOnDown) {
        // Normal click on unselected node: replace selection
        selectNode(ctx, id)
      }

      const pt = clientToSvg(ctx.svg, e.clientX, e.clientY)
      const liveNode = ctx.getNode(id)!
      offX = pt.x - liveNode.x
      offY = pt.y - liveNode.y
      moved = false
      dragStartX = liveNode.x
      dragStartY = liveNode.y
      dragging = true
      g.classList.add('dragging')
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp, { once: true })
    })

    g.addEventListener('dblclick', () => {
      if (ctx.fsmContainer.dataset.editMode !== 'default')
        return
      if (moved)
        return
      toggleStartState(ctx, id)
    })

    g.addEventListener('click', (e) => {
      const mode = ctx.fsmContainer.dataset.editMode
      if (mode === 'remove') {
        removeNode(ctx, id)
        return
      }
      if (moved) {
        moved = false
        return
      }
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+click: toggle off if was already selected before pointerdown
        if (wasSelectedOnDown)
          removeNodeFromSelection(ctx, id)
        // else: already added in pointerdown
        return
      }
      // Normal click: collapse to single selection
      selectNode(ctx, id)
      if (mode !== 'default')
        return
      if (e.detail !== 1)
        return
      const innerFO = ctx.svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)
      if (innerFO) {
        const input = innerFO.querySelector('input') as HTMLInputElement | null
        input?.focus()
      }
    })

    g.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      removeNode(ctx, id)
    })
  }
}

/** Create the start-state arrow group and wire up typed emitter listeners for start, move, and remove events. */
export function createStartMarker(ctx: FSMContext): void {
  const startId = ctx.fsmState.start
  let g = ctx.svg.querySelector<SVGGElement>('g.fsm-start')
  if (!g) {
    g = createSvgEl('g')
    g.classList.add('fsm-start')
    ctx.svg.insertBefore(g, ctx.svg.lastChild)
  }
  const line = createSvgEl('path')
  const arrow = createSvgEl('polygon')
  line.setAttribute('visibility', startId ? 'visible' : 'hidden')
  arrow.setAttribute('visibility', startId ? 'visible' : 'hidden')
  g.appendChild(line)
  g.appendChild(arrow)

  ctx.emitter.on('start:changed', ({ start }) => {
    if (!start) {
      line.setAttribute('visibility', 'hidden')
      arrow.setAttribute('visibility', 'hidden')
      return
    }
    const node = ctx.getNode(start)
    if (node) {
      line.setAttribute('visibility', 'visible')
      arrow.setAttribute('visibility', 'visible')
      updateStartMarker(node)
    }
  })

  ctx.emitter.on('node:moved', ({ id, node }) => {
    if (id === ctx.fsmState.start)
      updateStartMarker(node)
  })

  ctx.emitter.on('node:removed', ({ id }) => {
    if (id === ctx.fsmState.start) {
      delete ctx.fsmState.start
      ctx.emitter.emit('start:changed', { start: undefined })
    }
  })

  if (startId) {
    const startNode = ctx.getNode(startId)
    if (startNode)
      updateStartMarker(startNode)
  }

  function updateStartMarker(node: FSMNode) {
    const s = { x: node.x - node.radius - 40, y: node.y }
    const tip = { x: node.x - node.radius, y: node.y }
    const dir = unitVec(tip.x - s.x, tip.y - s.y)
    line.setAttribute('d', `M ${s.x} ${s.y} L ${tip.x} ${tip.y}`)
    line.classList.add('fsm-start-line')
    arrow.classList.add('fsm-start-arrow')
    arrow.setAttribute('points', arrowHeadPoints(tip, dir, 13, 13))
  }
}
