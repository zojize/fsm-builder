import type { FSMState } from './fsm/types'
import * as booleanParser from './booleanParser.peggy'

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
    case 'not':
      return !evaluateBooleanExpression(expr.operand, context)
    case 'var':
      return !!context[expr.symbol]
    case 'true':
      return true
    case 'false':
      return false
  }
}

/** Strip positional data (x, y, radius, offset) from an FSM state, keeping only logical structure. */
export function logicOnlyFsm(state: FSMState) {
  return {
    start: state.start,
    nodes: Object.fromEntries(Object.entries(state.nodes)
      .map(([id, node]) => [
        id,
        {
          label: node.label,
          innerLabel: node.innerLabel,
          transitions: node.transitions.map(({ to, label }) => ({ to, label })),
        },
      ])),
  }
}
