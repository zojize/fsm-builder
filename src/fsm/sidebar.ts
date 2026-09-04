import type { FSMContext } from './context'
import { copyToClipboard } from './dom'
import { createIconElement } from './icons'
import { toggleStartState } from './nodes'
import { runValidation } from './validation'

interface ViewControls {
  getZoom: () => number
  setZoom: (zoom: number, anchor?: { clientX: number, clientY: number }) => number
  getNodeScale: () => number
  setNodeScale: (scale: number) => number
  commitNodeScale: () => void
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

function scalePercent(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

function makeBtn(
  title: string,
  iconName: string,
  mode: string,
  container: HTMLElement,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'fsm-tool-btn'
  btn.setAttribute('data-mode', mode)
  btn.setAttribute('aria-label', title)
  btn.title = title
  btn.appendChild(createIconElement(iconName))
  btn.addEventListener('click', () => {
    container.dataset.editMode = mode
  })
  return btn
}

function makeActionBtn(title: string, iconName: string, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `fsm-tool-btn${extraClass ? ` ${extraClass}` : ''}`
  btn.setAttribute('aria-label', title)
  btn.title = title
  btn.appendChild(createIconElement(iconName))
  return btn
}

function addViewControls(
  sidebar: HTMLDivElement,
  list: HTMLDivElement,
  ctx: FSMContext,
  controls: ViewControls,
): void {
  const sizeBtn = makeActionBtn('Adjust node size (Alt/Option + scroll zooms canvas)', 'i-mdi-circle-expand')
  sizeBtn.dataset.action = 'node-size'
  sizeBtn.setAttribute('aria-expanded', 'false')
  list.appendChild(sizeBtn)

  const popover = document.createElement('div')
  popover.className = 'fsm-node-size-popover'
  popover.hidden = true

  const controlsRow = document.createElement('div')
  controlsRow.className = 'fsm-node-size-row'
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = `${ZOOM_MIN}`
  slider.max = `${ZOOM_MAX}`
  slider.step = '0.01'
  slider.setAttribute('aria-label', 'Node size')
  const value = document.createElement('output')
  value.className = 'fsm-node-size-value'
  value.setAttribute('aria-live', 'polite')
  controlsRow.append(slider, value)
  popover.appendChild(controlsRow)
  sidebar.appendChild(popover)

  const sync = () => {
    const nodeScale = controls.getNodeScale()
    slider.value = `${nodeScale}`
    value.textContent = scalePercent(nodeScale)
  }
  const changeNodeScale = (nodeScale: number) => {
    controls.setNodeScale(clampZoom(nodeScale))
    sync()
  }

  sizeBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    popover.hidden = !popover.hidden
    sizeBtn.setAttribute('aria-expanded', `${!popover.hidden}`)
    sync()
  })
  slider.addEventListener('input', () => changeNodeScale(Number(slider.value)))
  slider.addEventListener('change', controls.commitNodeScale)

  const onWheel = (event: WheelEvent) => {
    if (!event.altKey)
      return
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0015)
    controls.setZoom(
      clampZoom(controls.getZoom() * factor),
      { clientX: event.clientX, clientY: event.clientY },
    )
  }
  ctx.svg.addEventListener('wheel', onWheel, { passive: false })

  const closePopover = (event: PointerEvent) => {
    const target = event.target as Node
    if (!popover.contains(target) && !sizeBtn.contains(target)) {
      popover.hidden = true
      sizeBtn.setAttribute('aria-expanded', 'false')
    }
  }
  document.addEventListener('pointerdown', closePopover)
  const unsubscribeChange = ctx.emitter.on('change', sync)
  ctx.destroyCallbacks.push(() => {
    document.removeEventListener('pointerdown', closePopover)
    ctx.svg.removeEventListener('wheel', onWheel)
    unsubscribeChange()
  })
  sync()
}

/**
 * Create and append the editing sidebar to `container`.
 * Requires access to the full FSM context so it can trigger clear-all and copy JSON.
 */
export function createSidebar(
  container: HTMLElement,
  ctx: FSMContext,
  removeNode: (id: string) => void,
  viewControls: ViewControls,
): void {
  if (container.querySelector(':scope > .fsm-sidebar'))
    return

  const sidebar = document.createElement('div')
  sidebar.className = 'fsm-sidebar'

  // Toggle button
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'fsm-sidebar-toggle'
  toggle.appendChild(createIconElement('i-bi-chevron-down'))

  // Tool list
  const list = document.createElement('div')
  list.className = 'fsm-tool-list'

  const tools: Array<[title: string, iconName: string, mode: string]> = [
    ['Select', 'i-bi-cursor', 'default'],
    ['Move Canvas', 'i-bi-arrows-move', 'move'],
    ['Add node', 'i-bi-plus-circle', 'add'],
    ['Add Transition', 'i-bi-bezier2', 'link'],
    ['Remove', 'i-bi-trash', 'remove'],
  ]
  for (const [label, iconName, mode] of tools) {
    list.appendChild(makeBtn(label, iconName, mode, container))
  }

  addViewControls(sidebar, list, ctx, viewControls)

  // Set start – action button (not a mode toggle)
  const startBtn = makeActionBtn('Toggle start state', 'i-bi-caret-right-square')
  startBtn.setAttribute('data-action', 'set-start')
  startBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (ctx.selectedNodeIds.size !== 1)
      return
    const id = ctx.selectedNodeIds.values().next().value!
    toggleStartState(ctx, id)
  })
  list.appendChild(startBtn)

  // Simulation buttons
  if (ctx.options.simulation) {
    const stepBtn = makeActionBtn('Step', 'i-bi-skip-end-fill')
    stepBtn.setAttribute('data-action', 'sim-step')
    stepBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.simulation?.step()
    })
    list.appendChild(stepBtn)

    const replayBtn = makeActionBtn('Replay', 'i-bi-arrow-repeat')
    replayBtn.setAttribute('data-action', 'sim-replay')
    replayBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.simulation?.reset()
    })
    list.appendChild(replayBtn)
  }

  // Undo / Redo
  if (ctx.history) {
    const undoBtn = makeActionBtn('Undo', 'i-bi-arrow-counterclockwise')
    undoBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.history!.undo()
    })
    list.appendChild(undoBtn)

    const redoBtn = makeActionBtn('Redo', 'i-bi-arrow-clockwise')
    redoBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.history!.redo()
    })
    list.appendChild(redoBtn)
  }

  // Manual validate (when validation is enabled but auto-validate is off)
  if (ctx.validationEnabled && !ctx.autoValidate) {
    const validateBtn = makeActionBtn('Validate', 'i-bi-check2-all')
    validateBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      runValidation(ctx)
    })
    list.appendChild(validateBtn)
  }

  // Clear all
  const clearBtn = makeActionBtn('Clear all', 'i-bi-trash-fill', 'fsm-tool-btn-danger')
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const nodeCount = Object.keys(ctx.fsmState.nodes).length
    if (nodeCount === 0)
      return
    // eslint-disable-next-line no-alert
    if (!confirm(`Remove all ${nodeCount} state${nodeCount === 1 ? '' : 's'} and their transitions?`))
      return
    for (const id of Object.keys(ctx.fsmState.nodes)) {
      removeNode(id)
    }
  })
  list.appendChild(clearBtn)

  // Debug: copy JSON
  if (ctx.options.debug) {
    const copyBtn = makeActionBtn('Copy JSON', 'i-bi-clipboard')
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const json = JSON.stringify(ctx.fsmState, null, 2)
      try {
        await copyToClipboard(json)
      }
      catch (err) {
        if (ctx.options.debug)
          console.error('FSM: copy to clipboard failed', err)
        // eslint-disable-next-line no-alert
        alert(json)
      }
      // eslint-disable-next-line no-alert
      alert('FSM JSON copied to clipboard')
    })
    list.appendChild(copyBtn)
  }

  toggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'))

  sidebar.appendChild(toggle)
  sidebar.appendChild(list)
  container.appendChild(sidebar)
}
