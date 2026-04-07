# HTML Template Refactor

Replace high-frequency dynamic `createElement` calls with reusable `<template>` clones for clarity, readability, and performance.

## Motivation

Several modules build the same HTML structures imperatively every time a node, edge, or validation result is created. Moving these structures into declarative `<template>` elements makes the markup visible at a glance and reduces per-call boilerplate.

## Scope

Only hotspot patterns — structures created repeatedly at runtime:

| Template | Consumers | Frequency |
|----------|-----------|-----------|
| `fsm-validation-item` | `validation.ts` | Every validation run, one `<li>` per result |
| `fsm-input` | `nodes.ts`, `edges.ts` | Every node (×2 labels) and every edge |
| `fsm-text` | `dom.ts` → `nodes.ts`, `edges.ts` | Every node/edge in readonly mode |

### Out of scope

- SVG element creation (`createSvgEl`, circles, paths, groups) — requires `createElementNS` with SVG namespace
- `createIconElement()` — a single `span` + className; template clone would be equivalent complexity
- Sidebar and simulation panel — one-off creations, not hotspots
- Event listener wiring — remains imperative after cloning

## New file: `src/fsm/templates.ts`

### `html` tag

An identity tagged-template function that returns the raw string unchanged. Exists solely so editors with lit-html or similar extensions provide syntax highlighting inside template literals:

```ts
export const html = (strings: TemplateStringsArray, ...values: unknown[]) =>
  String.raw(strings, ...values)
```

### Template definitions

```ts
const TEMPLATES = {
  'fsm-validation-item': html`
    <li class="item">
      <span></span>
      <span class="msg"></span>
    </li>
  `,
  'fsm-input': html`
    <input type="text" autocomplete="off" maxlength="50" class="fsm-input" />
  `,
  'fsm-text': html`
    <div class="fsm-text" style="pointer-events:none"></div>
  `,
} as const
```

### Types

```ts
export type TemplateName = keyof typeof TEMPLATES
export type TemplateRefs = Record<TemplateName, HTMLTemplateElement>
```

### `initTemplates(): TemplateRefs`

Called once during FSM initialization. For each entry in `TEMPLATES`:

1. Check if `<template id="fsm-tmpl-{name}">` already exists in `document`
2. If not, create the `<template>` element, set its `innerHTML`, append to `document.body`
3. Return a typed map of template element references

Idempotent — safe to call multiple times (e.g. multiple FSM instances on the same page).

### `cloneTemplate(refs, name): DocumentFragment`

Convenience wrapper around `refs[name].content.cloneNode(true)` with proper typing.

## Context integration

Add a `templates` field to `FSMContext`:

```ts
readonly templates: TemplateRefs
```

Initialized in `fsm.ts` via `initTemplates()` alongside existing DOM setup, before any module that needs templates is called.

## Consumer changes

### `validation.ts`

Replace the per-item `createElement` block:

```ts
// Before (6 lines per item)
const li = document.createElement('li')
li.className = 'item error'
li.appendChild(createIconElement('i-bi-x-lg'))
const span = document.createElement('span')
span.className = 'msg'
span.textContent = msg
li.appendChild(span)

// After (3 lines per item)
const frag = cloneTemplate(ctx.templates, 'fsm-validation-item')
const li = frag.querySelector('li')!
li.classList.add('error')
li.querySelector('span:first-child')!.className = 'i-bi-x-lg'
li.querySelector('.msg')!.textContent = msg
```

Same pattern for the success `<li>` with class `ok` and icon `i-bi-check-lg`.

### `nodes.ts` — inner and outer label editors

Replace `document.createElementNS(XHTML_NS, 'input')` + attribute setup:

```ts
// Before
const input = document.createElementNS(XHTML_NS, 'input') as HTMLInputElement
input.type = 'text'
input.autocomplete = 'off'
input.maxLength = 50
input.classList.add('fsm-input')

// After
const frag = cloneTemplate(ctx.templates, 'fsm-input')
const input = frag.querySelector('input')! as HTMLInputElement
```

Dynamic attributes (`dataset.validateType`, `style.fontSize`, `style.textAlign`, `value`) still set imperatively after cloning.

### `edges.ts` — edge label editor

Same pattern as node label editors — replace the `createElementNS` + attribute block with `cloneTemplate(ctx.templates, 'fsm-input')`.

### `dom.ts` — `createFOText()`

Replace the body of `createFOText()`:

```ts
// Before
const el = document.createElementNS(XHTML_NS, 'div') as HTMLDivElement
el.classList.add('fsm-text')
el.style.pointerEvents = 'none'

// After — accept templates ref as parameter
const frag = cloneTemplate(templates, 'fsm-text')
const el = frag.querySelector('div')! as HTMLDivElement
```

Since `createFOText` is a standalone utility, it needs the `TemplateRefs` passed in (or imported). The callers already have access to `ctx.templates`.

## File change summary

| File | Change |
|------|--------|
| `src/fsm/templates.ts` | **New** — template definitions, `initTemplates()`, `cloneTemplate()` |
| `src/fsm/context.ts` | Add `templates: TemplateRefs` to `FSMContext` |
| `src/fsm/fsm.ts` | Call `initTemplates()`, assign to context |
| `src/fsm/validation.ts` | Use `cloneTemplate` for `<li>` items |
| `src/fsm/nodes.ts` | Use `cloneTemplate` for inner/outer label `<input>` |
| `src/fsm/edges.ts` | Use `cloneTemplate` for edge label `<input>` |
| `src/fsm/dom.ts` | Update `createFOText()` to use template clone |
