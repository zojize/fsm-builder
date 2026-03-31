import type { FSMContext } from './context'
import { parse as parseBooleanExpression } from '../booleanParser.peggy'
import { evaluateBooleanExpression } from '../fsmHelpers'
import { createIconElement } from './icons'

const VAR_REGEX = /^[a-z]$/i

export interface SimulationController {
  readonly active: boolean
  start: () => void
  step: () => void
  reset: () => void
  exit: () => void
  destroy: () => void
}

export function createSimulation(ctx: FSMContext): SimulationController {
  let active = false
  let currentNodeId: string | undefined
  let panel: HTMLDivElement | null = null
  let variableInputEls: Record<string, HTMLInputElement> = {}
  let errorTimer: number | undefined

  const controller: SimulationController = {
    get active() { return active },

    start() {
      if (active)
        return
      active = true
      const variables = getVariables()
      panel = createPanel(variables)
      ctx.fsmContainer.appendChild(panel)
    },

    step() {
      if (!active)
        this.start()

      if (!currentNodeId) {
        if (!ctx.fsmState.start) {
          showError('No start state defined')
          return
        }
        currentNodeId = ctx.fsmState.start
        highlightNode(currentNodeId)
        return
      }

      const node = ctx.fsmState.nodes[currentNodeId]
      if (!node) {
        showError('Current state not found')
        return
      }

      const variables = getVariables()
      const context: Record<string, boolean> = {}
      for (const v of variables) {
        const inputVal = variableInputEls[v]?.value ?? ''
        if (inputVal.length === 0) {
          showError(`No more input for variable ${v}`)
          return
        }
        context[v] = inputVal[0] === '1'
      }

      const targets: string[] = []
      for (const t of node.transitions) {
        try {
          const expr = parseBooleanExpression(t.label, { alphabet: variables })
          if (evaluateBooleanExpression(expr, context))
            targets.push(t.to)
        }
        catch {
          // skip invalid expressions
        }
      }

      if (targets.length === 1) {
        currentNodeId = targets[0]
        highlightNode(currentNodeId)
        for (const v of variables) {
          const el = variableInputEls[v]
          if (el)
            el.value = el.value.slice(1)
        }
      }
      else if (targets.length > 1) {
        showError('Nondeterministic: multiple transitions match')
      }
      else {
        showError('No valid transition found')
      }
    },

    reset() {
      currentNodeId = undefined
      highlightNode(undefined)
    },

    exit() {
      this.reset()
      clearTimeout(errorTimer)
      panel?.remove()
      panel = null
      variableInputEls = {}
      active = false
    },

    destroy() {
      this.exit()
    },
  }

  // Reset if the current node is removed
  const onNodeRemoved = ({ id }: { id: string }) => {
    if (id === currentNodeId)
      controller.reset()
  }
  ctx.emitter.on('node:removed', onNodeRemoved)
  ctx.destroyCallbacks.push(() => ctx.emitter.off('node:removed', onNodeRemoved))

  return controller

  function getVariables(): string {
    const simOpts = typeof ctx.options.simulation === 'object' ? ctx.options.simulation : {}
    if (simOpts.variables)
      return simOpts.variables
    return detectVariables()
  }

  function detectVariables(): string {
    const vars = new Set<string>()
    for (const node of Object.values(ctx.fsmState.nodes)) {
      for (const t of node.transitions) {
        for (const ch of t.label) {
          if (VAR_REGEX.test(ch))
            vars.add(ch)
        }
      }
    }
    return [...vars].sort().join('')
  }

  function highlightNode(nodeId: string | undefined): void {
    const prev = ctx.nodesGroup.querySelector('.fsm-node-circle.fsm-sim-active')
    prev?.classList.remove('fsm-sim-active')
    if (nodeId) {
      const circle = ctx.nodesGroup.querySelector(
        `g.fsm-node[data-node-id="${nodeId}"] .fsm-node-circle`,
      )
      circle?.classList.add('fsm-sim-active')
    }
  }

  function showError(msg: string): void {
    if (!panel)
      return
    clearTimeout(errorTimer)
    let errorEl = panel.querySelector<HTMLDivElement>('.fsm-sim-error')
    if (!errorEl) {
      errorEl = document.createElement('div')
      errorEl.className = 'fsm-sim-error'
      panel.appendChild(errorEl)
    }
    errorEl.textContent = msg
    errorEl.style.opacity = '1'
    errorTimer = window.setTimeout(() => {
      errorEl?.remove()
    }, 3000)
  }

  function createPanel(variables: string): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'fsm-sim-panel'

    // Header
    const header = document.createElement('div')
    header.className = 'fsm-sim-panel-header'
    const title = document.createElement('span')
    title.textContent = 'Simulation'
    header.appendChild(title)

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'fsm-sim-close'
    closeBtn.setAttribute('aria-label', 'Close simulation')
    closeBtn.title = 'Close simulation'
    closeBtn.appendChild(createIconElement('i-bi-x-lg'))
    closeBtn.addEventListener('click', () => controller.exit())
    header.appendChild(closeBtn)
    el.appendChild(header)

    // Variable input rows
    variableInputEls = {}
    for (const v of variables) {
      const row = document.createElement('div')
      row.className = 'fsm-sim-var-row'

      const label = document.createElement('span')
      label.className = 'fsm-sim-var-label'
      label.textContent = v
      row.appendChild(label)

      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'fsm-sim-var-input'
      input.placeholder = `${v} input`
      input.addEventListener('keydown', (e) => {
        if (e.key !== '0' && e.key !== '1' && e.key !== 'Backspace' && e.key !== 'Delete'
          && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Tab'
          && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
        }
      })
      row.appendChild(input)

      variableInputEls[v] = input
      el.appendChild(row)
    }

    return el
  }
}
