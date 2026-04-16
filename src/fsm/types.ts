export type NodeId = string
export type EdgeId = string
export type FontSizeBreakpoint = number | string | Record<number, string>

/** Validation options for a single input type (node label, inner label, or edge label). */
export interface ValidateOptions {
  inputAttributes?: Partial<HTMLElementTagNameMap['input']>
  validate?: (input: string, fsmState: FSMState, nodeOrTransition: FSMNode | FSMTransition) => boolean | string | void
}

/** Options accepted by {@link createFSMBuilder}. */
export interface FSMOptions {
  container: string
  svgAttributes?: Partial<SVGElementTagNameMap['svg']>
  initialState?: FSMState
  defaultRadius?: number
  fontFamily?: string
  readonly?: boolean
  debug?: boolean
  sidebar?: boolean
  scale?: number
  onChange?: (state: FSMState) => void
  maxHistory?: number
  fontSizeBreakpoints?: {
    innerNode?: FontSizeBreakpoint
    outerNode?: FontSizeBreakpoint
    edge?: FontSizeBreakpoint
  }
  validate?: false | {
    edge?: ValidateOptions
    innerNode?: ValidateOptions
    outerNode?: ValidateOptions
    container?: string
    /** When true, invalid inputs are only highlighted on hover over the error message. Default: false (always highlighted). */
    highlightOnHover?: boolean
  }
  /** When true, validation runs automatically on every change. Default: false. */
  autoValidate?: boolean
  /** Snap distance in SVG units for node alignment during drag. Nodes snap to the x/y of nearby nodes within this threshold. `0` disables snapping. Default: `8`. */
  snapDistance?: number
  /** Enable built-in FSM simulation. Pass `true` for auto-detected variables or an options object. */
  simulation?: boolean | {
    /** Variable alphabet, e.g. `"ab"`. If omitted, auto-detected from edge labels. */
    variables?: string
  }
}

/** A transition (directed edge) between two FSM states. */
export interface FSMTransition {
  to: NodeId
  label: string
  offset: number
  rotation?: number
}

/** A state (node) in the FSM. */
export interface FSMNode {
  label: string
  x: number
  y: number
  radius: number
  transitions: FSMTransition[]
  innerLabel: string
}

/** The full serialisable FSM data model. */
export interface FSMState {
  start?: NodeId
  nodes: Record<NodeId, FSMNode>
}

/** Payload for the `fsm:update` SVG custom-event when a node is created. */
export interface FSMNewNodeEvent {
  type: 'new-node'
  id: NodeId
}

/** Payload for the `fsm:update` SVG custom-event when a node is removed. */
export interface FSMRemoveNodeEvent {
  type: 'remove-node'
  id: NodeId
}

/** Union of all `fsm:update` custom-event payload types. */
export type FSMUpdateEvent = FSMNewNodeEvent | FSMRemoveNodeEvent
