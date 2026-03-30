import * as booleanParser from './booleanParser'

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
