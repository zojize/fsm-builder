import type { FSMContext } from './context'
import type { ValidateOptions } from './types'
import { cloneTemplate } from './templates'

type ValidateKind = 'edge' | 'innerNode' | 'outerNode'

/**
 * Run all FSM input validators and update the validation result UI.
 * No-op when validation is disabled.
 *
 * @param ctx The shared FSM context.
 * @param removeOnly When `true`, only clears previously-shown errors that are
 *   now fixed — never adds new errors or marks new inputs invalid. This gives
 *   the user immediate feedback that their fixes are working without requiring
 *   another manual validate click.
 */
export function runValidation(ctx: FSMContext, removeOnly = false): void {
  if (!ctx.validationEnabled || !ctx.validationEl)
    return

  // Capture previously-displayed error messages so removeOnly mode can filter.
  const previousErrors = new Set<string>()
  if (removeOnly) {
    for (const span of ctx.validationEl.querySelectorAll<HTMLSpanElement>('.item.error .msg'))
      previousErrors.add(span.textContent ?? '')
  }

  const hoverMode = typeof ctx.validateConfig === 'object' && !!ctx.validateConfig.highlightOnHover
  const errors: { msg: string, targetSelector: string | null }[] = []
  const fos = ctx.overlay.querySelectorAll<SVGForeignObjectElement>(
    '.fsm-node-label-editor, .fsm-edge-label-editor, .fsm-node-inner-editor',
  )

  fos.forEach((fo) => {
    const input = fo.querySelector<HTMLInputElement>('input.fsm-input')
    if (!input)
      return

    const wasInvalid = fo.classList.contains('invalid')
    fo.classList.remove('invalid')
    input.classList.remove('invalid')

    const kind = input.dataset.validateType as ValidateKind | undefined
    const validateConfig = ctx.validateConfig
    const opts = kind ? (validateConfig as any)?.[kind] as ValidateOptions | undefined : undefined
    const validator = opts?.validate

    if (!validator)
      return

    let res: boolean | string | void
    try {
      const isNode = kind === 'innerNode' || kind === 'outerNode'
      const nodeOrEdge = isNode
        ? ctx.getNode(fo.dataset.nodeId!)!
        : ctx.edgeIdToTransition[fo.dataset.edgeId!][1]
      res = validator(input.value, ctx.fsmState, nodeOrEdge)
    }
    catch {
      res = false
    }

    const buildSelector = (): string => {
      const cls = fo.getAttribute('class') ?? ''
      if (cls.includes('fsm-edge-label-editor'))
        return `.fsm-edge-label-editor[data-edge-id="${fo.dataset.edgeId}"]`
      if (cls.includes('fsm-node-inner-editor'))
        return `.fsm-node-inner-editor[data-node-id="${fo.dataset.nodeId}"]`
      return `.fsm-node-label-editor[data-node-id="${fo.dataset.nodeId}"]`
    }

    if (typeof res === 'string') {
      if (removeOnly && !previousErrors.has(res)) {
        if (!hoverMode && wasInvalid) {
          fo.classList.add('invalid')
          input.classList.add('invalid')
          errors.push({ msg: res, targetSelector: buildSelector() })
        }
        return
      }
      if (!hoverMode) {
        fo.classList.add('invalid')
        input.classList.add('invalid')
      }
      errors.push({ msg: res, targetSelector: buildSelector() })
    }
    else if (res === false) {
      const msg = `${input.value} is invalid`
      if (removeOnly && !previousErrors.has(msg)) {
        if (!hoverMode && wasInvalid) {
          fo.classList.add('invalid')
          input.classList.add('invalid')
          errors.push({ msg, targetSelector: buildSelector() })
        }
        return
      }
      if (!hoverMode) {
        fo.classList.add('invalid')
        input.classList.add('invalid')
      }
      errors.push({ msg, targetSelector: buildSelector() })
    }
  })

  // Built-in: start state must be set
  const startMsg = 'No start state is set.'
  if (!ctx.fsmState.start || !(ctx.fsmState.start in ctx.fsmState.nodes)) {
    if (!removeOnly || previousErrors.has(startMsg))
      errors.push({ msg: startMsg, targetSelector: null })
  }

  ctx.validationEl.innerHTML = ''

  // In removeOnly mode, don't show the success message — just clear the panel
  // when all previously-shown errors are fixed.
  if (removeOnly && errors.length === 0)
    return

  const ul = document.createElement('ul')
  ul.className = 'list'

  if (errors.length === 0) {
    const frag = cloneTemplate(ctx.templates, 'fsm-validation-item')
    const li = frag.querySelector('li')!
    li.classList.add('ok')
    li.querySelector('span:first-child')!.className = 'i-bi-check-lg'
    li.querySelector('.msg')!.textContent = 'All inputs are valid.'
    ul.appendChild(frag)
  }
  else {
    for (const { msg, targetSelector } of errors) {
      const frag = cloneTemplate(ctx.templates, 'fsm-validation-item')
      const li = frag.querySelector('li')!
      li.classList.add('error')
      li.querySelector('span:first-child')!.className = 'i-bi-x-lg'
      li.querySelector('.msg')!.textContent = msg

      if (hoverMode && targetSelector) {
        li.dataset.target = targetSelector
        li.classList.add('uno-cursor-pointer')
        li.addEventListener('mouseenter', () => {
          const fo = ctx.overlay.querySelector<SVGForeignObjectElement>(targetSelector)
          if (!fo)
            return
          fo.classList.add('invalid')
          fo.querySelector<HTMLInputElement>('input.fsm-input')?.classList.add('invalid')
        })
        li.addEventListener('mouseleave', () => {
          const fo = ctx.overlay.querySelector<SVGForeignObjectElement>(targetSelector)
          if (!fo)
            return
          fo.classList.remove('invalid')
          fo.querySelector<HTMLInputElement>('input.fsm-input')?.classList.remove('invalid')
        })
      }

      ul.appendChild(frag)
    }
  }

  ctx.validationEl.appendChild(ul)
}
