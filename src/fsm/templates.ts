/** Identity tag for HTML syntax highlighting in template literals. */
function html(strings: TemplateStringsArray, ...values: unknown[]) {
  return String.raw(strings, ...values)
}

const TEMPLATES = {
  'fsm-validation-item': html`<li class="item"><span></span><span class="msg"></span></li>`,
  'fsm-input': html`<input type="text" autocomplete="off" maxlength="50" class="fsm-input" />`,
  'fsm-text': html`<div class="fsm-text" style="pointer-events:none"></div>`,
  'fsm-node': html`<svg><g class="fsm-node"><circle class="fsm-node-circle" /></g></svg>`,
  'fsm-edge': html`<svg><g class="fsm-edge"><polygon class="fsm-edge-arrow" /><path class="fsm-edge-hit" /><path class="fsm-edge-path" /></g></svg>`,
  'fsm-edge-preview': html`<svg><g class="fsm-edge preview"><path class="fsm-edge-path" /><polygon class="fsm-edge-arrow" /></g></svg>`,
  'fsm-mask-circle': html`<svg><circle fill="black" /></svg>`,
} as const

export type TemplateName = keyof typeof TEMPLATES
export type TemplateRefs = Record<TemplateName, HTMLTemplateElement>

/**
 * Inject `<template>` elements into the document (idempotent) and return
 * typed refs to each one. Safe to call from multiple FSM instances.
 */
export function initTemplates(): TemplateRefs {
  const refs = {} as TemplateRefs
  for (const [name, markup] of Object.entries(TEMPLATES)) {
    const tmplId = `fsm-tmpl-${name}`
    let tmpl = document.getElementById(tmplId) as HTMLTemplateElement | null
    if (!tmpl) {
      tmpl = document.createElement('template')
      tmpl.id = tmplId
      tmpl.innerHTML = markup
      document.body.appendChild(tmpl)
    }
    refs[name as TemplateName] = tmpl
  }
  return refs
}

/**
 * Clone a template by name. For SVG templates the `<svg>` wrapper is
 * automatically removed — callers receive the inner SVG elements directly.
 */
export function cloneTemplate(refs: TemplateRefs, name: TemplateName): DocumentFragment {
  const frag = refs[name].content.cloneNode(true) as DocumentFragment
  const firstEl = frag.firstElementChild
  if (firstEl && firstEl.tagName === 'svg') {
    const inner = document.createDocumentFragment()
    while (firstEl.firstChild)
      inner.appendChild(firstEl.firstChild)
    firstEl.remove()
    return inner
  }
  return frag
}
