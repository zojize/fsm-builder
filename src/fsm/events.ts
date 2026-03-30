import type { EdgeId, FSMNode, FSMState, FSMTransition, NodeId } from './types'

/**
 * Strongly-typed map of all public FSM events.
 * Each key is an event name; each value is its detail payload type.
 */
export interface FSMEventMap {
  // Node lifecycle
  /** A new node was added to the FSM. */
  'node:added': { id: NodeId, node: FSMNode }
  /** A node was removed from the FSM. */
  'node:removed': { id: NodeId }
  /** A node is being dragged (fires frequently). */
  'node:moved': { id: NodeId, node: FSMNode }
  /** A node's `label` or `innerLabel` changed. */
  'node:changed': { id: NodeId, node: FSMNode }

  // Node semantic completion (for undo/redo)
  /** A node drag finished (pointer up). */
  'node:move-end': { id: NodeId, node: FSMNode }
  /** A node's label input was committed (blur). */
  'node:committed': { id: NodeId }

  // Edge lifecycle
  /** A new edge/transition was added. */
  'edge:added': { id: EdgeId, from: NodeId, transition: FSMTransition }
  /** An edge/transition was removed. */
  'edge:removed': { id: EdgeId }
  /** An edge's label or geometry changed. */
  'edge:changed': { id: EdgeId, transition: FSMTransition }

  // Edge semantic completion (for undo/redo)
  /** An edge drag finished (pointer up). */
  'edge:move-end': { id: EdgeId }
  /** An edge's label input was committed (blur). */
  'edge:committed': { id: EdgeId }

  // Selection
  /** Selection changed (node, edge, or cleared). */
  'selection:changed': { nodeIds: NodeId[], edgeIds: EdgeId[] }

  // FSM structure
  /** The start state changed. */
  'start:changed': { start: NodeId | undefined }

  // Debounced catch-all
  /** Fired (debounced) after any mutation settles. Payload is the full FSM state. */
  'change': FSMState

  // Per-node internal events (the NodeId is encoded in the event key)
  /** Node-position update — fires on every drag tick for the specific node. */
  [K: `fsm:${string}-update-pos`]: FSMNode
  /** Node-remove signal — fires before the node's listeners are torn down. */
  [K: `fsm:${string}-remove`]: undefined
}

/** Callback signature for a typed FSM event handler. */
export type FSMEventHandler<K extends keyof FSMEventMap> = (detail: FSMEventMap[K]) => void | Promise<void>

/** Event emitter shared across FSM sub-modules. */
export interface FSMEventEmitter {
  emit: <K extends keyof FSMEventMap>(event: K, detail: FSMEventMap[K]) => void
  on: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>, options?: { signal?: AbortSignal }) => () => void
  off: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>) => void
}

/**
 * Public interface returned by {@link createFSMBuilder}.
 * Provides typed event subscription and basic state access.
 */
export interface FSMBuilderAPI {
  /**
   * Subscribe to a typed FSM event.
   * @returns An unsubscribe function.
   */
  on: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>, options?: { signal?: AbortSignal }) => () => void
  /** Unsubscribe a previously-registered handler. */
  off: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>) => void
  /** Get the current FSM state. Treat the returned object as read-only. */
  getState: () => Readonly<FSMState>
  /** Tear down the FSM builder, releasing DOM elements and event listeners. */
  destroy: () => void
  /** Undo the last semantic operation. */
  undo: () => void
  /** Redo the last undone operation. */
  redo: () => void
}

/** Create a new event emitter instance. */
export function createEventEmitter(): FSMEventEmitter {
  const listeners = new Map<string, Set<FSMEventHandler<keyof FSMEventMap>>>()

  return {
    emit(event, detail) {
      const set = listeners.get(event)
      if (!set)
        return
      for (const handler of [...set]) {
        try {
          handler(detail)
        }
        catch {
          // ignore
        }
      }
    },

    on(event, handler, options) {
      if (options?.signal?.aborted)
        return () => {}
      if (!listeners.has(event))
        listeners.set(event, new Set())
      listeners.get(event)!.add(handler as FSMEventHandler<keyof FSMEventMap>)
      const unsubscribe = () => {
        listeners.get(event)?.delete(handler as FSMEventHandler<keyof FSMEventMap>)
      }
      options?.signal?.addEventListener('abort', unsubscribe, { once: true })
      return unsubscribe
    },

    off(event, handler) {
      listeners.get(event)?.delete(handler as FSMEventHandler<keyof FSMEventMap>)
    },
  }
}
