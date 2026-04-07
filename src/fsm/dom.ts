import type { Vec2 } from './math'
import type { TemplateRefs } from './templates'
import { cloneTemplate } from './templates'

export const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Create an SVG element in the SVG namespace. */
export function createSvgEl<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName)
}

/** Set the `x`, `y`, `width`, and `height` attributes of a `<foreignObject>` element. */
export function setFOBounds(fo: SVGForeignObjectElement, x: number, y: number, w: number, h: number): void {
  fo.setAttribute('x', `${x}`)
  fo.setAttribute('y', `${y}`)
  fo.setAttribute('width', `${w}`)
  fo.setAttribute('height', `${h}`)
}

/** Convert a client-space pointer coordinate to SVG viewBox-space. */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  return {
    x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
    y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
  }
}

// eslint-disable-next-line vars-on-top, no-var
var _measureCanvas: HTMLCanvasElement | undefined

/** Measure pixel width of `text` rendered in `font` using an off-screen canvas. */
export function getTextWidth(text: string, font: string): number {
  _measureCanvas ??= document.createElement('canvas')
  const ctx = _measureCanvas.getContext('2d')!
  ctx.font = font
  return ctx.measureText(text).width
}

/**
 * Resolve the CSS font-size string for `textLength` characters using a breakpoint map.
 *
 * `breakpoints` can be:
 * - a `number` → used as a px value
 * - a `string` → returned as-is
 * - a `Record<number, string>` → the smallest key `≥ textLength` wins
 */
export function getFontSize(
  textLength: number,
  breakpoints: number | string | Record<number, string> | undefined,
  defaultSize: string,
): string {
  if (typeof breakpoints === 'number')
    return `${breakpoints}px`
  if (typeof breakpoints === 'string')
    return breakpoints
  if (breakpoints == null)
    return defaultSize
  const lengths = Object.keys(breakpoints).map(Number).sort((a, b) => a - b)
  if (lengths.length === 0)
    return defaultSize
  for (const len of lengths) {
    if (textLength <= len)
      return breakpoints[len]
  }
  return breakpoints[lengths.at(-1)!] ?? defaultSize
}

/** Stop `pointerdown`, `mousedown`, `click`, and `dblclick` from bubbling out of `el`. */
export function stopPointerEventPropagation(el: Element): void {
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) {
    el.addEventListener(type, ev => ev.stopPropagation())
  }
}

/**
 * Returns `true` if the current input value does not match the element's `pattern` attribute.
 * @remarks Does not handle cut/paste, delete, drag-drop, or IME compositions.
 */
export function editIsInvalid(ev: Event): boolean {
  const input = ev.target as HTMLInputElement
  const pattern = input.pattern
  if (!pattern)
    return false
  return !new RegExp(pattern).test(input.value)
}

/** Snapshot the current value and selection of an input element. */
export function saveInputState(input: HTMLInputElement) {
  return {
    value: input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection,
  }
}

/** Restore a previously snapshotted input value and selection. */
export function restoreInputState(input: HTMLInputElement, state: ReturnType<typeof saveInputState>): void {
  input.value = state.value
  if (state.selectionStart !== null && state.selectionEnd !== null) {
    input.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection ?? 'none')
  }
}

/** Create a non-interactive text `<div>` for use inside a `<foreignObject>` (readonly labels). */
export function createFOText(templates: TemplateRefs, value: string, fontSize: string, textAlign: 'left' | 'center' | 'right'): HTMLDivElement {
  const el = cloneTemplate(templates, 'fsm-text').querySelector('div')! as HTMLDivElement
  el.style.fontSize = fontSize
  el.style.textAlign = textAlign
  el.textContent = value
  return el
}

/** Apply a partial set of HTML input attributes to an `<input>` element. */
export function applyInputAttributes(input: HTMLInputElement, attrs: Partial<HTMLElementTagNameMap['input']> | undefined): void {
  if (!attrs)
    return
  for (const [k, v] of Object.entries(attrs)) {
    input.setAttribute(k, String(v))
  }
}

/** Copy `value` to the clipboard, falling back to `execCommand` in older environments. */
export function copyToClipboard(value: string): Promise<void> | void {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value)
  }
  legacyCopy(value)
}

function legacyCopy(value: string): void {
  const ta = document.createElement('textarea')
  ta.value = value
  ta.style.position = 'absolute'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}
