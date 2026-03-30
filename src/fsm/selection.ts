import type { FSMContext } from './context'
import type { EdgeId, NodeId } from './types'

/** Select a single node by id, clearing any prior selection. */
export function selectNode(ctx: FSMContext, id: NodeId | null): void {
  clearSelection(ctx)
  if (id && id in ctx.fsmState.nodes) {
    ctx.selectedNodeIds.add(id)
    nodeCircle(ctx, id)?.classList.add('selected')
  }
  emitSelectionChanged(ctx)
}

/** Add a node to the current selection without clearing other selected nodes. */
export function addNodeToSelection(ctx: FSMContext, id: NodeId): void {
  if (!(id in ctx.fsmState.nodes))
    return
  clearEdgeSelectionVisual(ctx)
  ctx.selectedNodeIds.add(id)
  nodeCircle(ctx, id)?.classList.add('selected')
  emitSelectionChanged(ctx)
}

/** Remove a node from the current selection. */
export function removeNodeFromSelection(ctx: FSMContext, id: NodeId): void {
  ctx.selectedNodeIds.delete(id)
  nodeCircle(ctx, id)?.classList.remove('selected')
  emitSelectionChanged(ctx)
}

/** Select a single edge by id, clearing any prior selection. */
export function selectEdge(ctx: FSMContext, id: EdgeId | null): void {
  clearSelection(ctx)
  if (id && id in ctx.edgeIdToTransition) {
    ctx.selectedEdgeIds.add(id)
    edgeGroup(ctx, id)?.classList.add('selected')
  }
  emitSelectionChanged(ctx)
}

/** Add an edge to the current selection without clearing other selected edges. */
export function addEdgeToSelection(ctx: FSMContext, id: EdgeId): void {
  if (!(id in ctx.edgeIdToTransition))
    return
  clearNodeSelectionVisual(ctx)
  ctx.selectedEdgeIds.add(id)
  edgeGroup(ctx, id)?.classList.add('selected')
  emitSelectionChanged(ctx)
}

/** Remove an edge from the current selection. */
export function removeEdgeFromSelection(ctx: FSMContext, id: EdgeId): void {
  ctx.selectedEdgeIds.delete(id)
  edgeGroup(ctx, id)?.classList.remove('selected')
  emitSelectionChanged(ctx)
}

/** Clear all selection state (nodes and edges). */
export function clearSelection(ctx: FSMContext): void {
  clearNodeSelectionVisual(ctx)
  clearEdgeSelectionVisual(ctx)
  emitSelectionChanged(ctx)
}

/** Emit a `selection:changed` event with the current selection state. */
export function emitSelectionChanged(ctx: FSMContext): void {
  ctx.emitter.emit('selection:changed', {
    nodeIds: [...ctx.selectedNodeIds],
    edgeIds: [...ctx.selectedEdgeIds],
  })
}

/**
 * Synchronise the visual selection state of all nodes to match a target set.
 * Nodes in `target` get the `selected` class; all others lose it.
 * Updates `ctx.selectedNodeIds` in-place. Does **not** emit.
 */
export function syncNodeSelection(ctx: FSMContext, target: ReadonlySet<NodeId>): void {
  // Remove from nodes no longer selected
  for (const id of ctx.selectedNodeIds) {
    if (!target.has(id))
      nodeCircle(ctx, id)?.classList.remove('selected')
  }
  // Add to newly selected nodes
  for (const id of target) {
    if (!ctx.selectedNodeIds.has(id))
      nodeCircle(ctx, id)?.classList.add('selected')
  }
  ctx.selectedNodeIds.clear()
  for (const id of target)
    ctx.selectedNodeIds.add(id)
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function nodeCircle(ctx: FSMContext, id: NodeId) {
  return ctx.nodesGroup.querySelector<SVGCircleElement>(
    `g.fsm-node[data-node-id="${id}"] circle.fsm-node-circle`,
  )
}

function edgeGroup(ctx: FSMContext, id: EdgeId) {
  return ctx.edgesGroup.querySelector<SVGGElement>(
    `g.fsm-edge[data-edge-id="${id}"]`,
  )
}

function clearNodeSelectionVisual(ctx: FSMContext): void {
  for (const nodeId of ctx.selectedNodeIds)
    nodeCircle(ctx, nodeId)?.classList.remove('selected')
  ctx.selectedNodeIds.clear()
}

function clearEdgeSelectionVisual(ctx: FSMContext): void {
  for (const edgeId of ctx.selectedEdgeIds)
    edgeGroup(ctx, edgeId)?.classList.remove('selected')
  ctx.selectedEdgeIds.clear()
}
