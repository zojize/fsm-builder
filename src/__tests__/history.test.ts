import type { FSMContext } from '../fsm/context'
import type { FSMState } from '../fsm/types'
import { describe, expect, it, vi } from 'vitest'
import { createEventEmitter } from '../fsm/events'
import { createHistory } from '../fsm/history'

function createMockCtx(initialState?: FSMState): FSMContext {
  const state: FSMState = initialState ?? { nodes: {} }
  return {
    fsmState: state,
    emitter: createEventEmitter(),
    suppressHistoryCapture: false,
    destroyCallbacks: [],
  } as unknown as FSMContext
}

describe('createHistory', () => {
  it('seeds with initial state', () => {
    const ctx = createMockCtx({ start: 'q0', nodes: { q0: { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] } } })
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    // Can't undo from initial state
    history.undo()
    expect(loadState).not.toHaveBeenCalled()
  })

  it('captures state on semantic events and supports undo', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    // Simulate adding a node
    ctx.fsmState.nodes.q0 = { label: 'q0', innerLabel: '', x: 10, y: 20, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q0', node: ctx.fsmState.nodes.q0 })

    // Undo should restore to empty state
    history.undo()
    expect(loadState).toHaveBeenCalledTimes(1)
    const restored = loadState.mock.calls[0][0] as FSMState
    expect(Object.keys(restored.nodes)).toHaveLength(0)
  })

  it('supports redo after undo', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    ctx.fsmState.nodes.q0 = { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q0', node: ctx.fsmState.nodes.q0 })

    history.undo()
    history.redo()

    expect(loadState).toHaveBeenCalledTimes(2)
    const redone = loadState.mock.calls[1][0] as FSMState
    expect(redone.nodes).toHaveProperty('q0')
  })

  it('clears redo stack on new capture', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    // State 1
    ctx.fsmState.nodes.q0 = { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q0', node: ctx.fsmState.nodes.q0 })

    history.undo()

    // New change after undo should clear redo
    ctx.fsmState.nodes.q1 = { label: 'q1', innerLabel: '', x: 50, y: 50, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q1', node: ctx.fsmState.nodes.q1 })

    history.redo()
    // Should not redo (redo stack was cleared)
    expect(loadState).toHaveBeenCalledTimes(1) // only the first undo
  })

  it('respects maxHistory limit', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState, 3)

    // Create 5 state changes
    for (let i = 0; i < 5; i++) {
      ctx.fsmState.nodes[`q${i}`] = { label: `q${i}`, innerLabel: '', x: i * 10, y: 0, radius: 30, transitions: [] }
      ctx.emitter.emit('node:added', { id: `q${i}`, node: ctx.fsmState.nodes[`q${i}`] })
    }

    // Should only be able to undo maxHistory-1 times (3 entries, 2 undos)
    history.undo()
    history.undo()
    history.undo() // should be noop
    history.undo() // should be noop

    // loadState called only twice (the 3rd and 4th undo are noops)
    expect(loadState).toHaveBeenCalledTimes(2)
  })

  it('skips duplicate snapshots', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    // Emit event without changing state
    ctx.emitter.emit('node:committed', { id: 'q0' })
    ctx.emitter.emit('node:committed', { id: 'q0' })

    // Undo should be noop since no actual state change
    history.undo()
    expect(loadState).not.toHaveBeenCalled()
  })

  it('skips capture when suppressHistoryCapture is true', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    ctx.suppressHistoryCapture = true
    ctx.fsmState.nodes.q0 = { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q0', node: ctx.fsmState.nodes.q0 })
    ctx.suppressHistoryCapture = false

    history.undo()
    expect(loadState).not.toHaveBeenCalled()
  })

  it('unsubscribes on destroy', () => {
    const ctx = createMockCtx()
    const loadState = vi.fn()
    const history = createHistory(ctx, loadState)

    history.destroy()

    ctx.fsmState.nodes.q0 = { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] }
    ctx.emitter.emit('node:added', { id: 'q0', node: ctx.fsmState.nodes.q0 })

    history.undo()
    expect(loadState).not.toHaveBeenCalled()
  })
})
