import { describe, expect, it } from 'vitest'
import { cloneTemplate, initTemplates } from '../fsm/templates'

describe('initTemplates', () => {
  it('returns refs for all template names', () => {
    const refs = initTemplates()
    expect(refs['fsm-validation-item']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-input']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-text']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-node']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-edge']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-edge-preview']).toBeInstanceOf(HTMLTemplateElement)
    expect(refs['fsm-mask-circle']).toBeInstanceOf(HTMLTemplateElement)
  })

  it('is idempotent — returns same elements on second call', () => {
    const a = initTemplates()
    const b = initTemplates()
    expect(a['fsm-input']).toBe(b['fsm-input'])
  })
})

describe('cloneTemplate', () => {
  it('clones an HTML template', () => {
    const refs = initTemplates()
    const frag = cloneTemplate(refs, 'fsm-input')
    const input = frag.querySelector('input')
    expect(input).not.toBeNull()
    expect(input!.classList.contains('fsm-input')).toBe(true)
    expect(input!.type).toBe('text')
    expect(input!.autocomplete).toBe('off')
  })

  it('clones an SVG template and unwraps the svg shell', () => {
    const refs = initTemplates()
    const frag = cloneTemplate(refs, 'fsm-node')
    // Should NOT contain an <svg> wrapper
    expect(frag.querySelector('svg')).toBeNull()
    const g = frag.querySelector('g')
    expect(g).not.toBeNull()
    expect(g!.classList.contains('fsm-node')).toBe(true)
    expect(g!.namespaceURI).toBe('http://www.w3.org/2000/svg')
    const circle = g!.querySelector('circle')
    expect(circle).not.toBeNull()
    expect(circle!.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('clones produce independent elements', () => {
    const refs = initTemplates()
    const a = cloneTemplate(refs, 'fsm-validation-item').querySelector('li')!
    const b = cloneTemplate(refs, 'fsm-validation-item').querySelector('li')!
    a.classList.add('error')
    expect(b.classList.contains('error')).toBe(false)
  })

  it('clones fsm-edge with correct children', () => {
    const refs = initTemplates()
    const frag = cloneTemplate(refs, 'fsm-edge')
    const g = frag.querySelector('g')!
    expect(g.querySelector('.fsm-edge-arrow')).not.toBeNull()
    expect(g.querySelector('.fsm-edge-hit')).not.toBeNull()
    expect(g.querySelector('.fsm-edge-path')).not.toBeNull()
  })

  it('clones fsm-mask-circle in SVG namespace', () => {
    const refs = initTemplates()
    const frag = cloneTemplate(refs, 'fsm-mask-circle')
    const circle = frag.querySelector('circle')!
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(circle.getAttribute('fill')).toBe('black')
  })
})
