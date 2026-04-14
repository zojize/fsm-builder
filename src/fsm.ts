import type { FSMContext } from './fsm/context'
import type { FSMBuilderAPI } from './fsm/events'
import type { EdgeId, FSMNode, FSMOptions, FSMState, NodeId } from './fsm/types'
import { clientToSvg, createSvgEl } from './fsm/dom'
import { createEdgeMasks, createNewEdge, removeEdge } from './fsm/edges'
import { createEventEmitter } from './fsm/events'
import { createHistory } from './fsm/history'
import { createNewNode, createStartMarker, findNodeAtPt, focusInnerNodeInput, removeNode } from './fsm/nodes'
import { clearSelection, emitSelectionChanged, syncNodeSelection } from './fsm/selection'
import { createSidebar } from './fsm/sidebar'
import { createSimulation } from './fsm/simulation'
import { initTemplates } from './fsm/templates'
import { runValidation } from './fsm/validation'

export type { FSMBuilderAPI, FSMEventHandler, FSMEventMap } from './fsm/events'
export type { EdgeId, FSMNode, FSMOptions, FSMState, FSMTransition, NodeId, ValidateOptions } from './fsm/types'

/** Default option values merged with caller-supplied {@link FSMOptions}. */
const defaultFSMOptions = {
  container: undefined!,
  svgAttributes: {},
  initialState: { nodes: {} },
  defaultRadius: 30,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Roboto Mono", "Noto Sans Mono", monospace',
  fontSizeBreakpoints: {
    edge: { 5: '18px', 8: '15px' },
    innerNode: { 3: '19px', 5: '16px' },
    outerNode: { 15: '19px', 25: '16px' },
  },
  validate: false,
  autoValidate: false,
  sidebar: true,
  readonly: false,
  debug: false,
  scale: 1,
  simulation: false,
} satisfies FSMOptions

/**
 * Initialise an FSM builder in the given container.
 *
 * Returns a {@link FSMBuilderAPI} that exposes:
 * - `on(event, handler)` / `off(event, handler)` – typed event subscription
 * - `getState()` – read-only access to the current FSM state
 * - `destroy()` – tear down the FSM builder
 */
export function createFSMBuilder({
  container,
  svgAttributes = defaultFSMOptions.svgAttributes,
  initialState = defaultFSMOptions.initialState,
  defaultRadius = defaultFSMOptions.defaultRadius,
  fontFamily = defaultFSMOptions.fontFamily,
  readonly = defaultFSMOptions.readonly,
  debug = defaultFSMOptions.debug,
  validate = defaultFSMOptions.validate,
  autoValidate = defaultFSMOptions.autoValidate,
  sidebar = defaultFSMOptions.sidebar,
  fontSizeBreakpoints = defaultFSMOptions.fontSizeBreakpoints,
  scale = defaultFSMOptions.scale,
  simulation = defaultFSMOptions.simulation,
  maxHistory,
  onChange,
}: FSMOptions = defaultFSMOptions): FSMBuilderAPI {
  if (!container)
    throw new Error('FSM: container selector is required')

  const fsmContainer = document.querySelector<HTMLElement>(container)!
  if (!fsmContainer)
    throw new Error(`FSM: Element with selector ${container} not found`)

  fsmContainer.classList.add('fsm-builder')

  fontSizeBreakpoints.edge ??= defaultFSMOptions.fontSizeBreakpoints.edge
  fontSizeBreakpoints.innerNode ??= defaultFSMOptions.fontSizeBreakpoints.innerNode
  fontSizeBreakpoints.outerNode ??= defaultFSMOptions.fontSizeBreakpoints.outerNode

  const validationEnabled = validate !== false
  const emitter = createEventEmitter()

  const fsmState: FSMState = initialState

  const { svg, defs, overlay, edgesGroup, nodesGroup } = initializeSvg(fsmContainer)

  let nodeIdCounter = 0
  const createNodeId = (): NodeId => {
    let id = `node-${nodeIdCounter++}`
    while (id in fsmState.nodes)
      id = `node-${nodeIdCounter++}`
    return id
  }

  let edgeIdCounter = 0
  const edgeIdToTransition: FSMContext['edgeIdToTransition'] = {}
  const createEdgeId = (): EdgeId => {
    let id = `edge-${edgeIdCounter++}`
    while (id in edgeIdToTransition)
      id = `edge-${edgeIdCounter++}`
    return id
  }

  const nodeAbortControllers: Record<NodeId, AbortController> = {}
  for (const id of Object.keys(fsmState.nodes)) {
    nodeAbortControllers[id] = new AbortController()
  }

  let onChangeTimeoutId: number | undefined
  const tryOnChange = (state: FSMState) => {
    clearTimeout(onChangeTimeoutId)
    onChangeTimeoutId = window.setTimeout(() => {
      try {
        onChange?.(state)
        emitter.emit('change', state)
      }
      catch (error) {
        if (debug)
          console.error('FSM: onChange error', error)
      }
    })
  }

  // Build the shared context object passed into every sub-module
  const ctx: FSMContext = {
    options: {
      container,
      svgAttributes,
      initialState,
      defaultRadius,
      fontFamily,
      readonly,
      debug,
      validate,
      autoValidate,
      sidebar,
      fontSizeBreakpoints,
      scale,
      simulation,
      maxHistory,
      onChange,
    },
    validateConfig: validate,
    validationEnabled,
    autoValidate: validationEnabled && autoValidate,
    fsmContainer,
    svg,
    defs,
    edgesGroup,
    nodesGroup,
    overlay,
    templates: initTemplates(),
    maskId: `edge-mask-${Math.random().toString(16).slice(2)}`,
    fsmState,
    nodeAbortControllers,
    edgeIdToTransition,
    createNodeId,
    createEdgeId,
    getNode: (id: NodeId) => id in fsmState.nodes ? fsmState.nodes[id] : undefined,
    selectedNodeIds: new Set(),
    selectedEdgeIds: new Set(),
    emitter,
    validationEl: null,
    destroyCallbacks: [],
    tryOnChange,
    suppressHistoryCapture: false,
    history: null,
    simulation: null,
    defaultEdgeFontSize: '20px',
    defaultInnerNodeFontSize: '23px',
    defaultOuterNodeFontSize: '25px',
  }

  fsmContainer.dataset.editMode = 'default'

  if (!readonly)
    registerGlobalEvents()

  fsmContainer.style.setProperty('--fsm-font-family', fontFamily)

  createEdgeMasks(ctx)

  // render edges before nodes so nodes paint on top
  for (const [source, node] of Object.entries(fsmState.nodes)) {
    for (const transition of node.transitions) {
      createNewEdge(ctx, source, transition)
    }
  }

  for (const [id, node] of Object.entries(fsmState.nodes)) {
    createNewNode(ctx, id, node)
  }

  createStartMarker(ctx)

  ctx.history = !readonly ? createHistory(ctx, loadState, maxHistory) : null

  function addNodeAt(pt: { x: number, y: number }): NodeId {
    const id = createNodeId()
    const node: FSMNode = {
      label: 'label',
      innerLabel: '',
      x: pt.x,
      y: pt.y,
      radius: defaultRadius,
      transitions: [],
    }
    fsmState.nodes[id] = node
    nodeAbortControllers[id] = new AbortController()
    createNewNode(ctx, id, node)
    tryOnChange(fsmState)
    focusInnerNodeInput(ctx, id)
    return id
  }

  if (!readonly && (debug || sidebar))
    createSidebar(fsmContainer, ctx, id => removeNode(ctx, id))

  if (simulation) {
    ctx.simulation = createSimulation(ctx)
    ctx.destroyCallbacks.push(() => ctx.simulation?.destroy())
  }

  function loadState(snapshot: FSMState): void {
    clearSelection(ctx)

    // Remove all nodes (cascades to remove all edges via fsm:${id}-remove listeners)
    for (const nodeId of Object.keys(ctx.fsmState.nodes)) {
      removeNode(ctx, nodeId)
    }

    // Populate state in-place (preserve object identity)
    ctx.fsmState.start = snapshot.start
    for (const [id, node] of Object.entries(snapshot.nodes)) {
      ctx.fsmState.nodes[id] = node
      ctx.nodeAbortControllers[id] = new AbortController()
    }

    // Re-render (same order as init: edges first, then nodes)
    for (const [source, node] of Object.entries(ctx.fsmState.nodes)) {
      for (const transition of node.transitions) {
        createNewEdge(ctx, source, transition)
      }
    }
    for (const [id, node] of Object.entries(ctx.fsmState.nodes)) {
      createNewNode(ctx, id, node)
    }
    if (ctx.fsmState.start) {
      ctx.emitter.emit('start:changed', { start: ctx.fsmState.start })
    }

    tryOnChange(ctx.fsmState)
    if (validationEnabled)
      runValidation(ctx, !ctx.autoValidate)
  }

  // Mount validation UI if enabled
  if (validationEnabled && !readonly) {
    let validationContainer = fsmContainer
    if (validate && validate.container) {
      const sel = validate.container
      validationContainer = document.querySelector<HTMLElement>(sel) ?? fsmContainer
      if (validationContainer === fsmContainer && debug) {
        console.warn(`FSM: validation container ${sel} not found, using default`)
      }
    }
    if (validationContainer !== fsmContainer) {
      validationContainer.style.setProperty('--fsm-font-family', fontFamily)
    }
    ctx.validationEl = document.createElement('div')
    ctx.validationEl.className = 'fsm-validation'
    validationContainer.appendChild(ctx.validationEl)
    if (autoValidate)
      runValidation(ctx)
  }

  const api: FSMBuilderAPI = {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    getState: () => ctx.fsmState,
    destroy: () => {
      for (const cb of ctx.destroyCallbacks)
        cb()
      ctx.validationEl?.remove()
      svg.remove()
    },
    undo: () => ctx.history?.undo(),
    redo: () => ctx.history?.redo(),
  }

  return api

  /** Create and configure the SVG root and layer groups, appending to `container`. */
  function initializeSvg(container: HTMLElement) {
    const svg = createSvgEl('svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    const rect = container.getBoundingClientRect()
    const aspectRatio = rect.height === 0 ? 1 : rect.width / rect.height
    const baseHeight = 600 / scale
    svg.setAttribute('viewBox', `0 0 ${baseHeight * aspectRatio} ${baseHeight}`)
    for (const [key, value] of Object.entries(svgAttributes)) {
      svg.setAttribute(key, value)
    }
    container.appendChild(svg)

    let defs = svg.querySelector('defs')
    if (!defs) {
      defs = createSvgEl('defs')
      svg.appendChild(defs)
    }

    let edgesGroup = svg.querySelector<SVGGElement>('g.fsm-edges')
    if (!edgesGroup) {
      edgesGroup = createSvgEl('g')
      edgesGroup.classList.add('fsm-edges')
      svg.appendChild(edgesGroup)
    }

    let overlay = svg.querySelector<SVGGElement>('g.fsm-overlays')
    if (!overlay) {
      overlay = createSvgEl('g')
      overlay.classList.add('fsm-overlays')
      svg.appendChild(overlay)
    }

    let nodesGroup = svg.querySelector<SVGGElement>('g.fsm-nodes')
    if (!nodesGroup) {
      nodesGroup = createSvgEl('g')
      nodesGroup.classList.add('fsm-nodes')
      svg.appendChild(nodesGroup)
    }

    return { svg, defs, edgesGroup, nodesGroup, overlay }
  }

  /** Register all top-level pointer, keyboard, and resize event handlers for the FSM editor. */
  function registerGlobalEvents() {
    fsmContainer.setAttribute('tabindex', '-1')
    fsmContainer.style.outline = 'none'

    svg.addEventListener('pointerdown', () => fsmContainer.focus())

    // Background click: clear selection, or drag to box-select nodes (live)
    svg.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.target !== svg)
        return
      const mode = fsmContainer.dataset.editMode
      if (mode !== 'default')
        return
      if ((e.metaKey || e.ctrlKey) && e.shiftKey)
        return // pan mode handled elsewhere

      const startPt = clientToSvg(svg, e.clientX, e.clientY)
      const additive = e.metaKey || e.ctrlKey
      // Snapshot the selection at drag start so additive box-select merges with it
      const baseNodeIds = new Set(additive ? ctx.selectedNodeIds : [])
      let hasMoved = false
      let boxRect: SVGRectElement | null = null

      const updateBoxSelection = (x1: number, y1: number, x2: number, y2: number) => {
        const target = new Set(baseNodeIds)
        for (const [nodeId, node] of Object.entries(fsmState.nodes)) {
          if (node.x >= x1 && node.x <= x2 && node.y >= y1 && node.y <= y2)
            target.add(nodeId)
        }
        syncNodeSelection(ctx, target)
        emitSelectionChanged(ctx)
      }

      const onMove = (ev: PointerEvent) => {
        const pt = clientToSvg(svg, ev.clientX, ev.clientY)
        if (!hasMoved) {
          if (Math.hypot(pt.x - startPt.x, pt.y - startPt.y) < 3)
            return
          hasMoved = true
          if (!additive)
            clearSelection(ctx)
          boxRect = createSvgEl('rect')
          boxRect.classList.add('fsm-box-selector')
          svg.appendChild(boxRect)
        }
        if (boxRect) {
          const bx = Math.min(startPt.x, pt.x)
          const by = Math.min(startPt.y, pt.y)
          const bw = Math.abs(pt.x - startPt.x)
          const bh = Math.abs(pt.y - startPt.y)
          boxRect.setAttribute('x', `${bx}`)
          boxRect.setAttribute('y', `${by}`)
          boxRect.setAttribute('width', `${bw}`)
          boxRect.setAttribute('height', `${bh}`)
          updateBoxSelection(bx, by, bx + bw, by + bh)
        }
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        if (!hasMoved) {
          // Simple background click → clear selection
          clearSelection(ctx)
        }
        boxRect?.remove()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    })

    // Track input values on focus so we can decide between native vs FSM undo
    fsmContainer.addEventListener('focusin', (e: FocusEvent) => {
      const target = e.target
      if (target instanceof HTMLInputElement && target.classList.contains('fsm-input'))
        target.dataset.focusValue = target.value
    })

    // Undo/redo keyboard shortcuts
    if (!readonly) {
      fsmContainer.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey))
          return
        if (e.key === 'z' || e.key === 'y') {
          const active = document.activeElement
          if (active instanceof HTMLInputElement && fsmContainer.contains(active)) {
            if (active.value !== (active.dataset.focusValue ?? ''))
              return
          }
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            ctx.history?.undo()
          }
          else if ((e.shiftKey && e.key === 'z') || e.key === 'y') {
            e.preventDefault()
            ctx.history?.redo()
          }
          // Keep focus on container for consecutive undo/redo presses
          fsmContainer.focus()
        }
      })
    }

    // Delete key removes all selected elements
    fsmContainer.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Delete')
        return
      const active = document.activeElement
      if (active && !fsmContainer.contains(active))
        return
      if (ctx.selectedNodeIds.size === 0 && ctx.selectedEdgeIds.size === 0)
        return
      e.preventDefault()
      const nodeIds = [...ctx.selectedNodeIds]
      const edgeIds = [...ctx.selectedEdgeIds]
      clearSelection(ctx)
      // Batch all removals into a single history entry
      ctx.suppressHistoryCapture = true
      for (const edgeId of edgeIds) {
        if (edgeId in ctx.edgeIdToTransition)
          removeEdge(ctx, edgeId)
      }
      for (const nodeId of nodeIds) {
        if (nodeId in ctx.fsmState.nodes)
          removeNode(ctx, nodeId)
      }
      ctx.suppressHistoryCapture = false
      // Trigger a single history capture after all removals
      if (nodeIds.length > 0)
        ctx.emitter.emit('node:removed', { id: nodeIds.at(-1)! })
      else if (edgeIds.length > 0)
        ctx.emitter.emit('edge:removed', { id: edgeIds.at(-1)! })
    })

    // Viewport pan state
    let panX = 0
    let panY = 0

    function updateViewBox() {
      const rect = fsmContainer.getBoundingClientRect()
      const aspectRatio = rect.height === 0 ? 1 : rect.width / rect.height
      const baseHeight = 600 / scale
      svg.setAttribute('viewBox', `${panX} ${panY} ${baseHeight * aspectRatio} ${baseHeight}`)
    }

    const resizeObserver = new ResizeObserver(() => updateViewBox())
    resizeObserver.observe(fsmContainer)
    ctx.destroyCallbacks.push(() => resizeObserver.disconnect())

    // Panning in 'move' mode or Cmd/Ctrl+Shift+drag
    svg.addEventListener('pointerdown', (e: PointerEvent) => {
      const mode = fsmContainer.dataset.editMode
      const forcePan = (e.metaKey || e.ctrlKey) && e.shiftKey
      if (!forcePan && mode !== 'move')
        return
      e.preventDefault()
      let lastX = e.clientX
      let lastY = e.clientY
      fsmContainer.classList.add('panning')
      const onMove = (ev: PointerEvent) => {
        const rect = fsmContainer.getBoundingClientRect()
        const vb = svg.viewBox.baseVal
        const scaleX = vb.width / rect.width
        const scaleY = vb.height / rect.height
        panX -= (ev.clientX - lastX) * scaleX
        panY -= (ev.clientY - lastY) * scaleY
        lastX = ev.clientX
        lastY = ev.clientY
        updateViewBox()
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        fsmContainer.classList.remove('panning')
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    })

    // Cmd/Ctrl+Shift → temporary move mode
    let savedMode: string | undefined
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && fsmContainer.dataset.editMode !== 'move') {
        savedMode = fsmContainer.dataset.editMode
        fsmContainer.dataset.editMode = 'move'
      }
    }
    const restoreMode = () => {
      if (savedMode !== undefined) {
        fsmContainer.dataset.editMode = savedMode
        savedMode = undefined
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey)
        restoreMode()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', restoreMode)
    ctx.destroyCallbacks.push(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', restoreMode)
    })

    svg.addEventListener('dblclick', (e: MouseEvent) => {
      if (fsmContainer.dataset.editMode !== 'default')
        return
      if (e.target !== svg)
        return
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      if (findNodeAtPt(ctx, pt))
        return
      addNodeAt(pt)
    })

    // Add mode: show preview circle and click to add node
    let addPreview: SVGCircleElement | null = null

    function ensureAddPreview(): SVGCircleElement {
      if (!addPreview) {
        addPreview = createSvgEl('circle')
        addPreview.classList.add('fsm-add-preview')
        addPreview.setAttribute('r', `${defaultRadius}`)
        overlay.appendChild(addPreview)
      }
      return addPreview
    }

    function removeAddPreview() {
      addPreview?.remove()
      addPreview = null
    }

    svg.addEventListener('pointermove', (e: PointerEvent) => {
      const mode = fsmContainer.dataset.editMode
      if (mode === 'add') {
        const pt = clientToSvg(svg, e.clientX, e.clientY)
        const prev = ensureAddPreview()
        prev.setAttribute('cx', `${pt.x}`)
        prev.setAttribute('cy', `${pt.y}`)
      }
      else if (addPreview) {
        removeAddPreview()
      }
    })
    svg.addEventListener('pointerleave', () => {
      if (addPreview)
        removeAddPreview()
    })
    svg.addEventListener('click', (e: MouseEvent) => {
      const mode = fsmContainer.dataset.editMode
      if (mode !== 'add' || e.target !== svg)
        return
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      addNodeAt(pt)
      fsmContainer.dataset.editMode = 'default'
    })
  }
}
