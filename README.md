# @zojize/fsm-builder

[![npm version](https://img.shields.io/npm/v/@zojize/fsm-builder?color=a1b858&label=npm)](https://www.npmjs.com/package/@zojize/fsm-builder)

An interactive SVG-based finite state machine editor. Draw Moore-style DFAs and NFAs with per-state outputs directly in the browser.

**[Live playground →](https://fsm-builder.netlify.app/)**

---

## Installation

```bash
npm install @zojize/fsm-builder
```

## Quick start

```ts
import { createFSMBuilder } from '@zojize/fsm-builder'
import '@zojize/fsm-builder/style.css'

const api = createFSMBuilder({
  container: '#my-container',
  onChange(state) {
    console.log(JSON.stringify(state, null, 2))
  },
})
```

The container element can be any block-level element with a defined height. `createFSMBuilder` automatically adds the `fsm-builder` class to it.

```html
<div id="my-container" style="height: 400px"></div>
```

## `createFSMBuilder(options)`

### Options

| Option                | Type                        | Default         | Description                                                                            |
| --------------------- | --------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `container`           | `string`                    | —               | CSS selector for the host element. Required.                                           |
| `initialState`        | `FSMState`                  | `{ nodes: {} }` | State to preload into the editor.                                                      |
| `onChange`            | `(state: FSMState) => void` | —               | Called whenever the diagram changes.                                                   |
| `readonly`            | `boolean`                   | `false`         | Disables all editing interactions.                                                     |
| `debug`               | `boolean`                   | `false`         | Forces the sidebar to render and adds a copy-to-clipboard button for the current JSON. |
| `sidebar`             | `boolean`                   | `true`          | Shows the toolbar.                                                                     |
| `autoValidate`        | `boolean`                   | `false`         | Run validation automatically after every change.                                       |
| `validate`            | `false \| ValidateConfig`   | `false`         | Inline validation for edge and node labels. See [Validation](#validation).             |
| `scale`               | `number`                    | `1`             | SVG viewBox zoom factor. Values < 1 show more canvas area.                             |
| `defaultRadius`       | `number`                    | `30`            | Default node circle radius in SVG units.                                               |
| `fontFamily`          | `string`                    | monospace stack | Font used for all labels.                                                              |
| `fontSizeBreakpoints` | `object`                    | —               | Responsive font sizing. See [Font-size breakpoints](#font-size-breakpoints).           |
| `maxHistory`          | `number`                    | —               | Maximum undo/redo history depth. Unlimited by default.                                 |
| `svgAttributes`       | `object`                    | `{}`            | Extra attributes to set on the root `<svg>` element.                                   |

### Return value

`createFSMBuilder` returns an `FSMBuilderAPI`:

```ts
interface FSMBuilderAPI {
  on: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>, options?: AddEventListenerOptions) => void
  off: <K extends keyof FSMEventMap>(event: K, handler: FSMEventHandler<K>) => void
  getState: () => FSMState
  destroy: () => void
}
```

## Data model

```ts
interface FSMState {
  start?: NodeId // ID of the start state
  nodes: Record<NodeId, FSMNode>
}

interface FSMNode {
  label: string // Outer label shown below the circle
  innerLabel: string // Inner label shown inside the circle (e.g. output bits)
  x: number
  y: number
  radius: number
  transitions: FSMTransition[]
}

interface FSMTransition {
  to: NodeId // Target node ID
  label: string // Boolean expression over input variables
  offset: number // Curve offset (non-self edges); 0 = straight
  rotation?: number // Self-loop orientation in degrees
}
```

`FSMState` is plain JSON and safe to serialize/deserialize with `JSON.stringify` / `JSON.parse`.

## Interactions

| Action            | How                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Add state         | Double-click the canvas, or use the **Add Node** toolbar button                                                                            |
| Create transition | Shift+drag from a source node to a target, or use the **Transition** tool                                                                  |
| Set start state   | Double-click a node, or use the **Start State** tool then click a node                                                                     |
| Remove            | Right-click a node or edge, or use the **Remove** tool                                                                                     |
| Clear all         | Red trash button in the sidebar (prompts for confirmation)                                                                                 |
| Move states       | Click-drag in Select mode                                                                                                                  |
| Multi-select      | Cmd/Ctrl+click to toggle; drag an empty area to box-select; Cmd/Ctrl+drag to add to selection; drag any selected node to move all together |
| Pan canvas        | **Move Canvas** tool, or Cmd/Ctrl+Shift+drag anywhere                                                                                      |
| Undo / Redo       | Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y), or toolbar buttons                                                                          |

## Validation

Pass a `validate` config to enable inline label validation:

```ts
import { createFSMBuilder, validateBooleanExpression } from '@zojize/fsm-builder'

createFSMBuilder({
  container: '#editor',
  validate: {
    container: '#validation-output', // optional: element to render error list into
    edge: {
      inputAttributes: {
        pattern: '^[ab01\\(\\)\'+*]*$', // browser-level pattern attribute
      },
      validate(input) {
        return validateBooleanExpression(input, { alphabet: 'ab' })
        // return true  → valid
        // return false → invalid (no message)
        // return string → invalid, message shown in UI
      },
    },
  },
})
```

The `validate` callback receives the label string, the current `FSMState`, and the node or transition being edited. It should return `true` for valid, `false` for invalid, or a string error message.

## Boolean expression utilities

```ts
import type { BooleanExpression } from '@zojize/fsm-builder'
import { evaluateBooleanExpression, parseBooleanExpression, validateBooleanExpression } from '@zojize/fsm-builder'
```

### `parseBooleanExpression(input, options?)`

Parses a boolean expression string into an AST. Throws a `SyntaxError` on invalid input.

```ts
const expr = parseBooleanExpression('a\' + b', { alphabet: 'ab' })
// { type: 'add', left: { type: 'not', operand: { type: 'var', symbol: 'a' } }, right: { type: 'var', symbol: 'b' } }
```

### `validateBooleanExpression(input, options?)`

Returns `true` if valid, or a string error message if not. Never throws.

```ts
validateBooleanExpression('a + b', { alphabet: 'ab' }) // true
validateBooleanExpression('a + c', { alphabet: 'ab' }) // "Expected ..."
```

### `evaluateBooleanExpression(expr, context)`

Evaluates a parsed AST against a variable assignment.

```ts
evaluateBooleanExpression(expr, { a: true, b: false }) // true
```

**Boolean expression syntax:**

| Construct | Syntax                          |
| --------- | ------------------------------- |
| Variable  | any letter in `alphabet`        |
| AND       | adjacency (`ab`) or `*` (`a*b`) |
| OR        | `+` (`a + b`)                   |
| NOT       | apostrophe suffix (`a'`)        |
| Constants | `0`, `1`                        |
| Grouping  | `(a + b)'`                      |

## Events

Subscribe to FSM events via the returned `api`:

```ts
api.on('node:added', ({ id, node }) => { /* ... */ })
api.on('edge:changed', ({ id, transition }) => { /* ... */ })
api.on('start:changed', ({ id }) => { /* ... */ })
api.on('history:changed', ({ canUndo, canRedo }) => { /* ... */ })
```

Full event map:

| Event             | Payload                                       |
| ----------------- | --------------------------------------------- |
| `node:added`      | `{ id, node }`                                |
| `node:removed`    | `{ id }`                                      |
| `node:moved`      | `{ id, node }` (fires frequently during drag) |
| `node:move-end`   | `{ id, node }` (fires on pointer up)          |
| `node:changed`    | `{ id, node }`                                |
| `node:committed`  | `{ id }`                                      |
| `edge:added`      | `{ id, from, transition }`                    |
| `edge:removed`    | `{ id }`                                      |
| `edge:changed`    | `{ id, transition }`                          |
| `start:changed`   | `{ id }`                                      |
| `history:changed` | `{ canUndo, canRedo }`                        |

## Font-size breakpoints

Make label font sizes responsive to text length by passing a `Record<number, string>` where the key is the minimum character count at which the size applies:

```ts
createFSMBuilder({
  container: '#editor',
  fontSizeBreakpoints: {
    edge: { 5: '18px', 8: '15px' }, // ≥5 chars → 18px, ≥8 chars → 15px
    innerNode: { 3: '19px', 5: '16px' },
    outerNode: { 15: '19px', 25: '16px' },
  },
})
```

## Loading and saving state

The `onChange` callback and `api.getState()` both return plain `FSMState` JSON. Pass it back in as `initialState` to restore a previous session:

```ts
// Save
localStorage.setItem('fsm', JSON.stringify(api.getState()))

// Restore
const saved = JSON.parse(localStorage.getItem('fsm') ?? '{"nodes":{}}')
createFSMBuilder({ container: '#editor', initialState: saved })
```

## Framework integration (Vue example)

```vue
<script setup lang="ts">
import type { FSMState } from '@zojize/fsm-builder'
import { createFSMBuilder, validateBooleanExpression } from '@zojize/fsm-builder'

const state = defineModel<FSMState>()

const container = useId()
onMounted(() => {
  createFSMBuilder({
    container: `#${container}`,
    initialState: toRaw(state.value) ?? { nodes: {} },
    onChange: (newState) => { state.value = newState },
    validate: {
      edge: {
        validate: input => validateBooleanExpression(input, { alphabet: 'ab' }),
      },
    },
  })
})
</script>

<template>
  <div :id="container" style="height: 400px" />
</template>
```

## Implementation

`createFSMBuilder` builds a shared `FSMContext` and delegates to focused sub-modules under `src/fsm/`:

| Module          | Responsibility                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | Public TypeScript interfaces: `FSMNode`, `FSMState`, `FSMTransition`, `FSMOptions`, `NodeId`, `EdgeId`, `ValidateOptions` |
| `events.ts`     | Typed event emitter with `AbortSignal` support; defines `FSMEventMap` and `FSMBuilderAPI`                                 |
| `context.ts`    | Shared `FSMContext` bag passed into every sub-module                                                                      |
| `math.ts`       | Pure geometry: Bézier curves, self-loop arcs, arrowheads, circle intersections                                            |
| `dom.ts`        | SVG/HTML helpers: element creation, coordinate conversion, text measurement, clipboard                                    |
| `nodes.ts`      | Node creation, drag interaction, label editors, selection, start marker                                                   |
| `edges.ts`      | Edge geometry, drag-to-curve, label editor, SVG masks for node occlusion                                                  |
| `sidebar.ts`    | Toolbar: mode and action buttons                                                                                          |
| `validation.ts` | Reads all label inputs, runs `validateConfig`, updates the error panel                                                    |

## License

MIT
