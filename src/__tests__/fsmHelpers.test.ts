import { describe, expect, it } from 'vitest'
import { parse as parseBooleanExpression } from '../booleanParser.peggy'
import { evaluateBooleanExpression, validateBooleanExpression } from '../fsmHelpers'

describe('validateBooleanExpression', () => {
  it('accepts valid expressions', () => {
    expect(validateBooleanExpression('a+b')).toBe(true)
    expect(validateBooleanExpression('a', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('ab', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('a\'', { alphabet: 'a' })).toBe(true)
    expect(validateBooleanExpression('(a+b)', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('1')).toBe(true)
    expect(validateBooleanExpression('0')).toBe(true)
  })

  it('rejects variables outside the alphabet', () => {
    const result = validateBooleanExpression('c', { alphabet: 'ab' })
    expect(result).toBeTypeOf('string')
    expect(result).toContain('not in allowed alphabet')
  })

  it('rejects malformed expressions', () => {
    expect(validateBooleanExpression('')).toBeTypeOf('string')
    expect(validateBooleanExpression('+')).toBeTypeOf('string')
    expect(validateBooleanExpression('(a')).toBeTypeOf('string')
  })
})

describe('evaluateBooleanExpression', () => {
  function evaluate(expr: string, context: Record<string, boolean>) {
    const parsed = parseBooleanExpression(expr)
    return evaluateBooleanExpression(parsed, context)
  }

  it('evaluates variables', () => {
    expect(evaluate('a', { a: true })).toBe(true)
    expect(evaluate('a', { a: false })).toBe(false)
  })

  it('evaluates OR (add)', () => {
    expect(evaluate('a+b', { a: false, b: false })).toBe(false)
    expect(evaluate('a+b', { a: true, b: false })).toBe(true)
    expect(evaluate('a+b', { a: false, b: true })).toBe(true)
    expect(evaluate('a+b', { a: true, b: true })).toBe(true)
  })

  it('evaluates AND (implicit multiply)', () => {
    expect(evaluate('ab', { a: false, b: false })).toBe(false)
    expect(evaluate('ab', { a: true, b: false })).toBe(false)
    expect(evaluate('ab', { a: false, b: true })).toBe(false)
    expect(evaluate('ab', { a: true, b: true })).toBe(true)
  })

  it('evaluates NOT', () => {
    expect(evaluate('a\'', { a: true })).toBe(false)
    expect(evaluate('a\'', { a: false })).toBe(true)
  })

  it('evaluates constants', () => {
    expect(evaluate('1', {})).toBe(true)
    expect(evaluate('0', {})).toBe(false)
  })

  it('handles complex expressions', () => {
    // a'b + ab' (XOR)
    expect(evaluate('a\'b+ab\'', { a: false, b: false })).toBe(false)
    expect(evaluate('a\'b+ab\'', { a: true, b: false })).toBe(true)
    expect(evaluate('a\'b+ab\'', { a: false, b: true })).toBe(true)
    expect(evaluate('a\'b+ab\'', { a: true, b: true })).toBe(false)
  })

  it('respects operator precedence (NOT > AND > OR)', () => {
    // a+b' should be a OR (NOT b), not (NOT (a OR b))
    expect(evaluate('a+b\'', { a: true, b: true })).toBe(true)
    expect(evaluate('a+b\'', { a: false, b: false })).toBe(true)
    expect(evaluate('a+b\'', { a: false, b: true })).toBe(false)
  })

  it('handles parentheses', () => {
    // (a+b)' should be NOT (a OR b)
    expect(evaluate('(a+b)\'', { a: false, b: false })).toBe(true)
    expect(evaluate('(a+b)\'', { a: true, b: false })).toBe(false)
  })
})
