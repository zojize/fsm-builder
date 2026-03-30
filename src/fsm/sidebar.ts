import type { FSMContext } from './context'
import { copyToClipboard } from './dom'
import { createIconElement } from './icons'
import { runValidation } from './validation'

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

/**
 * Create and append the editing sidebar to `container`.
 * Requires access to the full FSM context so it can trigger clear-all and copy JSON.
 */
export function createSidebar(container: HTMLElement, ctx: FSMContext, removeNode: (id: string) => void): void {
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

  // Set start – action button (not a mode toggle)
  const startBtn = makeActionBtn('Toggle start state', 'i-bi-caret-right-square')
  startBtn.setAttribute('data-action', 'set-start')
  startBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (ctx.selectedNodeIds.size !== 1)
      return
    const id = ctx.selectedNodeIds.values().next().value!
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
  })
  list.appendChild(startBtn)

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
