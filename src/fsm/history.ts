import type { FSMContext } from './context'
import type { FSMEventMap } from './events'
import type { FSMState } from './types'

export interface FSMHistory {
  undo: () => void
  redo: () => void
  destroy: () => void
}

/** Events that represent a completed semantic user operation. */
const HISTORY_EVENTS: (keyof FSMEventMap)[] = [
  'node:added',
  'node:removed',
  'node:move-end',
  'node:committed',
  'edge:added',
  'edge:removed',
  'edge:move-end',
  'edge:committed',
  'start:changed',
]

export function createHistory(
  ctx: FSMContext,
  loadState: (snapshot: FSMState) => void,
  maxHistory?: number,
): FSMHistory {
  const undoStack: FSMState[] = []
  const redoStack: FSMState[] = []
  let isRestoring = false

  function snapshot(): FSMState {
    return structuredClone(ctx.fsmState)
  }

  function capture() {
    if (isRestoring)
      return
    if (ctx.suppressHistoryCapture)
      return
    const s = snapshot()
    // Skip if the state hasn't changed since the last capture (e.g. node:committed
    // after node:added with no label edits produces an identical snapshot).
    if (undoStack.length > 0 && JSON.stringify(s) === JSON.stringify(undoStack.at(-1)))
      return
    undoStack.push(s)
    if (maxHistory && undoStack.length > maxHistory)
      undoStack.shift()
    redoStack.length = 0
  }

  // Seed with the initial state
  undoStack.push(snapshot())

  // Subscribe to all semantic events
  const unsubscribers = HISTORY_EVENTS.map(event =>
    ctx.emitter.on(event, () => capture()),
  )

  function undo() {
    if (undoStack.length <= 1)
      return
    redoStack.push(undoStack.pop()!)
    isRestoring = true
    loadState(structuredClone(undoStack.at(-1)!))
    isRestoring = false
  }

  function redo() {
    if (redoStack.length === 0)
      return
    const target = redoStack.pop()!
    undoStack.push(target)
    isRestoring = true
    loadState(structuredClone(target))
    isRestoring = false
  }

  function destroy() {
    for (const unsub of unsubscribers)
      unsub()
    undoStack.length = 0
    redoStack.length = 0
  }

  ctx.destroyCallbacks.push(destroy)

  return { undo, redo, destroy }
}
