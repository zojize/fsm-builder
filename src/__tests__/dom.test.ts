import { describe, expect, it } from 'vitest'
import { createFOText, createSvgEl, getFontSize, setFOBounds } from '../fsm/dom'
import { initTemplates } from '../fsm/templates'

describe('getFontSize', () => {
  it('returns px value for number breakpoint', () => {
    expect(getFontSize(3, 16, '20px')).toBe('16px')
  })

  it('returns string breakpoint as-is', () => {
    expect(getFontSize(3, '1.2em', '20px')).toBe('1.2em')
  })

  it('returns default for undefined breakpoint', () => {
    expect(getFontSize(3, undefined, '20px')).toBe('20px')
  })

  it('returns default for empty record', () => {
    expect(getFontSize(3, {}, '20px')).toBe('20px')
  })

  it('selects correct breakpoint from record', () => {
    const bp = { 5: '18px', 8: '15px' }
    expect(getFontSize(3, bp, '20px')).toBe('18px')
    expect(getFontSize(5, bp, '20px')).toBe('18px')
    expect(getFontSize(6, bp, '20px')).toBe('15px')
    expect(getFontSize(10, bp, '20px')).toBe('15px')
  })
})

describe('createSvgEl', () => {
  it('creates an SVG element in SVG namespace', () => {
    const circle = createSvgEl('circle')
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(circle.tagName).toBe('circle')
  })

  it('creates a g element', () => {
    const g = createSvgEl('g')
    expect(g.tagName).toBe('g')
  })
})

describe('setFOBounds', () => {
  it('sets x, y, width, height attributes', () => {
    const fo = createSvgEl('foreignObject')
    setFOBounds(fo, 10, 20, 100, 50)
    expect(fo.getAttribute('x')).toBe('10')
    expect(fo.getAttribute('y')).toBe('20')
    expect(fo.getAttribute('width')).toBe('100')
    expect(fo.getAttribute('height')).toBe('50')
  })
})

describe('createFOText', () => {
  it('creates a div with expected attributes', () => {
    const templates = initTemplates()
    const el = createFOText(templates, 'hello', '16px', 'center')
    expect(el.tagName).toBe('DIV')
    expect(el.textContent).toBe('hello')
    expect(el.classList.contains('fsm-text')).toBe(true)
    expect(el.style.fontSize).toBe('16px')
    expect(el.style.textAlign).toBe('center')
    expect(el.style.pointerEvents).toBe('none')
  })

  it('snapshot output', () => {
    const templates = initTemplates()
    const el = createFOText(templates, 'q0', '20px', 'left')
    expect(el.outerHTML).toMatchSnapshot()
  })
})
