import type { FSMOptions } from '../fsm/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFSMBuilder } from '../fsm'

describe('canvas viewport sizing', () => {
  let api: ReturnType<typeof createFSMBuilder> | undefined
  let container: HTMLDivElement
  let rect: DOMRect
  let resized: () => void
  const disconnect = vi.fn()

  beforeEach(() => {
    rect = new DOMRect(30, 50, 800, 300)
    resized = () => {
      throw new Error('No resize observer registered')
    }
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect)
    // A host with padding/borders is deliberately larger than its SVG viewport.
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      new DOMRect(0, 0, rect.width + 60, rect.height + 100),
    )
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      disconnect = disconnect
    })
    container = document.createElement('div')
    container.id = 'viewport-test'
    document.body.appendChild(container)
  })

  afterEach(() => {
    api?.destroy()
    api = undefined
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    disconnect.mockClear()
  })

  function mount(options: Partial<FSMOptions> = {}) {
    api = createFSMBuilder({ container: '#viewport-test', initialState: { nodes: {} }, ...options })
    return container.querySelector('svg')!
  }

  it.each([300, 600, 1200])('keeps one SVG unit per pixel at height %i', (height) => {
    rect.height = height
    const svg = mount()
    expect(svg.getAttribute('viewBox')).toBe(`0 0 800 ${height}`)
  })

  it.each([false, true])('preserves size after resizing (readonly=%s)', (readonly) => {
    const svg = mount({ readonly, scale: 2 })
    rect = new DOMRect(30, 50, 1000, 900)
    resized()
    expect(svg.getAttribute('viewBox')).toBe('0 0 500 450')
  })

  it('keeps the SVG point under the cursor fixed when zooming a padded host', () => {
    const svg = mount()
    wheel(svg, {
      deltaY: -Math.log(2) / 0.0015,
      clientX: rect.left + 200,
      clientY: rect.top + 100,
    })
    expect(svg.getAttribute('viewBox')).toBe('100 50 400 150')
    rect.height = 900
    resized()
    expect(svg.getAttribute('viewBox')).toBe('100 50 400 450')
  })

  it('pans by the pointer distance in SVG units', () => {
    const svg = mount({ scale: 2 })
    container.dataset.editMode = 'move'
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 100 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 260, clientY: 140 }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    expect(svg.getAttribute('viewBox')).toBe('-30 -20 400 150')
  })

  it.each([false, true])('recovers from mounting while hidden (readonly=%s)', (readonly) => {
    rect = new DOMRect(0, 0, 0, 0)
    const svg = mount({ readonly })
    expect(svg.getAttribute('viewBox')).toBe('0 0 1 1')
    rect = new DOMRect(30, 50, 800, 300)
    resized()
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 300')
  })

  it('preserves the viewport when temporarily hidden and ignores hidden zoom', () => {
    const svg = mount()
    rect = new DOMRect(0, 0, 0, 0)
    resized()
    wheel(svg, { deltaY: -100 })
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 300')
    rect = new DOMRect(30, 50, 800, 300)
    resized()
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 300')
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('uses default zoom for invalid initial scale %s', (scale) => {
    expect(mount({ scale }).getAttribute('viewBox')).toBe('0 0 800 300')
  })

  it('disconnects the resize observer for read-only builders', () => {
    mount({ readonly: true })
    api!.destroy()
    api = undefined
    expect(disconnect).toHaveBeenCalledOnce()
  })

  function wheel(svg: SVGSVGElement, init: WheelEventInit) {
    // happy-dom's WheelEvent omits the inherited mouse coordinates/modifiers.
    const event = new MouseEvent('wheel', { ...init, altKey: true })
    Object.defineProperty(event, 'deltaY', { value: init.deltaY })
    svg.dispatchEvent(event)
  }
})
