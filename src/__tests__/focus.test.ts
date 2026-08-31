import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFSMBuilder } from '../fsm'

const initialState = {
  nodes: {
    q0: {
      label: 'q0',
      innerLabel: '',
      x: 100,
      y: 100,
      radius: 30,
      transitions: [{ to: 'q1', label: 'a', offset: 0 }],
    },
    q1: {
      label: 'q1',
      innerLabel: '',
      x: 300,
      y: 100,
      radius: 30,
      transitions: [],
    },
  },
}

const preventScroll = { preventScroll: true }

describe('fsm builder focus behavior', () => {
  let api: ReturnType<typeof createFSMBuilder> | undefined
  let container: HTMLDivElement | undefined

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: text => ({ width: text.length * 10 }) as TextMetrics,
    } as CanvasRenderingContext2D)
  })

  afterEach(() => {
    api?.destroy()
    api = undefined
    container?.remove()
    container = undefined
    vi.restoreAllMocks()
  })

  function mount(state = { nodes: {} }) {
    container = document.createElement('div')
    container.id = 'fsm-focus-test'
    document.body.appendChild(container)
    api = createFSMBuilder({
      container: '#fsm-focus-test',
      initialState: structuredClone(state),
      sidebar: false,
    })
    return container
  }

  it('focuses the host container without scrolling on SVG pointerdown', () => {
    const container = mount()
    const focus = vi.spyOn(container, 'focus')
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    svg!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(focus).toHaveBeenCalledWith(preventScroll)
  })

  it('keeps the host container focused without scrolling after keyboard undo', () => {
    const container = mount()
    const focus = vi.spyOn(container, 'focus')

    container.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(focus).toHaveBeenCalledWith(preventScroll)
  })

  it('focuses node label inputs without scrolling when their editors are clicked', () => {
    const container = mount(initialState)
    const node = container.querySelector<SVGGElement>('g.fsm-node[data-node-id="q0"]')!
    const innerInput = container.querySelector<HTMLInputElement>('foreignObject.fsm-node-inner-editor[data-node-id="q0"] input')!
    const outerEditor = container.querySelector<SVGForeignObjectElement>('foreignObject.fsm-node-label-editor[data-node-id="q0"]')!
    const outerInput = outerEditor.querySelector('input')!
    const innerFocus = vi.spyOn(innerInput, 'focus')
    const outerFocus = vi.spyOn(outerInput, 'focus')

    node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    outerEditor.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))

    expect(innerFocus).toHaveBeenCalledWith(preventScroll)
    expect(outerFocus).toHaveBeenCalledWith(preventScroll)
  })

  it('focuses a newly created node input without scrolling', () => {
    const container = mount()
    const inputFocus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const svg = container.querySelector('svg')!

    svg.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }))

    expect(inputFocus).toHaveBeenCalledWith(preventScroll)
  })

  it('focuses an existing edge input without scrolling on click or pointerup', () => {
    const container = mount(initialState)
    const edgeInput = container.querySelector<HTMLInputElement>('foreignObject.fsm-edge-label-editor input')!
    const edgePath = container.querySelector<SVGPathElement>('g.fsm-edge .fsm-edge-path')!
    const edgeHitPath = container.querySelector<SVGPathElement>('g.fsm-edge .fsm-edge-hit')!
    const focus = vi.spyOn(edgeInput, 'focus')

    edgePath.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    expect(focus).toHaveBeenLastCalledWith(preventScroll)

    edgeHitPath.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      detail: 1,
      clientX: 200,
      clientY: 100,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 100 }))

    expect(focus).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenLastCalledWith(preventScroll)
  })

  it('focuses a newly created edge input without scrolling', () => {
    const state = structuredClone(initialState)
    state.nodes.q0.transitions = []
    const container = mount(state)
    const svg = container.querySelector('svg')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const inputFocus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const sourceNode = container.querySelector<SVGGElement>('g.fsm-node[data-node-id="q0"]')!

    sourceNode.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
      shiftKey: true,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 300,
      clientY: 100,
    }))

    expect(inputFocus).toHaveBeenCalledWith(preventScroll)
  })
})
