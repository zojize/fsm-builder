import type { FSMEventEmitter } from './events'
import type { FSMHistory } from './history'
import type { EdgeId, FSMNode, FSMOptions, FSMState, FSMTransition, NodeId } from './types'

/**
 * Shared context passed into every FSM sub-module.
 * Contains mutable state, DOM references and options – essentially the
 * "this" that would otherwise be captured via a big closure.
 */
export interface FSMContext {
  // Options
  readonly options: Required<Omit<FSMOptions, 'onChange' | 'maxHistory'>> & { onChange?: FSMOptions['onChange'], maxHistory?: number }
  /** Resolved validate config (always present after init). */
  readonly validateConfig: FSMOptions['validate']
  readonly validationEnabled: boolean
  readonly autoValidate: boolean

  // DOM references
  readonly fsmContainer: HTMLElement
  readonly svg: SVGSVGElement
  readonly defs: SVGDefsElement
  readonly edgesGroup: SVGGElement
  readonly nodesGroup: SVGGElement
  readonly overlay: SVGGElement
  /** Unique mask id for this instance */
  readonly maskId: string

  // FSM state
  readonly fsmState: FSMState

  // Node tracking
  readonly nodeAbortControllers: Record<NodeId, AbortController>

  // Edge tracking
  readonly edgeIdToTransition: Record<EdgeId, [NodeId, FSMTransition, AbortController]>

  // Id generators
  createNodeId: () => NodeId
  createEdgeId: () => EdgeId
  getNode: (id: NodeId) => FSMNode | undefined

  // Selection (multi-select)
  selectedNodeIds: Set<NodeId>
  selectedEdgeIds: Set<EdgeId>

  // Event emitter
  readonly emitter: FSMEventEmitter

  // Validation element
  validationEl: HTMLDivElement | null

  // Teardown
  /** Called by destroy() to clean up module-level listeners */
  readonly destroyCallbacks: Array<() => void>

  // Debounce helper
  tryOnChange: (state: FSMState) => void

  /**
   * When `true`, history captures are suppressed.
   * Used during `removeNode` to prevent each cascading `edge:removed` event
   * from creating its own history entry — node removal should be atomic.
   */
  suppressHistoryCapture: boolean

  // Undo/redo
  history: FSMHistory | null

  // Default font sizes
  readonly defaultEdgeFontSize: string
  readonly defaultInnerNodeFontSize: string
  readonly defaultOuterNodeFontSize: string
}
