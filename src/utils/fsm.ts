export interface ValidateOptions {
  inputAttributes?: Partial<HTMLElementTagNameMap['input']>
  validate?: (input: string) => boolean | string | void
}

export interface FSMOptions {
  container: string
  svgAttributes?: Partial<SVGElementTagNameMap['svg']>
  initialState?: FSMState
  defaultRadius?: number
  fontFamily?: string
  readonly?: boolean
  debug?: boolean
  sidebar?: boolean
  onChange?: (state: FSMState) => void
  fontSizeBreakpoints?: {
    innerNode?: number | Record<number, string>
    outerNode?: number | Record<number, string>
    edge?: number | Record<number, string>
  }
  validate?: false | {
    edge?: ValidateOptions
    innerNode?: ValidateOptions
    outerNode?: ValidateOptions
    container?: string
  }
}

export type NodeId = string
export type EdgeId = string

export interface FSMTransition {
  to: NodeId
  // TODO: label style
  label: string
  offset: number
  rotation?: number
}

export interface FSMNode {
  label: string
  x: number
  y: number
  radius: number
  transitions: FSMTransition[]
  innerLabel: string
}

export interface FSMState {
  start?: NodeId
  nodes: Record<NodeId, FSMNode>
}

export interface FSMNewNodeEvent {
  type: 'new-node'
  id: NodeId
}

export interface FSMRemoveNodeEvent {
  type: 'remove-node'
  id: NodeId
}

export type FSMUpdateEvent
  = | FSMNewNodeEvent
    | FSMRemoveNodeEvent

const defaultFSMOptions = {
  container: undefined!,
  svgAttributes: {},
  initialState: { nodes: {} },
  defaultRadius: 35,
  fontFamily: ' ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Roboto Mono", "Noto Sans Mono", monospace',
  fontSizeBreakpoints: {
    edge: { 5: '15px', 8: '13px' },
    innerNode: { 3: '19px', 5: '16px' },
    outerNode: { 15: '19px', 25: '16px' },
  },
  validate: false,
  sidebar: true,
  readonly: false,
  debug: false,
} satisfies FSMOptions

// XHTML namespace for HTML content inside foreignObject
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

export function createFSMBuilder({
  container,
  svgAttributes = defaultFSMOptions.svgAttributes,
  initialState = defaultFSMOptions.initialState,
  defaultRadius = defaultFSMOptions.defaultRadius,
  fontFamily = defaultFSMOptions.fontFamily,
  readonly = defaultFSMOptions.readonly,
  debug = defaultFSMOptions.debug,
  validate = defaultFSMOptions.validate,
  sidebar = defaultFSMOptions.sidebar,
  fontSizeBreakpoints = defaultFSMOptions.fontSizeBreakpoints,
  onChange,
}: FSMOptions = defaultFSMOptions) {
  if (!container) {
    throw new Error('FSM: container selector is required')
  }

  const fsmContainer = document.querySelector<HTMLElement>(container)!
  if (!fsmContainer) {
    throw new Error(`FSM: Element with selector ${container} not found`)
  }
  const maskId = `edge-mask-${Math.random().toString(16).slice(2)}`
  const fsmState: FSMState = initialState
  fontSizeBreakpoints.edge ??= defaultFSMOptions.fontSizeBreakpoints.edge
  fontSizeBreakpoints.innerNode ??= defaultFSMOptions.fontSizeBreakpoints.innerNode
  fontSizeBreakpoints.outerNode ??= defaultFSMOptions.fontSizeBreakpoints.outerNode

  // Validation configuration
  const validateConfig = validate
  const validationEnabled = validateConfig !== false
  let validationEl: HTMLDivElement | null = null

  // Default font sizes
  const defaultEdgeFontSize = '18px'
  const defaultInnerNodeFontSize = '21px'
  const defaultOuterNodeFontSize = '23px'

  const nodeAbortControllers: Record<NodeId, AbortController> = {}
  for (const id of Object.keys(fsmState.nodes)) {
    nodeAbortControllers[id] = new AbortController()
  }

  let onChangeTimeoutId: number | undefined
  const tryOnChange = (fsmState: FSMState) => {
    // debounce onChange calls to avoid excessive calls during rapid edits
    clearTimeout(onChangeTimeoutId)
    onChangeTimeoutId = window.setTimeout(() => {
      try {
        onChange?.(fsmState)
      }
      catch (error) {
        if (debug) {
          console.error('FSM: onChange error', error)
        }
      }
    })
  }

  let nodeId = 0
  const createNodeId = () => {
    let id = `node-${nodeId++}`
    while (id in fsmState.nodes) {
      id = `node-${nodeId++}`
    }
    return id
  }
  const getNode = (id: NodeId) => id in fsmState.nodes ? fsmState.nodes[id] : undefined

  let edgeId = 0
  const createEdgeId = () => `edge-${edgeId++}`
  const edgeIdToTransition: Record<EdgeId, [NodeId, FSMTransition, AbortController]> = {}

  const { svg, defs, overlay, edgesGroup, nodesGroup } = initializeSvg(fsmContainer)
  // default edit mode for CSS-based selected tool styling
  ;(fsmContainer as HTMLElement).dataset.editMode = 'default'

  if (!readonly) {
    registerGlobalEvents()
  }

  const validationContainer = (validationEnabled && validateConfig && validateConfig.container) || container
  fsmContainer.appendChild(getStyle(container, fontFamily, validationContainer))

  // Sidebar is always rendered in debug mode; otherwise follow the 'sidebar' option
  if (!readonly && (debug || sidebar)) {
    createSidebar(fsmContainer)
  }

  createEdgeMasks(fsmState)

  // render edges first so they go under nodes
  for (const [source, node] of Object.entries(fsmState.nodes)) {
    for (const transition of node.transitions) {
      createNewEdge(source, transition)
    }
  }

  // render nodes
  for (const [id, node] of Object.entries(fsmState.nodes)) {
    createNewNode(id, node)
  }

  // Start state marker (line + arrow) pointing to start node
  createStartMarker()

  // Create validation messages container below the SVG if enabled (skip in readonly)
  if (validationEnabled && !readonly) {
    let validationContainer = fsmContainer
    if (validateConfig && validateConfig.container) {
      validationContainer = document.querySelector(validateConfig.container)!
      if (!validationContainer) {
        if (debug) {
          console.warn(`FSM: validation container ${validateConfig.container} not found, creating default one`)
        }
        validationContainer = fsmContainer
      }
    }
    validationEl = document.createElement('div')
    validationEl.className = 'fsm-validation'
    validationContainer.appendChild(validationEl)
    runValidation()
  }

  // TODO: return a cleanup function
  // TODO: return API to manipulate the FSM
  return undefined

  // Validation helpers
  function createFOText(value: string, fontSize: string, textAlign: 'left' | 'center' | 'right') {
    const el = document.createElementNS(XHTML_NS, 'div') as HTMLDivElement
    el.classList.add('fsm-text')
    el.style.fontSize = fontSize
    el.style.textAlign = textAlign
    el.textContent = value
    el.style.pointerEvents = 'none'
    return el
  }
  function applyInputAttributes(input: HTMLInputElement, attrs: Partial<HTMLElementTagNameMap['input']> | undefined) {
    if (!attrs) {
      return
    }
    for (const [k, v] of Object.entries(attrs)) {
      input.setAttribute(k, String(v))
    }
  }

  type ValidateKind = 'edge' | 'innerNode' | 'outerNode'
  function runValidation() {
    // Carbon icons - Apache 2.0 license
    const checkIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'%2334d399\' d=\'m13 24l-9-9l1.414-1.414L13 21.171L26.586 7.586L28 9z\'/%3E%3C/svg%3E'
    const xIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'%23f87171\' d=\'M17.414 16L24 9.414L22.586 8L16 14.586L9.414 8L8 9.414L14.586 16L8 22.586L9.414 24L16 17.414L22.586 24L24 22.586z\'/%3E%3C/svg%3E'

    if (!validationEnabled || !validationEl) {
      return
    }
    const errors: string[] = []
    const fos = overlay.querySelectorAll<SVGForeignObjectElement>('.fsm-node-label-editor, .fsm-edge-label-editor, .fsm-node-inner-editor')
    fos.forEach((fo) => {
      const input = fo.querySelector<HTMLInputElement>('input.fsm-input')
      if (!input) {
        return
      }
      const kind = input.dataset.validateType as ValidateKind | undefined
      const opts = kind ? validateConfig?.[kind] as ValidateOptions | undefined : undefined
      const validator = opts?.validate
      if (!validator) {
        fo.classList.remove('invalid')
        input.classList.remove('invalid')
        return
      }
      let res: boolean | string | void
      try {
        res = validator(input.value)
      }
      catch {
        // Treat exceptions as invalid with default message
        res = false
      }
      if (typeof res === 'string') {
        fo.classList.add('invalid')
        input.classList.add('invalid')
        errors.push(res)
      }
      else if (res === false) {
        fo.classList.add('invalid')
        input.classList.add('invalid')
        errors.push(`${input.value} is invalid`)
      }
      else {
        fo.classList.remove('invalid')
        input.classList.remove('invalid')
      }
    })
    // Render message list with icons and styling
    validationEl.innerHTML = ''
    const ul = document.createElement('ul')
    ul.className = 'list'
    if (errors.length === 0) {
      const li = document.createElement('li')
      li.className = 'item ok'
      const img = document.createElement('img')
      img.className = 'icon'
      img.alt = 'Success'
      img.src = checkIcon
      const span = document.createElement('span')
      span.className = 'msg'
      span.textContent = 'All inputs are valid.'
      li.appendChild(img)
      li.appendChild(span)
      ul.appendChild(li)
    }
    else {
      for (const msg of errors) {
        const li = document.createElement('li')
        li.className = 'item error'
        const img = document.createElement('img')
        img.className = 'icon'
        img.alt = 'Error'
        img.src = xIcon
        const span = document.createElement('span')
        span.className = 'msg'
        span.textContent = msg
        li.appendChild(img)
        li.appendChild(span)
        ul.appendChild(li)
      }
    }
    validationEl.appendChild(ul)
  }

  // Sidebar builder (scoped to this createFSMBuilder)
  function createSidebar(container: HTMLElement) {
    // Carbon icons - Apache 2.0 license
    const cursorIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'currentColor\' d=\'M23 28a1 1 0 0 1-.71-.29l-6.13-6.14l-3.33 5a1 1 0 0 1-1 .44a1 1 0 0 1-.81-.7l-6-20A1 1 0 0 1 6.29 5l20 6a1 1 0 0 1 .7.81a1 1 0 0 1-.44 1l-5 3.33l6.14 6.13a1 1 0 0 1 0 1.42l-4 4A1 1 0 0 1 23 28m0-2.41L25.59 23l-7.16-7.15l5.25-3.5L7.49 7.49l4.86 16.19l3.5-5.25Z\'/%3E%3C/svg%3E'
    const addIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'currentColor\' d=\'M16 4c6.6 0 12 5.4 12 12s-5.4 12-12 12S4 22.6 4 16S9.4 4 16 4m0-2C8.3 2 2 8.3 2 16s6.3 14 14 14s14-6.3 14-14S23.7 2 16 2\'/%3E%3Cpath fill=\'currentColor\' d=\'M24 15h-7V8h-2v7H8v2h7v7h2v-7h7z\'/%3E%3C/svg%3E'
    const removeIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'currentColor\' d=\'M12 12h2v12h-2zm6 0h2v12h-2z\'/%3E%3Cpath fill=\'currentColor\' d=\'M4 6v2h2v20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8h2V6zm4 22V8h16v20zm4-26h8v2h-8z\'/%3E%3C/svg%3E'
    const chevronDownIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'currentColor\' d=\'M16 22L6 12l1.4-1.4l8.6 8.6l8.6-8.6L26 12z\'/%3E%3C/svg%3E'
    const copyIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 32 32\'%3E%3C!-- Icon from Carbon by IBM - undefined --%3E%3Cpath fill=\'currentColor\' d=\'M28 10v18H10V10zm0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2\'/%3E%3Cpath fill=\'currentColor\' d=\'M4 18H2V4a2 2 0 0 1 2-2h14v2H4Z\'/%3E%3C/svg%3E'

    // Tabler icons - MIT license
    const linkIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 24 24\'%3E%3C!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --%3E%3Cpath fill=\'none\' stroke=\'currentColor\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M11 12h10m-3-3l3 3l-3 3M7 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0\'/%3E%3C/svg%3E'

    // custom icon
    // TODO: implement toggle radius
    // const toggleResizeIcon = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1em\' height=\'1em\' viewBox=\'0 0 100 100\'%3E %3Ccircle cx=\'50\' cy=\'50\' r=\'37.5\' fill=\'none\' stroke=\'currentColor\' stroke-dasharray=\'13\' stroke-width=\'4\' class=\'cls-1\'/%3E %3Ccircle cx=\'50\' cy=\'50\' r=\'25\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'5\' class=\'cls-1\'/%3E %3C/svg%3E'

    if (container.querySelector(':scope > .fsm-sidebar')) {
      return
    }
    const sidebar = document.createElement('div')
    sidebar.className = 'fsm-sidebar'

    // Toggle button (chevron)
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'fsm-sidebar-toggle'
    const chevron = document.createElement('img')
    chevron.alt = 'Toggle tools'
    chevron.src = chevronDownIcon
    toggle.appendChild(chevron)

    // Tool list
    const list = document.createElement('div')
    list.className = 'fsm-tool-list'

    const makeBtn = (title: string, iconUrl: string, mode: string) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.title = title
      btn.className = 'fsm-tool-btn'
      btn.setAttribute('data-mode', mode)
      const img = document.createElement('img')
      img.alt = title
      img.draggable = false
      img.src = iconUrl
      btn.appendChild(img)
      btn.addEventListener('click', () => {
        container.dataset.editMode = mode
      })
      return btn
    }

    const tools: Array<[title: string, icon: string, mode: string]> = [
      ['Select', cursorIcon, 'default'],
      ['Link', linkIcon, 'link'],
      ['Add node', addIcon, 'add'],
      ['Remove', removeIcon, 'remove'],
    ]
    for (const [label, icon, mode] of tools) {
      list.appendChild(makeBtn(label, icon, mode))
    }

    // Debug utility: copy current FSM state to clipboard
    if (debug) {
      const copyBtn = document.createElement('button')
      copyBtn.type = 'button'
      copyBtn.title = 'Copy JSON'
      copyBtn.className = 'fsm-tool-btn'
      const img = document.createElement('img')
      img.alt = 'Copy JSON'
      img.src = copyIcon
      copyBtn.appendChild(img)
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        const json = JSON.stringify(fsmState, null, 2)
        try {
          await copyToClipboard(json)
        }
        catch (err) {
          if (debug) {
            console.error('FSM: copy to clipboard failed', err)
          }
          // eslint-disable-next-line no-alert
          alert(json)
        }

        // eslint-disable-next-line no-alert
        alert('FSM JSON copied to clipboard')
      })
      list.appendChild(copyBtn)
    }

    // Collapse/expand behavior
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed')
    })

    sidebar.appendChild(toggle)
    sidebar.appendChild(list)
    container.appendChild(sidebar)
  }

  // Mask to prevent edges from being drawn on top of nodes
  function createEdgeMasks(state: FSMState) {
    const mask = createSvgEl('mask')
    mask.setAttribute('id', maskId)
    mask.setAttribute('maskUnits', 'userSpaceOnUse')
    mask.setAttribute('maskContentUnits', 'userSpaceOnUse')
    mask.setAttribute('x', '0')
    mask.setAttribute('y', '0')
    mask.setAttribute('width', '100%')
    mask.setAttribute('height', '100%')

    const bg = createSvgEl('rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', 'white')
    mask.appendChild(bg)

    // hide areas where nodes are (black)
    const { nodes } = state
    for (const [id, node] of Object.entries(nodes)) {
      createNodeMaskShape(id, node)
    }

    svg.addEventListener(
      'fsm:update',
      (e) => {
        const { type, id } = (e as CustomEvent<FSMUpdateEvent>).detail
        if (type === 'new-node') {
          const node = getNode(id)
          if (node) {
            createNodeMaskShape(id, node)
          }
          else if (debug) {
            console.error(`FSM: could not find node ${id} for edge mask`)
          }
        }
        else if (type === 'remove-node') {
          const circle = mask.querySelector<SVGCircleElement>(`circle[data-node-id="${id}"]`)
          if (circle) {
            circle.remove()
          }
          else if (debug) {
            console.error(`FSM: could not find node ${id} in edge mask for removal`)
          }
        }
      },
    )

    defs.appendChild(mask)

    return undefined

    function createNodeMaskShape(id: NodeId, node: FSMNode) {
      const circle = createSvgEl('circle')
      circle.dataset.nodeId = id
      updateNodeMaskShape(node, circle)
      mask.appendChild(circle)
      svg.addEventListener(
        `fsm:${id}-update-pos`,
        () => updateNodeMaskShape(node, circle),
        { signal: nodeAbortControllers[id].signal },
      )
      return circle
    }

    function updateNodeMaskShape(node: FSMNode, circle: SVGCircleElement) {
      circle.setAttribute('cx', `${node.x}`)
      circle.setAttribute('cy', `${node.y}`)
      circle.setAttribute('r', `${node.radius + 0.6}`)
      circle.setAttribute('fill', 'black')
    }
  }

  // #region Edge creation and interaction

  function createNewEdge(source: NodeId, transition: FSMTransition) {
    // Offset distance for edge labels in left/right modes so labels don't touch the edge
    const LABEL_NORMAL_OFFSET = 12

    const id = createEdgeId()
    if (id in edgeIdToTransition && debug) {
      console.warn(`FSM: duplicate edge id ${id}`)
    }
    edgeIdToTransition[id] = [source, transition, new AbortController()]
    const edgeEl = createEdgeElement(id, source, transition)
    edgesGroup.appendChild(edgeEl)

    return id

    // Create an edge group element
    function createEdgeElement(id: EdgeId, from: NodeId, transition: FSMTransition) {
      const g = createSvgEl('g')
      g.classList.add('fsm-edge')
      const hitPath = createSvgEl('path')
      hitPath.classList.add('fsm-edge-hit')
      const path = createSvgEl('path')
      path.classList.add('fsm-edge-path')
      g.dataset.from = from
      g.dataset.to = transition.to
      g.dataset.edgeId = id
      g.setAttribute('mask', `url(#${maskId})`)

      // Initial geometry
      const geom = computeEdgeGeom(id)
      path.setAttribute('d', geom.d)
      hitPath.setAttribute('d', geom.d)

      const arrow = createSvgEl('polygon')
      arrow.classList.add('fsm-edge-arrow')
      arrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
      arrow.setAttribute('mask', `url(#${maskId})`)
      g.appendChild(arrow)
      g.appendChild(hitPath)
      g.appendChild(path)

      // Editable edge label via foreignObject input (rendered in overlay)
      const { edgeFO, edgeInput } = initializeEdgeLabelEditor(geom, from, transition, id)

      // Edge drag to adjust curvature (offset) for non-self, rotation for self-loop
      if (edgeInput) {
        initializeEdgeInteraction(g, path, hitPath, arrow, edgeFO, edgeInput)
      }

      // Subscribe to node updates for dynamic edge updates
      const update = () => updateEdgeElement({ path, hitPath, arrow, edgeFO })
      const edgeSignal = edgeIdToTransition[id][2].signal
      svg.addEventListener(
        `fsm:${from}-update-pos`,
        update,
        { signal: AbortSignal.any([nodeAbortControllers[from].signal, edgeSignal]) },
      )
      svg.addEventListener(
        `fsm:${transition.to}-update-pos`,
        update,
        { signal: AbortSignal.any([nodeAbortControllers[transition.to].signal, edgeSignal]) },
      )

      const remove = () => removeEdge(id)
      svg.addEventListener(
        `fsm:${from}-remove`,
        remove,
        { signal: edgeSignal },
      )
      svg.addEventListener(
        `fsm:${transition.to}-remove`,
        remove,
        { signal: edgeSignal },
      )

      return g
    }

    function initializeEdgeLabelEditor(geom: { d: string, tipPt: Vec2, tangUnit: Vec2, mid: Vec2, midTangUnit: Vec2 }, from: NodeId, transition: FSMTransition, id: EdgeId) {
      const layout = computeLabelLayout(geom, getAutoAnchor(id), LABEL_NORMAL_OFFSET)
      const edgeFO = createSvgEl('foreignObject') as SVGForeignObjectElement
      edgeFO.classList.add('fsm-edge-label-editor')
      edgeFO.dataset.from = from
      edgeFO.dataset.to = transition.to
      edgeFO.dataset.edgeId = id
      const fontSize = getFontSize((transition.label || '').length, fontSizeBreakpoints?.edge, defaultEdgeFontSize)
      const ew = getTextWidth(transition.label || 'M', `${fontSize} normal ${fontFamily}`)
      const eh = 40
      const pos0 = edgeLabelFOPosition(layout, ew, eh)
      setFOBounds(edgeFO, pos0.x, pos0.y, ew, eh)
      if (readonly) {
        const textEl = createFOText(transition.label || '', fontSize, layout.textAnchor === 'middle' ? 'center' : layout.textAnchor === 'start' ? 'left' : 'right')
        edgeFO.appendChild(textEl)
      }
      else {
        const edgeInput = document.createElementNS(XHTML_NS, 'input') as HTMLInputElement
        edgeInput.type = 'text'
        edgeInput.autocomplete = 'off'
        edgeInput.classList.add('fsm-input')
        edgeInput.dataset.validateType = 'edge'
        if (validationEnabled) {
          const attrs = validateConfig?.edge?.inputAttributes
          applyInputAttributes(edgeInput, attrs)
        }
        edgeInput.style.fontSize = fontSize
        edgeInput.style.textAlign = layout.textAnchor === 'middle'
          ? 'center'
          : layout.textAnchor === 'start' ? 'left' : 'right'

        const [, trans] = edgeIdToTransition[id]
        edgeInput.value = trans?.label ?? ''

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
          const [, trans] = edgeIdToTransition[id]
          trans.label = edgeInput.value
          const newFontSize = getFontSize(edgeInput.value.length, fontSizeBreakpoints?.edge, defaultEdgeFontSize)
          edgeInput.style.fontSize = newFontSize
          const width = getTextWidth(edgeInput.value || 'M', `${newFontSize} normal ${fontFamily}`)
          // TODO: this can be moved to focus event to avoid recomputing geometry
          const layout = computeLabelLayout(
            computeEdgeGeom(id),
            getAutoAnchor(id),
            LABEL_NORMAL_OFFSET,
          )
          const x = edgeInput.style.textAlign === 'center'
            ? layout.pt.x - width / 2
            : edgeInput.style.textAlign === 'left'
              ? layout.pt.x
              : layout.pt.x - width
          edgeFO.setAttribute('x', `${x}`)
          edgeFO.setAttribute('width', `${width}`)
          tryOnChange(fsmState)
          if (validationEnabled) {
            runValidation()
          }
        })
        edgeFO.appendChild(edgeInput)
      }
      overlay.appendChild(edgeFO)
      const edgeInput = edgeFO.querySelector('input.fsm-input') as HTMLInputElement | null
      return { edgeFO, edgeInput }
    }

    function initializeEdgeInteraction(el: SVGGElement, path: SVGPathElement, hitPath: SVGPathElement, arrow: SVGPolygonElement, edgeFO: SVGForeignObjectElement, edgeInput: HTMLInputElement) {
      let dragging = false
      // Track small-movement threshold to distinguish click vs drag
      let moved = false
      let downX = 0
      let downY = 0
      let lastPt: Vec2 | null = null
      let dragEl: SVGGraphicsElement | null = null
      // Capture base geometry when drag starts for stable delta calculations
      let dragBase: { m: Vec2, n: Vec2, startProj: number, startOffset: number } | null = null

      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) {
          return
        }
        // Mark as moved if pointer exceeds small threshold
        if (!moved) {
          const dx = e.clientX - downX
          const dy = e.clientY - downY
          if (dx * dx + dy * dy > 144) {
            moved = true
          }
        }
        lastPt = clientToSvg(svg, e.clientX, e.clientY)
        if (!lastPt)
          return
        const pt = lastPt
        lastPt = null
        const startNode = getNode(source)!
        if (source === transition.to) {
          // self-loop: set rotation angle from center to pointer
          const ang = Math.atan2(pt.y - startNode.y, pt.x - startNode.x)
          const deg = (ang * 180) / Math.PI
          const [,trans] = edgeIdToTransition[id]
          trans.rotation = deg
        }
        else {
          // non-self: adjust by delta from chord midpoint projection captured at drag start
          if (!dragBase) {
            // should not be possible
            if (debug) {
              console.error('Missing drag base for edge drag')
            }
          }
          else {
            const v = { x: pt.x - dragBase.m.x, y: pt.y - dragBase.m.y }
            const proj = v.x * dragBase.n.x + v.y * dragBase.n.y
            const [, trans] = edgeIdToTransition[id]
            trans.offset = dragBase.startOffset + (proj - dragBase.startProj)
          }
        }
        // Refresh this edge only
        updateEdgeElement({ path, hitPath, arrow, edgeFO })
        tryOnChange(fsmState)
      }
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        if (!dragging) {
          return
        }
        dragging = false
        el.classList.remove('dragging')
        if (dragEl) {
          dragEl.style.cursor = ''
          dragEl = null
        }
        dragBase = null
        // If the pointer didn't move (i.e., a click), enable and focus the edge editor
        if (!moved) {
          edgeInput.focus()
        }
      }
      const startDrag = (e: PointerEvent, el: SVGGraphicsElement) => {
        // start drag only on single left click
        if (e.button !== 0 || e.detail > 1) {
          return
        }
        e.preventDefault()
        edgeInput.blur()
        moved = false
        downX = e.clientX
        downY = e.clientY
        // Capture base at drag start for non-self edges
        const startNode = getNode(source)!
        const endNode = getNode(transition.to)!
        if (source !== transition.to) {
          const p0 = { x: startNode.x, y: startNode.y }
          const p3 = { x: endNode.x, y: endNode.y }
          const dir = unitVec(p3.x - p0.x, p3.y - p0.y)
          const n = perpLeft(dir)
          const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
          const pt = clientToSvg(svg, e.clientX, e.clientY)
          const v0 = { x: pt.x - m.x, y: pt.y - m.y }
          const startProj = v0.x * n.x + v0.y * n.y
          const startOffset = edgeIdToTransition[id][1].offset ?? 0
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
      // Don't need to add AbortSignal since the element itself will be removed on edge delete
      // And dragging from the edge hit path anywhere along the edge
      hitPath.addEventListener('pointerdown', (e: PointerEvent) => startDrag(e, hitPath))
      // Also allow clicking/dragging from the arrow polygon
      arrow.addEventListener('pointerdown', (e: PointerEvent) => startDrag(e, arrow))

      const onClick = (e: MouseEvent) => {
        if (e.detail !== 1) {
          return
        }
        const mode = fsmContainer.dataset.editMode
        if (mode === 'remove') {
          removeEdge(id)
          return
        }
        if (moved) {
          moved = false
          return
        }
        edgeInput.focus()
      }
      path.addEventListener('click', onClick)
      arrow.addEventListener('click', onClick)
      // Ensure the wider hit area also triggers click behavior (e.g., remove in remove mode)
      hitPath.addEventListener('click', onClick)

      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault()
        removeEdge(id)
      }
      path.addEventListener('contextmenu', onContextMenu)
      hitPath.addEventListener('contextmenu', onContextMenu)
    }

    // Update an existing edge group element geometry based on current node positions
    function updateEdgeElement(
      { path, hitPath, arrow, edgeFO }: { path: SVGPathElement, hitPath: SVGPathElement, arrow: SVGPolygonElement, edgeFO: SVGForeignObjectElement },
    ) {
      const geom = computeEdgeGeom(id)
      path.setAttribute('d', geom.d)
      hitPath.setAttribute('d', geom.d)
      arrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))

      // Recalculate label editor position and alignment
      const layout = computeLabelLayout(geom, getAutoAnchor(id), LABEL_NORMAL_OFFSET)
      const ew = edgeFO.width.animVal.value
      const eh = edgeFO.height.animVal.value
      const pos = edgeLabelFOPosition(layout, ew, eh)
      setFOBounds(edgeFO, pos.x, pos.y, ew, eh)
      const input = edgeFO.querySelector<HTMLInputElement>('input.fsm-input')
      if (input) {
        input.style.textAlign = layout.textAnchor === 'middle'
          ? 'center'
          : layout.textAnchor === 'start' ? 'left' : 'right'
      }
    }

    function edgeLabelFOPosition(
      layout: { pt: Vec2, textAnchor: 'start' | 'middle' | 'end' },
      ew: number,
      eh: number,
    ): { x: number, y: number } {
      let xPos = layout.pt.x - ew / 2
      if (layout.textAnchor === 'start') {
        xPos = layout.pt.x
      }
      else if (layout.textAnchor === 'end') {
        xPos = layout.pt.x - ew
      }
      return { x: xPos, y: layout.pt.y - eh / 2 }
    }
  }

  function removeEdge(id: EdgeId) {
    // TODO: dispatch event
    if (!(id in edgeIdToTransition)) {
      if (debug) {
        console.warn(`FSM: could not find edge ${id} to remove`)
      }
      return
    }
    const [from, transition, controller] = edgeIdToTransition[id]
    delete edgeIdToTransition[id]
    controller.abort()
    const fromNode = getNode(from)
    if (fromNode) {
      const idx = fromNode.transitions.indexOf(transition)
      if (idx !== -1) {
        fromNode.transitions.splice(idx, 1)
        tryOnChange(fsmState)
      }
      else if (debug) {
        console.warn(`FSM: could not find transition for edge ${id} in source node ${from} to remove`)
      }
    }
    else if (debug) {
      console.warn(`FSM: could not find source node ${from} for edge ${id} to remove`)
    }
    edgesGroup.querySelector<SVGGElement>(`g.fsm-edge[data-edge-id="${id}"]`)?.remove()
    overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-edge-label-editor[data-edge-id="${id}"]`)?.remove()
    runValidation()
  }

  // #endregion

  // #region Node creation and interaction

  function createNewNode(id: NodeId, node: FSMNode) {
    // Extra vertical gap between node circle and the outer label editor
    const OUTER_LABEL_GAP = 5

    const el = createNodeEl(svg, id, node)
    initializeNodeLabelEditors(svg, id, node)
    if (!readonly) {
      initializeNodeInteraction(el, svg, id, node)
    }
    nodesGroup.appendChild(el)
    runValidation()
    return el

    function createNodeEl(svg: SVGSVGElement, id: NodeId, node: FSMNode) {
      let g = svg.querySelector<SVGGElement>(`g[data-node-id="${id}"]`)
      if (!g) {
        g = createSvgEl('g')
        g.dataset.nodeId = id
        g.classList.add('fsm-node')
      }

      let circle = g.querySelector<SVGCircleElement>('circle')
      if (!circle) {
        circle = createSvgEl('circle')
        circle.classList.add('fsm-node-circle')
        g.appendChild(circle)
      }
      circle.setAttribute('cx', `${node.x}`)
      circle.setAttribute('cy', `${node.y}`)
      circle.setAttribute('r', `${node.radius}`)

      return g
    }

    function initializeNodeLabelEditors(svg: SVGSVGElement, id: string, node: FSMNode) {
      // Inner editor (centered)
      let innerFO = svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)
      const ewInner = node.radius * 2
      const ehInner = 40
      const ix = node.x - ewInner / 2
      const iy = node.y - ehInner / 2
      if (!innerFO) {
        innerFO = createSvgEl('foreignObject')
        innerFO.classList.add('fsm-node-inner-editor')
        innerFO.dataset.nodeId = id
        const fontSize = getFontSize((fsmState.nodes[id].innerLabel || '').length, fontSizeBreakpoints?.innerNode, defaultInnerNodeFontSize)
        if (readonly) {
          const text = createFOText(fsmState.nodes[id].innerLabel || '', fontSize, 'center')
          innerFO.appendChild(text)
        }
        else {
          const input = document.createElementNS(XHTML_NS, 'input') as HTMLInputElement
          input.type = 'text'
          input.autocomplete = 'off'
          input.classList.add('fsm-input')
          input.dataset.validateType = 'innerNode'
          if (validationEnabled) {
            const attrs = validateConfig?.innerNode?.inputAttributes
            applyInputAttributes(input, attrs)
          }
          input.style.fontSize = fontSize
          input.style.textAlign = 'center'
          input.style.pointerEvents = 'none'
          input.value = fsmState.nodes[id].innerLabel || ''
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
            const n = getNode(id)
            if (n) {
              n.innerLabel = input.value
            }
            input.style.fontSize = getFontSize(input.value.length, fontSizeBreakpoints?.innerNode, defaultInnerNodeFontSize)
            tryOnChange(fsmState)
            if (validationEnabled) {
              runValidation()
            }
          })
          innerFO.appendChild(input)
        }
        overlay.appendChild(innerFO)
      }
      setFOBounds(innerFO, ix, iy, ewInner, ehInner)
      if (!readonly) {
        const innerInput = innerFO.querySelector<HTMLInputElement>('input.fsm-input')
        if (innerInput && document.activeElement !== innerInput) {
          innerInput.value = fsmState.nodes[id].innerLabel || ''
          innerInput.style.fontSize = getFontSize(innerInput.value.length, fontSizeBreakpoints?.innerNode, defaultInnerNodeFontSize)
        }
      }
      // Outer editor (below node)
      let outerFO = svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-label-editor[data-node-id="${id}"]`)
      const fontSize = getFontSize((node.label || '').length, fontSizeBreakpoints?.outerNode, defaultOuterNodeFontSize)
      const ewOuter = getTextWidth(node.label || 'M', `${fontSize} normal ${fontFamily}`)
      const ehOuter = 40
      const oyAnchor = node.y + node.radius + 12 + OUTER_LABEL_GAP
      const ox = node.x - ewOuter / 2
      const oy = oyAnchor - ehOuter / 2
      if (!outerFO) {
        outerFO = createSvgEl('foreignObject') as SVGForeignObjectElement
        outerFO.classList.add('fsm-node-label-editor')
        outerFO.dataset.nodeId = id
        if (readonly) {
          const text = createFOText(node.label || '', fontSize, 'center')
          outerFO.appendChild(text)
        }
        else {
          const input = document.createElementNS(XHTML_NS, 'input') as HTMLInputElement
          input.autocomplete = 'off'
          outerFO.addEventListener('click', () => {
            input.focus()
          })
          input.type = 'text'
          input.classList.add('fsm-input')
          input.dataset.validateType = 'outerNode'
          if (validationEnabled) {
            const attrs = validateConfig?.outerNode?.inputAttributes
            applyInputAttributes(input, attrs)
          }
          input.style.fontSize = fontSize
          input.style.textAlign = 'center'
          input.value = node.label || ''
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
            const n = getNode(id)
            if (n) {
              n.label = input.value
            }
            const newFontSize = getFontSize(input.value.length, fontSizeBreakpoints?.outerNode, defaultOuterNodeFontSize)
            input.style.fontSize = newFontSize
            const width = getTextWidth(input.value || 'M', `${newFontSize} normal ${fontFamily}`)
            const x = node.x - width / 2
            outerFO!.setAttribute('width', `${width}`)
            outerFO!.setAttribute('x', `${x}`)
            tryOnChange(fsmState)
            if (validationEnabled) {
              runValidation()
            }
          })
          outerFO.appendChild(input)
        }
        overlay.appendChild(outerFO)
      }
      setFOBounds(outerFO, ox, oy, ewOuter, ehOuter)
      if (!readonly) {
        const outerInput = outerFO.querySelector<HTMLInputElement>('input.fsm-input')
        if (outerInput && document.activeElement !== outerInput) {
          outerInput.value = node.label || ''
          outerInput.style.fontSize = getFontSize(outerInput.value.length, fontSizeBreakpoints?.outerNode, defaultOuterNodeFontSize)
        }
      }
    }

    function initializeNodeInteraction(g: SVGGElement, svg: SVGSVGElement, id: string, node: FSMNode) {
      const circle = g.querySelector<SVGCircleElement>('circle.fsm-node-circle')!
      let dragging = false
      // Track if pointer moved beyond a small threshold to distinguish drag from click
      let moved = false
      let dragStartX = 0
      let dragStartY = 0
      // When starting a link (Shift+drag), suppress the subsequent click focusing once
      let offX = 0
      let offY = 0
      // Throttle onChange during node dragging
      let changeScheduled = false
      // Internal: add a transition and render it
      function addTransitionInternal({ from, to, label, offset = 0, rotation }: { from: NodeId, to: NodeId, label: string, offset?: number, rotation?: number }) {
        const fromNode = getNode(from)
        const toNode = getNode(to)
        if (!fromNode || !toNode) {
          return
        }
        const trans = { to, label, offset, rotation }
        fromNode.transitions.push(trans)
        createNewEdge(from, trans)
        tryOnChange(fsmState)
      }
      // Start link creation with Shift+drag from node
      const startLink = (e: PointerEvent) => {
        const mode = fsmContainer.dataset.editMode
        if (!(e.shiftKey || mode === 'link')) {
          return false
        }
        // Use live node position/radius from state to avoid stale coordinates
        const start = { x: node.x, y: node.y }
        const liveRadius = node.radius
        // Create a preview edge group (path + arrow) for real-time feedback
        const previewG = createSvgEl('g')
        previewG.setAttribute('mask', `url(#${maskId})`)
        previewG.classList.add('fsm-edge', 'preview')
        const previewPath = createSvgEl('path')
        previewPath.classList.add('fsm-edge-path')
        const previewArrow = createSvgEl('polygon')
        previewArrow.classList.add('fsm-edge-arrow')
        previewG.appendChild(previewPath)
        previewG.appendChild(previewArrow)
        svg.appendChild(previewG)
        const onMoveLink = (ev: PointerEvent) => {
          const pt = clientToSvg(svg, ev.clientX, ev.clientY)
          const dir = unitVec(pt.x - start.x, pt.y - start.y)
          const fromBoundary = { x: start.x + liveRadius * dir.x, y: start.y + liveRadius * dir.y }
          // If hovering a node, preview the actual edge shape; otherwise show a straight segment to the cursor
          const hoverId = findNodeAtPt(pt)
          if (hoverId) {
            if (hoverId === id) {
              // self-loop: rotation angle from start->pointer
              const ang = Math.atan2(pt.y - start.y, pt.x - start.x)
              const deg = (ang * 180) / Math.PI
              const geom = computeSelfEdgeGeom(start, liveRadius, deg)
              previewPath.setAttribute('d', geom.d)
              previewArrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
            }
            else {
              // non-self: offset by signed distance of pointer from chord midpoint along normal
              const target = getNode(hoverId)!
              const p0 = start
              const p3 = { x: target.x, y: target.y }
              const cdir = unitVec(p3.x - p0.x, p3.y - p0.y)
              const n = perpLeft(cdir)
              const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
              const v = { x: pt.x - m.x, y: pt.y - m.y }
              const signed = v.x * n.x + v.y * n.y
              const geom = computeNonSelfEdgeGeom(p0, p3, target.radius, signed)
              previewPath.setAttribute('d', geom.d)
              previewArrow.setAttribute('points', arrowHeadPoints(geom.tipPt, geom.tangUnit))
            }
          }
          else {
            // Simple straight preview towards cursor with arrow at cursor
            previewPath.setAttribute('d', `M ${fromBoundary.x} ${fromBoundary.y} L ${pt.x} ${pt.y}`)
            const tangUnit = unitVec(pt.x - fromBoundary.x, pt.y - fromBoundary.y)
            previewArrow.setAttribute('points', arrowHeadPoints(pt, tangUnit))
          }
        }
        const onUpLink = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', onMoveLink)
          window.removeEventListener('pointerup', onUpLink)
          const pt = clientToSvg(svg, ev.clientX, ev.clientY)
          const toId = findNodeAtPt(pt)
          previewG.remove()
          if (toId) {
            if (toId === id) {
              // self-loop: rotation from angle
              const ang = Math.atan2(pt.y - start.y, pt.x - start.x)
              const deg = (ang * 180) / Math.PI
              addTransitionInternal({ from: id, to: id, label: '', rotation: deg })
            }
            else {
              // non-self: offset from midpoint signed distance
              const target = getNode(toId)!
              const p0 = start
              const p3 = { x: target.x, y: target.y }
              const dir = unitVec(p3.x - p0.x, p3.y - p0.y)
              const n = perpLeft(dir)
              const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
              const v = { x: pt.x - m.x, y: pt.y - m.y }
              const signed = v.x * n.x + v.y * n.y
              addTransitionInternal({ from: id, to: toId, label: '', offset: signed })
            }
            // return to default mode after adding a link
            fsmContainer.dataset.editMode = 'default'
            runValidation()
          }
        }

        window.addEventListener('pointermove', onMoveLink)
        window.addEventListener('pointerup', onUpLink, { once: true })
        return true
      }
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) {
          return
        }
        const pt = clientToSvg(svg, e.clientX, e.clientY)
        const nx = pt.x - offX
        const ny = pt.y - offY
        // Mark as moved when exceeding a tiny movement threshold
        if (!moved) {
          const dx = nx - dragStartX
          const dy = ny - dragStartY
          if (Math.hypot(dx, dy) > 1.8) {
            moved = true
          }
        }
        // update state
        if (node) {
          node.x = nx
          node.y = ny
        }
        // update node visuals
        circle.setAttribute('cx', `${nx}`)
        circle.setAttribute('cy', `${ny}`)
        // update overlay editors positions
        const innerFO = svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)
        if (innerFO) {
          const ewInner = node.radius * 2
          const ehInner = 40
          innerFO.setAttribute('x', `${nx - ewInner / 2}`)
          innerFO.setAttribute('y', `${ny - ehInner / 2}`)
          innerFO.setAttribute('width', `${ewInner}`)
          innerFO.setAttribute('height', `${ehInner}`)
        }
        const outerFO = svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-label-editor[data-node-id="${id}"]`)
        if (outerFO) {
          const ewOuter = outerFO.width.baseVal.value
          const ehOuter = 40
          const oyAnchor = ny + node.radius + 12 + OUTER_LABEL_GAP
          outerFO.setAttribute('x', `${nx - ewOuter / 2}`)
          outerFO.setAttribute('y', `${oyAnchor - ehOuter / 2}`)
          outerFO.setAttribute('width', `${ewOuter}`)
          outerFO.setAttribute('height', `${ehOuter}`)
        }
        // notify listeners (edges)
        svg.dispatchEvent(new CustomEvent(`fsm:${id}-update-pos`, { detail: node }))
        svg.dispatchEvent(new CustomEvent(`fsm:node-move`, { detail: { id, node } }))
        // fire onChange with RAF throttling to provide live updates
        if (!changeScheduled) {
          changeScheduled = true
          requestAnimationFrame(() => {
            changeScheduled = false
            tryOnChange(fsmState)
          })
        }
      }
      const onPointerUp = () => {
        if (!dragging) {
          return
        }
        dragging = false
        window.removeEventListener('pointermove', onPointerMove)
        // notify change
        tryOnChange(fsmState)
      }
      g.addEventListener('pointerdown', (e) => {
        const mode = fsmContainer.dataset.editMode
        // Link creation takes precedence when in link mode or Shift is held
        if (startLink(e)) {
          return
        }
        // Disable node drag in non-default modes
        if (mode !== 'default') {
          return
        }
        const pt = clientToSvg(svg, e.clientX, e.clientY)

        const liveNode = getNode(id)!
        offX = pt.x - liveNode.x
        offY = pt.y - liveNode.y
        moved = false
        dragStartX = liveNode.x
        dragStartY = liveNode.y
        dragging = true
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp, { once: true })
      })
      // Click to set start state (if not moved)
      g.addEventListener('dblclick', () => {
        if (fsmContainer.dataset.editMode !== 'default') {
          return
        }
        if (moved)
          return
        if (fsmState.start === id)
          return
        fsmState.start = id
        svg.dispatchEvent(new CustomEvent('fsm:set-start', { detail: id }))
        tryOnChange(fsmState)
      })
      // Single click: activate editors above nodes and focus inner input
      g.addEventListener('click', (e) => {
        const mode = fsmContainer.dataset.editMode
        if (mode === 'remove') {
          removeNode(id)
          return
        }
        if (mode !== 'default') {
          return
        }
        if (e.detail !== 1) {
          return
        }
        if (moved) {
          moved = false
          return
        }
        const innerFO = svg.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)
        if (innerFO) {
          const input = innerFO.querySelector('input') as HTMLInputElement | null
          if (input) {
            input.focus()
          }
        }
      })
      g.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        removeNode(id)
      })
    }
  }

  function removeNode(id: NodeId) {
    svg.dispatchEvent(new CustomEvent(`fsm:${id}-remove`))
    svg.dispatchEvent(new CustomEvent('fsm:update', { detail: { type: 'remove-node', id } }))

    const abortController = nodeAbortControllers[id]
    if (abortController) {
      abortController.abort()
      delete nodeAbortControllers[id]
    }
    else if (debug) {
      console.warn(`FSM: could not find abort controller for node ${id} to remove`)
    }
    delete fsmState.nodes[id]
    nodesGroup.querySelector<SVGGElement>(`g.fsm-node[data-node-id="${id}"]`)?.remove()
    overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-inner-editor[data-node-id="${id}"]`)?.remove()
    overlay.querySelector<SVGForeignObjectElement>(`foreignObject.fsm-node-label-editor[data-node-id="${id}"]`)?.remove()
    runValidation()
    tryOnChange(fsmState)
  }

  // #endregion

  // Start-state marker helpers
  function createStartMarker() {
    const startId = fsmState.start
    let g = svg.querySelector<SVGGElement>('g.fsm-start')
    if (!g) {
      g = createSvgEl('g')
      g.classList.add('fsm-start')
      svg.insertBefore(g, svg.lastChild)
    }
    const line = createSvgEl('path')
    const arrow = createSvgEl('polygon')
    line.setAttribute('visibility', startId ? 'visible' : 'hidden')
    arrow.setAttribute('visibility', startId ? 'visible' : 'hidden')
    g.appendChild(line)
    g.appendChild(arrow)

    svg.addEventListener('fsm:set-start', (e) => {
      const id = (e as CustomEvent<string>).detail
      const node = getNode(id)
      if (node) {
        line.setAttribute('visibility', 'visible')
        arrow.setAttribute('visibility', 'visible')
        updateStartMarker(node)
      }
    })

    svg.addEventListener('fsm:node-move', (e) => {
      const { id, node } = (e as CustomEvent<{ id: string, node: FSMNode }>).detail
      if (id === fsmState.start)
        updateStartMarker(node)
    })

    svg.addEventListener('fsm:update', (e) => {
      const { type, id } = (e as CustomEvent<FSMUpdateEvent>).detail
      if (type === 'remove-node' && id === fsmState.start) {
        delete fsmState.start
        line.setAttribute('visibility', 'hidden')
        arrow.setAttribute('visibility', 'hidden')
      }
    })

    if (startId && getNode(startId)) {
      svg.dispatchEvent(new CustomEvent('fsm:set-start', { detail: startId }))
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

  function initializeSvg(container: HTMLElement) {
    const svg = createSvgEl('svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    const rect = (() => fsmContainer.getBoundingClientRect())()
    const aspectRatio = rect.width / rect.height
    svg.setAttribute('viewBox', `0 0 ${600 * aspectRatio} 600`)
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

  function registerGlobalEvents() {
    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      const rect = fsmContainer.getBoundingClientRect()
      const newAspectRatio = rect.height === 0 ? 1 : rect.width / rect.height
      svg.setAttribute('viewBox', `0 0 ${600 * newAspectRatio} 600`)
    })
    resizeObserver.observe(document.body)

    svg.addEventListener('fsm:update', (e) => {
      const { type, id } = (e as CustomEvent<FSMUpdateEvent>).detail
      if (type === 'new-node') {
        nodeAbortControllers[id] = new AbortController()
      }
    })

    // Create node on background double-click (default mode only)
    svg.addEventListener('dblclick', (e: MouseEvent) => {
      if (fsmContainer.dataset.editMode !== 'default') {
        return
      }
      if (e.target !== svg) {
        return // only background, not on paths/labels/nodes
      }
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      // don't create if hitting an existing node
      if (findNodeAtPt(pt)) {
        return
      }
      const radius = defaultRadius
      const id = createNodeId()
      const node = {
        label: '',
        innerLabel: '',
        x: pt.x,
        y: pt.y,
        radius,
        transitions: [],
      }
      // add to state
      fsmState.nodes[id] = node
      // render
      createNewNode(id, node)
      svg.dispatchEvent(new CustomEvent('fsm:update', { detail: { type: 'new-node', id } }))
      tryOnChange(fsmState)
    })

    // Add mode: show preview and click to add on background
    let addPreview: SVGCircleElement | null = null
    function ensureAddPreview() {
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
      if (addPreview) {
        removeAddPreview()
      }
    })
    svg.addEventListener('click', (e: MouseEvent) => {
      const mode = fsmContainer.dataset.editMode
      if (mode !== 'add') {
        return
      }
      if (e.target !== svg) {
        return
      }
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      const radius = defaultRadius
      const id = createNodeId()
      const node = { label: '', innerLabel: '', x: pt.x, y: pt.y, radius, transitions: [] }
      fsmState.nodes[id] = node
      createNewNode(id, node)
      svg.dispatchEvent(new CustomEvent('fsm:update', { detail: { type: 'new-node', id } }))
      tryOnChange(fsmState)
      // Return to default mode after adding a node
      fsmContainer.dataset.editMode = 'default'
    })
  }

  // Find nearest node under a point (SVG coords), within radius+3
  function findNodeAtPt(pt: Vec2): NodeId | undefined {
    // TODO: might be able to optimize with some spatial search tree if many nodes, trivial for small FSMs
    let best: { id: NodeId, d: number } | undefined
    for (const [id, n] of Object.entries(fsmState.nodes)) {
      const node = n as FSMNode
      const d = Math.hypot(pt.x - node.x, pt.y - node.y)
      if (d <= node.radius + defaultRadius) {
        if (!best || d < best.d) {
          best = { id: id as NodeId, d }
        }
      }
    }
    return best?.id
  }

  function computeEdgeGeom(id: string): { d: string, tipPt: Vec2, tangUnit: Vec2, mid: Vec2, midTangUnit: Vec2 } {
    const [from, { to, offset, rotation }] = edgeIdToTransition[id]
    const startNode = getNode(from)!
    const endNode = getNode(to)!
    const startCenter = { x: startNode.x, y: startNode.y }
    const endCenter = { x: endNode.x, y: endNode.y }
    const endRadius = endNode.radius
    if (from === to) {
      const rotationDeg = rotation ?? 0
      return computeSelfEdgeGeom(startCenter, endRadius, rotationDeg)
    }
    else {
      return computeNonSelfEdgeGeom(startCenter, endCenter, endRadius, offset)
    }
  }

  function computeSelfEdgeGeom(startCenter: Vec2, endRadius: number, rotationDeg: number): { d: string, tipPt: Vec2, tangUnit: Vec2, mid: Vec2, midTangUnit: Vec2 } {
    const theta = (rotationDeg * Math.PI) / 180
    const arc = selfLoopArcParams(startCenter, endRadius, theta)
    // Assume sweepFlag=1 always for arc command
    const d = `M ${arc.startPt.x} ${arc.startPt.y} A ${arc.radius} ${arc.radius} 0 ${arc.largeArcFlag} 1 ${arc.endPt.x} ${arc.endPt.y}`
    // Reconstruct consistent center/angles
    const arcGeom = arcCenterFromEndpoints(arc.startPt, arc.endPt, arc.radius, arc.largeArcFlag, 1)
    // Arrow at end of arc
    const tipA = arcGeom.endAngle
    const tipPt = { x: arcGeom.center.x + arc.radius * Math.cos(tipA), y: arcGeom.center.y + arc.radius * Math.sin(tipA) }
    const base = { x: -Math.sin(tipA), y: Math.cos(tipA) }
    // arbitrary -0.3 rad rotation to make self pointing arrows prettier
    const tangUnit = rotate(unitVec(base.x, base.y), -0.32)
    const delta = normalizedAngleDelta(arcGeom.startAngle, arcGeom.endAngle, 1)
    const midA = arcGeom.startAngle + delta / 2
    const mid = { x: arcGeom.center.x + arc.radius * Math.cos(midA), y: arcGeom.center.y + arc.radius * Math.sin(midA) }
    const midTangUnit = unitVec(-Math.sin(midA), Math.cos(midA))
    return { d, tipPt, tangUnit, mid, midTangUnit }
  }

  function computeNonSelfEdgeGeom(startCenter: Vec2, endCenter: Vec2, endRadius: number, offset: number): { d: string, tipPt: Vec2, tangUnit: Vec2, mid: Vec2, midTangUnit: Vec2 } {
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

  // Auto anchor rules:
  // - self loops: 'left'
  // - non-self: offset >= 0 ? 'right' : 'left'
  function getAutoAnchor(edgeId: string): 'left' | 'right' {
    const [from, { to }] = edgeIdToTransition[edgeId]
    if (from === to)
      return 'left'
    const [, trans] = edgeIdToTransition[edgeId]
    return (trans.offset ?? 0) >= 0 ? 'right' : 'left'
  }

  // Shared: compute label position and SVG text-anchor based on edge geometry and anchor mode
  function computeLabelLayout(
    geom: { mid: Vec2, midTangUnit: Vec2 },
    anchor: 'left' | 'right',
    offset: number,
  ): { pt: Vec2, textAnchor: 'start' | 'middle' | 'end' } {
    const nMid = perpLeft(geom.midTangUnit)
    const vDir = anchor === 'left' ? { x: -nMid.x, y: -nMid.y } : anchor === 'right' ? nMid : { x: 0, y: 0 }
    const pt = { x: geom.mid.x + vDir.x * offset, y: geom.mid.y + vDir.y * offset }
    const vOffset = { x: pt.x - geom.mid.x, y: pt.y - geom.mid.y }
    const textAnchor: 'start' | 'middle' | 'end' = Math.abs(vOffset.x) < Math.abs(vOffset.y)
      ? 'middle'
      : vOffset.x >= 0 ? 'start' : 'end'
    return { pt, textAnchor }
  }
}

// #region Element helpers

function getFontSize(textLength: number, breakpoints: number | string | Record<number, string> | undefined, defaultSize: string): string {
  if (typeof breakpoints === 'number') {
    return `${breakpoints}px`
  }
  if (typeof breakpoints === 'string') {
    return breakpoints
  }
  if (breakpoints == null) {
    return defaultSize
  }

  // descending
  const lengths = Object.keys(breakpoints).map(Number).sort((a, b) => a - b)
  if (lengths.length === 0) {
    return defaultSize
  }

  for (const len of lengths) {
    if (textLength <= len) {
      return breakpoints[len]
    }
  }

  return breakpoints[lengths[lengths.length - 1]] ?? defaultSize
}

// FIXME: this does not handle cut/paste, delete, drag-drop, IME, etc.
function editIsInvalid(ev: InputEvent): boolean {
  const input = ev.target as HTMLInputElement
  const pattern = input.pattern
  if (!pattern) {
    return false
  }
  return !new RegExp(pattern).test(input.value)
}

function saveInputState(input: HTMLInputElement) {
  return {
    value: input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
  }
}

function restoreInputState(input: HTMLInputElement, state: ReturnType<typeof saveInputState>) {
  input.value = state.value
  if (state.selectionStart !== null && state.selectionEnd !== null) {
    input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection ?? 'none')
  }
}

function createSvgEl<K extends keyof SVGElementTagNameMap>(tagName: K) {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName)
}

// eslint-disable-next-line vars-on-top, no-var
var canvas: HTMLCanvasElement | undefined
function getTextWidth(text: string, font: string) {
  // re-use canvas object for better performance
  canvas ??= document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.font = font
  const metrics = context.measureText(text)
  return metrics.width
}

function setFOBounds(fo: SVGForeignObjectElement, x: number, y: number, w: number, h: number) {
  fo.setAttribute('x', `${x}`)
  fo.setAttribute('y', `${y}`)
  fo.setAttribute('width', `${w}`)
  fo.setAttribute('height', `${h}`)
}

function stopPointerEventPropagation(el: Element) {
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) {
    el.addEventListener(type, ev => ev.stopPropagation())
  }
}

// Map client (screen) coordinates to SVG user space (viewBox)
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const x = ((clientX - rect.left) / rect.width) * (vb.width)
  const y = ((clientY - rect.top) / rect.height) * (vb.height)
  return { x, y }
}

function copyToClipboard(value: string) {
  if (isClipboardApiSupported()) {
    return navigator.clipboard.writeText(value)
  }
  else {
    legacyCopy(value)
  }
}

function isClipboardApiSupported() {
  return !!(
    navigator.clipboard && navigator.clipboard.writeText
  )
}

function legacyCopy(value: string) {
  const ta = document.createElement('textarea')
  ta.value = value ?? ''
  ta.style.position = 'absolute'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}

// #endregion

// #region Style

// TODO: Just use a static CSS file
function getStyle(container: string, fontFamily: string, validationContainer: string) {
  const style = createSvgEl('style')
  style.textContent = `
      ${container} {
        position: relative;
      }

      ${container} .fsm-node-circle {
        fill: rgba(0, 0, 255, 0.08);
        stroke: black;
        stroke-width: 1.2;
        transition: stroke 120ms ease, fill 120ms ease;
      }


      ${container} .fsm-node:hover .fsm-node-circle {
        stroke: #2563eb; /* blue-600 */
        cursor: grab;
        fill: rgba(37, 99, 235, 0.15);
      }

      /* SVG node label styles removed (replaced by FO editors) */

      ${container} .fsm-edge-path {
        fill: none;
        stroke: #888888;
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
        stroke-linecap: round;
        transition: stroke 120ms ease, stroke-width 120ms ease;
      }

      ${container} .fsm-edge-hit {
        fill: none;
        stroke: transparent;
        stroke-width: 20;
        pointer-events: stroke;
        cursor: grab;
      }

      ${container} .fsm-edge-arrow {
        fill: #888888;
        transition: fill 120ms ease;
      }

      ${container} .fsm-edge:hover .fsm-edge-path {
        stroke: #2563eb;
        stroke-width: 2.4;
      }
      ${container} .fsm-edge:hover .fsm-edge-arrow {
        fill: #2563eb;
      }
      ${container} .fsm-edge.dragging .fsm-edge-path {
        stroke: #2563eb;
        stroke-width: 2.4;
      }
      ${container} .fsm-edge.dragging .fsm-edge-arrow {
        fill: #2563eb;
      }
      ${container} .fsm-start-line {
        stroke: #111827;
        stroke-width: 1.5;
        vector-effect: non-scaling-stroke;
        fill: none;
      }
      ${container} .fsm-start-arrow {
        fill: #111827;
      }

      ${container} .fsm-edge-label {
        font-size: 18px;
        dominant-baseline: middle;
        paint-order: stroke fill;
        fill: #111827;
        user-select: none;
      }
      ${container} .fsm-node-inner-editor,
      ${container} .fsm-edge-label-editor,
      ${container} .fsm-node-label-editor {
        display: flex;
        justify-content: center;
        overflow: visible;
        pointer-events: all;
      }
      ${container} .fsm-text {
        width: 100%;
        height: 100%;
        color: #111827;
        font-family: ${fontFamily};
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      ${container} .fsm-input {
        width: 100%;
        height: 100%;
        border: none;
        outline: none;
        background: transparent;
        padding: 0;
        margin: 0;
        color: #111827;
        font-family: ${fontFamily};
      }

      ${container} .fsm-edge-label-editor.invalid,
      ${container} .fsm-node-label-editor.invalid,
      ${container} .fsm-node-inner-editor.invalid {
        border: 2px dashed #dc2626dd;
        border-radius: 6px;
      }

      ${validationContainer} + .fsm-validation,
      ${validationContainer} .fsm-validation {
        margin-top: 6px;
        font-family: ${fontFamily};
        font-size: 12px;
        color: #111827;
        user-select: none;
      }
      ${validationContainer} .fsm-validation .ok {
        color: #059669;
      }
      ${validationContainer} .fsm-validation ul {
        list-style: none;
        margin: 8px 0 0 0;
        padding: 0;
      }
      ${validationContainer} .fsm-validation ul .item {
        width: 100%;
        padding: 8px 10px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0;
        box-sizing: border-box;
      }
      ${validationContainer} .fsm-validation ul .item.ok {
        background: #ecfdf5; /* green-50 */
        border: 1px solid #34d399; /* green-400 */
        color: #065f46; /* green-800 */
      }
      ${validationContainer} .fsm-validation ul .item.error {
        background: #fef2f2; /* red-50 */
        border: 1px solid #f87171; /* red-400 */
        color: #7f1d1d; /* red-800 */
      }
      ${validationContainer} .fsm-validation ul .item .icon {
        width: 16px;
        height: 16px;
      }
      ${validationContainer} .fsm-validation ul .item .msg {
        flex: 1;
      }

      ${container} .fsm-sidebar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 8px 6px;
        z-index: 10;
        pointer-events: auto;
        user-select: none;
      }
      ${container} .fsm-sidebar .fsm-sidebar-toggle {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        cursor: pointer;
        padding: 0;
        outline: none;
        box-shadow: 0 1px 1px rgba(0,0,0,0.04);
        transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
      }
      ${container} .fsm-sidebar .fsm-sidebar-toggle:hover {
        background: #f9fafb; /* gray-50 */
        border-color: #d1d5db; /* gray-300 */
      }
      ${container} .fsm-sidebar .fsm-sidebar-toggle:active {
        background: #f3f4f6; /* gray-100 */
        transform: translateY(1px);
      }
      ${container} .fsm-sidebar .fsm-sidebar-toggle img {
        width: 18px;
        height: 18px;
        transition: transform 160ms ease;
      }
      ${container} .fsm-sidebar.collapsed .fsm-sidebar-toggle img {
        transform: rotate(-180deg);
      }

      ${container} .fsm-sidebar .fsm-tool-list {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        transform-origin: top;
        transition: transform 160ms ease;
        user-select: none;
      }
      ${container} .fsm-sidebar.collapsed .fsm-tool-list {
        transform: scaleY(0);
        pointer-events: none;
      }
      ${container} .fsm-sidebar .fsm-tool-btn {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        cursor: pointer;
        padding: 0;
        outline: none;
        box-shadow: 0 1px 1px rgba(0,0,0,0.04);
        transition: background 140ms ease, border-color 140ms ease, transform 80ms ease;
      }
      ${container} .fsm-sidebar .fsm-tool-btn:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }
      ${container} .fsm-sidebar .fsm-tool-btn:active {
        background: #f3f4f6;
        transform: scale(0.98);
      }
      ${container} .fsm-sidebar .fsm-tool-btn img {
        width: 18px;
        height: 18px;
      }

      ${container}[data-edit-mode="default"] .fsm-tool-btn[data-mode="default"],
      ${container}[data-edit-mode="link"] .fsm-tool-btn[data-mode="link"],
      ${container}[data-edit-mode="add"] .fsm-tool-btn[data-mode="add"],
      ${container}[data-edit-mode="remove"] .fsm-tool-btn[data-mode="remove"] {
        background: #e5e7eb; /* gray-200 */
        border-color: #9ca3af; /* gray-400 */
      }

      ${container} .fsm-add-preview {
        fill: rgba(37, 99, 235, 0.12); /* blue-600 soft */
        stroke: #2563eb;
        stroke-width: 1.2;
        pointer-events: none;
      }

      ${container}[data-edit-mode="remove"] .fsm-edge-hit,
      ${container}[data-edit-mode="remove"] .fsm-node-circle {
        caret-color: red;
        cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1em' height='1em' viewBox='0 0 32 32'%3E%3Cpath fill='red' stroke='red' d='M12 12h2v12h-2zm6 0h2v12h-2z'/%3E%3Cpath fill='red' stroke='red' stroke-width='1.5' d='M4 6v2h2v20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8h2V6zm4 22V8h16v20zm4-26h8v2h-8z'/%3E%3C/svg%3E") 4 4, auto !important;
      }
    `
  return style
}

// #endregion

// #region Math/geometry helpers

// Shared 2D vector type for geometry helpers
interface Vec2 { x: number, y: number }

// Basic vector ops

function unitVec(vx: number, vy: number): Vec2 {
  const m = Math.hypot(vx, vy) || 1
  return { x: vx / m, y: vy / m }
}

function perpLeft(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x }
}

function rotate(v: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y }
}

// Cubic Bezier point and tangent
function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  }
}

function cubicTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  }
}

// For a cubic where p1 and p2 are symmetric around the chord midpoint, B(0.5) = M + (3/4)*a*N
// Choose a = (4/3)*offset to achieve desired midpoint offset.
function controlFromOffsetCubic(p0: Vec2, p3: Vec2, offset: number): [Vec2, Vec2] {
  // dir: chord direction, n: normal
  const dir = unitVec(p3.x - p0.x, p3.y - p0.y)
  const n = perpLeft(dir)
  const m = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }
  // Separation between p1 and p2 proportional to |offset|, normal displacement by offset
  const sepScale = 0.4 // tweak for visual quality
  const dispScale = 0.8 // tweak for normal offset
  const sep = Math.abs(offset) * sepScale
  const disp = offset * dispScale
  // p1 left of m, p2 right of m, both displaced by offset
  const p1 = { x: m.x - dir.x * sep + n.x * disp, y: m.y - dir.y * sep + n.y * disp }
  const p2 = { x: m.x + dir.x * sep + n.x * disp, y: m.y + dir.y * sep + n.y * disp }
  return [p1, p2]
}

// Construct a near-circular cubic self-loop on a node circle.
// center: node center, r: node radius, theta: loop direction angle (radians),
// offset: visual size of loop (distance from center to arc midpoint).
// Build a near-circular self-loop using ~80% of a circle as three cubic segments.
// Endpoints lie on the circle boundary; arc sweeps from (theta - 0.4*pi) to (theta + 0.4*pi).
// (no cubic arc segment helper needed for self-loop)

// (self-loop arc params helper defined below)

function selfLoopArcParams(center: Vec2, r: number, theta: number) {
  const Rs = 0.8 * r
  const d = r
  const Cs = { x: center.x + d * Math.cos(theta), y: center.y + d * Math.sin(theta) }
  const dist = d
  let cosBeta = (dist * dist + Rs * Rs - r * r) / (2 * dist * Rs)
  cosBeta = Math.max(-1, Math.min(1, cosBeta))
  const beta = Math.acos(cosBeta)
  const baseSmall = Math.atan2(center.y - Cs.y, center.x - Cs.x)
  const a1 = baseSmall + beta
  const a2 = baseSmall - beta
  const startPt = { x: Cs.x + Rs * Math.cos(a1), y: Cs.y + Rs * Math.sin(a1) }
  const endPt = { x: Cs.x + Rs * Math.cos(a2), y: Cs.y + Rs * Math.sin(a2) }
  const startAngle = a1
  const endAngle = a2
  const largeArcFlag: 0 | 1 = 1
  const sweepFlag: 0 | 1 = 1
  return { center: Cs, radius: Rs, startAngle, endAngle, startPt, endPt, largeArcFlag, sweepFlag }
}

function arrowHeadPoints(tip: Vec2, dirUnit: Vec2, len = 16, wid = 12): string {
  const baseX = tip.x - len * dirUnit.x
  const baseY = tip.y - len * dirUnit.y
  const px = -dirUnit.y
  const py = dirUnit.x
  const wid2 = wid / 2
  const leftX = baseX + wid2 * px
  const leftY = baseY + wid2 * py
  const rightX = baseX - wid2 * px
  const rightY = baseY - wid2 * py
  return `${tip.x},${tip.y} ${leftX},${leftY} ${rightX},${rightY}`
}

// Solve |B(t)-center|=r for cubic B(t)
function findCubicCircleIntersectionT(
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
    if (!Number.isFinite(dft) || Math.abs(dft) < 1e-6) {
      break
    }
    const tNext = t - ft / dft
    if (!Number.isFinite(tNext)) {
      break
    }
    t = Math.max(0, Math.min(1, tNext))
    if (Math.abs(ft) < 1e-4) {
      break
    }
  }

  if (!(t >= 0 && t <= 1) || f(t) > 1e-3) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      const fmid = f(mid)
      if (fmid > 0) {
        lo = mid
      }
      else {
        hi = mid
      }
    }
    t = hi
  }
  return Math.max(0, Math.min(1, t))
}

// --- Arc helpers for SVG 'A' command geometry ---
// Compute circle center and angles from arc endpoints and flags (rx=ry=R, xAxisRotation=0)
function arcCenterFromEndpoints(p0: Vec2, p1: Vec2, R: number, largeArcFlag: 0 | 1, sweepFlag: 0 | 1) {
  // Midpoint
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const d2 = dx * dx + dy * dy
  const d = Math.sqrt(d2)
  const r = Math.max(R, d / 2) // guard: radius must be >= chord/2
  // Distance from midpoint to center along the perpendicular
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)))
  // Perpendicular unit vectors (two candidates)
  const ux = -dy / (d || 1)
  const uy = dx / (d || 1)
  // Two possible centers
  const c1 = { x: mx + ux * h, y: my + uy * h }
  const c2 = { x: mx - ux * h, y: my - uy * h }

  // Choose center consistent with flags
  function angles(c: Vec2) {
    const a0 = Math.atan2(p0.y - c.y, p0.x - c.x)
    const a1 = Math.atan2(p1.y - c.y, p1.x - c.x)
    return { a0, a1 }
  }
  function angleDelta(a0: number, a1: number, sweep: 0 | 1) {
    let d = a1 - a0
    if (sweep === 1) {
      if (d < 0) {
        d += 2 * Math.PI
      }
    }
    else {
      if (d > 0) {
        d -= 2 * Math.PI
      }
    }
    return d
  }
  const cand1 = angles(c1)
  const cand2 = angles(c2)
  const d1 = angleDelta(cand1.a0, cand1.a1, sweepFlag)
  const d2ang = angleDelta(cand2.a0, cand2.a1, sweepFlag)

  const use1 = (largeArcFlag === 1 ? Math.abs(d1) > Math.PI : Math.abs(d1) <= Math.PI)
  const use2 = (largeArcFlag === 1 ? Math.abs(d2ang) > Math.PI : Math.abs(d2ang) <= Math.PI)
  // Prefer the candidate that matches the large-arc condition; break ties by absolute delta closeness
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
    // Choose the one whose delta best matches largeArcFlag
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

function normalizedAngleDelta(a0: number, a1: number, sweep: 0 | 1) {
  let d = a1 - a0
  if (sweep === 1) {
    if (d < 0) {
      d += 2 * Math.PI
    }
  }
  else {
    if (d > 0) {
      d -= 2 * Math.PI
    }
  }
  return d
}

// #endregion
