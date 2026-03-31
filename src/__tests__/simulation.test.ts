import type { FSMContext } from '../fsm/context'
import type { FSMState } from '../fsm/types'
import { describe, expect, it } from 'vitest'
import { createEventEmitter } from '../fsm/events'
import { createSimulation } from '../fsm/simulation'

function createMockCtx(state: FSMState, simulation: FSMContext['options']['simulation'] = true): FSMContext {
  const container = document.createElement('div')
  container.classList.add('fsm-builder')
  document.body.appendChild(container)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  container.appendChild(svg)
  const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  nodesGroup.classList.add('fsm-nodes')
  svg.appendChild(nodesGroup)

  // Create node DOM elements for each node
  for (const [id, node] of Object.entries(state.nodes)) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.classList.add('fsm-node')
    g.setAttribute('data-node-id', id)
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.classList.add('fsm-node-circle')
    circle.setAttribute('cx', `${node.x}`)
    circle.setAttribute('cy', `${node.y}`)
    circle.setAttribute('r', `${node.radius}`)
    g.appendChild(circle)
    nodesGroup.appendChild(g)
  }

  return {
    options: { simulation } as FSMContext['options'],
    fsmState: state,
    fsmContainer: container,
    nodesGroup,
    emitter: createEventEmitter(),
    destroyCallbacks: [],
  } as unknown as FSMContext
}

function makeFSM(): FSMState {
  return {
    start: 'q0',
    nodes: {
      q0: {
        label: 'q0',
        innerLabel: '',
        x: 100,
        y: 100,
        radius: 30,
        transitions: [
          { to: 'q1', label: 'a', offset: 0 },
          { to: 'q0', label: 'a\'', offset: 0 },
        ],
      },
      q1: {
        label: 'q1',
        innerLabel: '',
        x: 200,
        y: 100,
        radius: 30,
        transitions: [],
      },
    },
  }
}

describe('createSimulation', () => {
  it('starts inactive', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    expect(sim.active).toBe(false)
    sim.destroy()
  })

  it('becomes active on start()', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.start()
    expect(sim.active).toBe(true)
    sim.destroy()
  })

  it('creates panel DOM on start', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.start()
    expect(ctx.fsmContainer.querySelector('input')).not.toBeNull()
    sim.destroy()
  })

  it('panel snapshot', () => {
    const ctx = createMockCtx(makeFSM(), { variables: 'ab' })
    const sim = createSimulation(ctx)
    sim.start()
    const panel = ctx.fsmContainer.querySelector('div')!
    // panel has header + 2 variable rows
    expect(panel.children.length).toMatchInlineSnapshot(`3`)
    expect(panel.querySelectorAll('input').length).toMatchInlineSnapshot(`2`)
    sim.destroy()
  })

  it('removes panel on exit()', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.start()
    sim.exit()
    expect(sim.active).toBe(false)
    expect(ctx.fsmContainer.querySelector('input')).toBeNull()
    sim.destroy()
  })

  it('first step highlights start state', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.step() // auto-starts
    const circle = ctx.nodesGroup.querySelector('[data-node-id="q0"] .fsm-node-circle')
    expect(circle?.classList.contains('fsm-sim-active')).toBe(true)
    sim.destroy()
  })

  it('step advances state when transition matches', () => {
    const ctx = createMockCtx(makeFSM(), { variables: 'a' })
    const sim = createSimulation(ctx)
    sim.step() // go to start (q0)

    // Set input for variable 'a' to '1'
    const input = ctx.fsmContainer.querySelector('input') as HTMLInputElement
    input.value = '1'

    sim.step() // should follow a=1 → q1

    const q0Circle = ctx.nodesGroup.querySelector('[data-node-id="q0"] .fsm-node-circle')
    const q1Circle = ctx.nodesGroup.querySelector('[data-node-id="q1"] .fsm-node-circle')
    expect(q0Circle?.classList.contains('fsm-sim-active')).toBe(false)
    expect(q1Circle?.classList.contains('fsm-sim-active')).toBe(true)
    sim.destroy()
  })

  it('step consumes input on transition', () => {
    const ctx = createMockCtx(makeFSM(), { variables: 'a' })
    const sim = createSimulation(ctx)
    sim.step() // go to start

    const input = ctx.fsmContainer.querySelector('input') as HTMLInputElement
    input.value = '10'

    sim.step() // consume first char '1'

    expect(input.value).toBe('0')
    sim.destroy()
  })

  it('shows error when no start state defined', () => {
    const state = makeFSM()
    delete state.start
    const ctx = createMockCtx(state)
    const sim = createSimulation(ctx)
    sim.step()

    const error = ctx.fsmContainer.querySelector('.fsm-sim-error')
    expect(error).not.toBeNull()
    expect(error?.textContent).toContain('No start state')
    sim.destroy()
  })

  it('reset clears highlight', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.step() // highlights q0
    sim.reset()

    const active = ctx.nodesGroup.querySelector('.fsm-sim-active')
    expect(active).toBeNull()
    sim.destroy()
  })

  it('auto-detects variables from edge labels', () => {
    const state: FSMState = {
      start: 'q0',
      nodes: {
        q0: {
          label: 'q0',
          innerLabel: '',
          x: 0,
          y: 0,
          radius: 30,
          transitions: [{ to: 'q0', label: 'x+y', offset: 0 }],
        },
      },
    }
    const ctx = createMockCtx(state)
    const sim = createSimulation(ctx)
    sim.start()

    const inputs = ctx.fsmContainer.querySelectorAll('input')
    expect(inputs.length).toBe(2) // x and y
    sim.destroy()
  })

  it('resets on current node removal', () => {
    const ctx = createMockCtx(makeFSM())
    const sim = createSimulation(ctx)
    sim.step() // highlight q0

    ctx.emitter.emit('node:removed', { id: 'q0' })

    const active = ctx.nodesGroup.querySelector('.fsm-sim-active')
    expect(active).toBeNull()
    sim.destroy()
  })
})
