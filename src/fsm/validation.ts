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

  const errors: string[] = []
  const fos = ctx.overlay.querySelectorAll<SVGForeignObjectElement>(
    '.fsm-node-label-editor, .fsm-edge-label-editor, .fsm-node-inner-editor',
  )

  fos.forEach((fo) => {
    const input = fo.querySelector<HTMLInputElement>('input.fsm-input')
    if (!input)
      return

    const kind = input.dataset.validateType as ValidateKind | undefined
    const validateConfig = ctx.validateConfig
    const opts = kind ? (validateConfig as any)?.[kind] as ValidateOptions | undefined : undefined
    const validator = opts?.validate

    if (!validator) {
      fo.classList.remove('invalid')
      input.classList.remove('invalid')
      return
    }

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

    if (typeof res === 'string') {
      if (removeOnly && !previousErrors.has(res)) {
        // New error — keep existing visual state, skip adding
        if (fo.classList.contains('invalid'))
          errors.push(res)
        return
      }
      fo.classList.add('invalid')
      input.classList.add('invalid')
      errors.push(res)
    }
    else if (res === false) {
      const msg = `${input.value} is invalid`
      if (removeOnly && !previousErrors.has(msg)) {
        if (fo.classList.contains('invalid'))
          errors.push(msg)
        return
      }
      fo.classList.add('invalid')
      input.classList.add('invalid')
      errors.push(msg)
    }
    else {
      fo.classList.remove('invalid')
      input.classList.remove('invalid')
    }
  })

  // Built-in: start state must be set
  const startMsg = 'No start state is set.'
  if (!ctx.fsmState.start || !(ctx.fsmState.start in ctx.fsmState.nodes)) {
    if (!removeOnly || previousErrors.has(startMsg))
      errors.push(startMsg)
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
    for (const msg of errors) {
      const frag = cloneTemplate(ctx.templates, 'fsm-validation-item')
      const li = frag.querySelector('li')!
      li.classList.add('error')
      li.querySelector('span:first-child')!.className = 'i-bi-x-lg'
      li.querySelector('.msg')!.textContent = msg
      ul.appendChild(frag)
    }
  }

  ctx.validationEl.appendChild(ul)
}
