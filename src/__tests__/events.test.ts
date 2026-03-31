import { describe, expect, it, vi } from 'vitest'
import { createEventEmitter } from '../fsm/events'

describe('createEventEmitter', () => {
  it('emits events to registered handlers', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    emitter.on('node:added', handler)
    const detail = { id: 'node-0', node: { label: 'q0', innerLabel: '', x: 0, y: 0, radius: 30, transitions: [] } }
    emitter.emit('node:added', detail)
    expect(handler).toHaveBeenCalledWith(detail)
  })

  it('supports multiple handlers for the same event', () => {
    const emitter = createEventEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()
    emitter.on('node:removed', h1)
    emitter.on('node:removed', h2)
    emitter.emit('node:removed', { id: 'node-0' })
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('does not fire handlers for unrelated events', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    emitter.on('node:added', handler)
    emitter.emit('node:removed', { id: 'node-0' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribes via returned function', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    const unsub = emitter.on('node:removed', handler)
    unsub()
    emitter.emit('node:removed', { id: 'node-0' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribes via off()', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    emitter.on('node:removed', handler)
    emitter.off('node:removed', handler)
    emitter.emit('node:removed', { id: 'node-0' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles AbortSignal', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    const ac = new AbortController()
    emitter.on('node:removed', handler, { signal: ac.signal })
    ac.abort()
    emitter.emit('node:removed', { id: 'node-0' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns noop unsubscribe for already-aborted signal', () => {
    const emitter = createEventEmitter()
    const handler = vi.fn()
    const ac = new AbortController()
    ac.abort()
    const unsub = emitter.on('node:removed', handler, { signal: ac.signal })
    emitter.emit('node:removed', { id: 'node-0' })
    expect(handler).not.toHaveBeenCalled()
    expect(unsub).toBeTypeOf('function')
  })

  it('silently ignores errors in handlers', () => {
    const emitter = createEventEmitter()
    const bad = vi.fn(() => {
      throw new Error('oops')
    })
    const good = vi.fn()
    emitter.on('node:removed', bad)
    emitter.on('node:removed', good)
    expect(() => emitter.emit('node:removed', { id: 'node-0' })).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})
