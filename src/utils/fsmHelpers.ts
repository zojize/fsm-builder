import type { FSMState } from './fsm.js'
import * as booleanParser from './booleanParser.pegjs'

const defaultAlphabet = 'abcdefghijklmnopqrstuvwxyz'

export function validateBooleanExpression(
  input: string,
  { alphabet = defaultAlphabet }: { alphabet?: string } = { alphabet: defaultAlphabet },
): boolean | string {
  try {
    booleanParser.parse(input, { alphabet })
    return true
  }
  catch (e) {
    return (e as any)?.message ?? `Unknown error while parsing: ${e}`
  }
}

export function evaluateBooleanExpression(
  expr: booleanParser.Expression,
  context: Record<string, boolean>,
): boolean {
  switch (expr.type) {
    case 'add':
      return evaluateBooleanExpression(expr.left, context) || evaluateBooleanExpression(expr.right, context)
    case 'mul':
      return evaluateBooleanExpression(expr.left, context) && evaluateBooleanExpression(expr.right, context)
    case 'var':
      return !!context[expr.symbol]
    case 'true':
      return true
    case 'false':
      return false
  }
  throw new Error(`Unknown expression type: ${(expr as any)?.type}`)
}

interface BackwardsCompatibleNode {
  text: string // inner label
  label: string // outer label
  x: number
  y: number
}

interface BackwardsCompatibleLink {
  type: 'Link'
  // node index in nodes array
  nodeA: number
  nodeB: number
  text: string // label
  deltaX: number
  deltaY: number
}

interface BackwardsCompatibleStartLink {
  type: 'StartLink'
  node: number // node index in nodes array
}

interface BackwardsCompatibleState {
  nodes: BackwardsCompatibleNode[]
  links: (BackwardsCompatibleLink | BackwardsCompatibleStartLink)[]
  nodeRadius?: number // optional radius for all nodes
}

export function fsmStateToBackwardsCompatible(state: FSMState): BackwardsCompatibleState {
  const idToIndex: Record<string, number> = {}
  const nodes = Object.entries(state.nodes)
    .map(([id, node], i) => {
      idToIndex[id] = i
      return {
        text: node.innerLabel,
        label: node.label,
        x: node.x,
        y: node.y,
      }
    })

  const links: (BackwardsCompatibleLink | BackwardsCompatibleStartLink)[]
    = Object.entries(state.nodes)
      .flatMap(([id, { transitions }]) => {
        return transitions.map((transition) => {
          return {
            type: 'Link' as const,
            nodeA: idToIndex[id],
            nodeB: idToIndex[transition.to],
            text: transition.label,
            // FIXME: this is not ideal
            deltaX: transition.offset,
            deltaY: transition.offset,
          }
        })
      })

  if (state.start) {
    links.push({
      type: 'StartLink',
      node: idToIndex[state.start],
    })
  }

  return { nodes, links, nodeRadius: Object.values(state.nodes)[0]?.radius ?? 10 }
}

export function fsmStateFromBackwardsCompatible(state: BackwardsCompatibleState): FSMState {
  const nodes: FSMState['nodes'] = {}
  state.nodes.forEach((node, i) => {
    nodes[`node-${i}`] = {
      label: node.label,
      innerLabel: node.text,
      x: node.x,
      y: node.y,
      transitions: [],
      radius: state.nodeRadius ?? 10,
    }
  })

  let start: string | undefined

  state.links.forEach((link) => {
    if (link.type === 'Link') {
      const fromId = `node-${link.nodeA}`
      const toId = `node-${link.nodeB}`
      if (fromId in nodes && toId in nodes) {
        nodes[fromId].transitions.push({
          to: toId,
          label: link.text,
          // FIXME: this is not ideal
          offset: Math.hypot(link.deltaX, link.deltaY),
        })
      }
    }
    else if (link.type === 'StartLink') {
      const toId = `node-${link.node}`
      if (toId in nodes) {
        start = toId
      }
    }
  })

  return { nodes, start }
}

export function logicOnlyFsm(state: FSMState) {
  return {
    start: state.start,
    nodes: Object.fromEntries(Object.entries(state.nodes)
      .map(([id, node]) => (
        [
          id,
          {
            label: node.label,
            innerLabel: node.innerLabel,
            transitions: node.transitions.map(({ offset, ...t }) => t),
          },
        ]
      ))),
  }
}

export function logicOnlyLegacyFsm(state: BackwardsCompatibleState) {
  return {
    nodes: state.nodes.map(({ x, y, ...node }) => node),
    links: state.links.map((link) => {
      if (link.type === 'Link') {
        const { deltaX, deltaY, ...rest } = link
        return rest
      }
      return link
    }),
  }
}
