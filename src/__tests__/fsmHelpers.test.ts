import { describe, expect, it } from 'vitest'
import { parse as parseBooleanExpression } from '../booleanParser.peggy'
import { evaluateBooleanExpression, logicOnlyFsm, validateBooleanExpression } from '../fsmHelpers'

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

  it('accepts expressions with whitespace', () => {
    expect(validateBooleanExpression('a + b', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('a +b', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('a+ b', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression(' a + b ', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('( a + b )', { alphabet: 'ab' })).toBe(true)
    expect(validateBooleanExpression('a * b', { alphabet: 'ab' })).toBe(true)
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

  it('handles whitespace around operators', () => {
    // All whitespace variants should produce the same result as no-whitespace
    expect(evaluate('a\'b + ab\'', { a: true, b: false })).toBe(true)
    expect(evaluate('a\'b +ab\'', { a: true, b: false })).toBe(true)
    expect(evaluate('a\'b+ ab\'', { a: true, b: false })).toBe(true)
    expect(evaluate(' a\'b + ab\' ', { a: true, b: false })).toBe(true)
    expect(evaluate('( a + b )', { a: true, b: false })).toBe(true)
    expect(evaluate('( a + b )\'', { a: true, b: true })).toBe(false)
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

describe('logicOnlyFsm', () => {
  it('strips positional data from nodes and transitions', () => {
    const result = logicOnlyFsm({
      start: 'q0',
      nodes: {
        q0: {
          label: 'q0',
          innerLabel: '',
          x: 100,
          y: 200,
          radius: 30,
          transitions: [
            { to: 'q1', label: 'a', offset: 15 },
            { to: 'q0', label: 'b', offset: 0, rotation: 45 },
          ],
        },
        q1: {
          label: 'q1',
          innerLabel: 'accept',
          x: 300,
          y: 200,
          radius: 30,
          transitions: [],
        },
      },
    })

    expect(result).toMatchInlineSnapshot(`
      {
        "nodes": {
          "q0": {
            "innerLabel": "",
            "label": "q0",
            "transitions": [
              {
                "label": "a",
                "to": "q1",
              },
              {
                "label": "b",
                "to": "q0",
              },
            ],
          },
          "q1": {
            "innerLabel": "accept",
            "label": "q1",
            "transitions": [],
          },
        },
        "start": "q0",
      }
    `)
  })
})
