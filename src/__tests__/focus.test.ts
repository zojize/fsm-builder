import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFSMBuilder } from '../fsm'

describe('fsm builder focus behavior', () => {
  let api: ReturnType<typeof createFSMBuilder> | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    api?.destroy()
    api = undefined
    container?.remove()
    container = undefined
    vi.restoreAllMocks()
  })

  it('focuses the host container without scrolling on SVG pointerdown', () => {
    container = document.createElement('div')
    container.id = 'fsm-focus-test'
    document.body.appendChild(container)

    api = createFSMBuilder({ container: '#fsm-focus-test', sidebar: false })
    const focus = vi.spyOn(container, 'focus')
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    svg!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
})
