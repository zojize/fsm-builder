<script setup lang="ts">
import type { FSMState } from '~/utils/fsm'
import * as booleanParser from '~/utils/booleanParser.pegjs'
import { createFSMBuilder } from '~/utils/fsm'

const {
  variables = 'ab',
  validationContainer,
} = defineProps<{
  variables?: string
  validationContainer?: string
}>()

const state = defineModel<FSMState>()
const inputs = defineModel<Record<string, string>>('inputs', { required: true })

const defaultAlphabet = 'abcdefghijklmnopqrstuvwxyz'
function validateBooleanExpression(
  input: string,
  { alphabet = defaultAlphabet }: { alphabet?: string } = { alphabet: defaultAlphabet },
): boolean | string {
  try {
    booleanParser.parse(input, { alphabet })
    return true
  }
  catch (e) {
    return (e as any)?.message ?? `Unknown error while parsing: ${e}`
  }
}

const container = useId()
onMounted(() => {
  createFSMBuilder({
    container: `#${container}`,
    debug: true,
    initialState: state.value ?? { nodes: {} },
    onChange: (newState) => {
      state.value = newState
    },
    validate: {
      container: validationContainer,
      edge: {
        inputAttributes: {
          pattern: `[${variables}01\\(\\)'+]+`,
        },
        validate(input) {
          return validateBooleanExpression(input)
        },
      },
    },
  })
})

onBeforeUnmount(() => {
  if (!validationContainer)
    return
  const el = document.querySelector(validationContainer)
  if (el) {
    el.innerHTML = ''
  }
})

function evaluateBooleanExpression(
  expr: booleanParser.Expression,
  context: Record<string, boolean>,
): boolean {
  switch (expr.type) {
    case 'add':
      return evaluateBooleanExpression(expr.left, context) || evaluateBooleanExpression(expr.right, context)
    case 'mul':
      return evaluateBooleanExpression(expr.left, context) && evaluateBooleanExpression(expr.right, context)
    case 'not':
      return !evaluateBooleanExpression(expr.expr, context)
    case 'var':
      return !!context[expr.symbol]
    case 'true':
      return true
    case 'false':
      return false
  }
}

const currentNode = ref<string | undefined>(undefined)

function step() {
  if (!currentNode.value) {
    currentNode.value = state.value?.start
  }
  else {
    const transitions = state.value?.nodes[currentNode.value].transitions ?? []
    const targets: string[] = []
    for (const transition of transitions) {
      const expr = booleanParser.parse(transition.label, { alphabet: variables })
      const context: Record<string, boolean> = {}
      for (const v of variables) {
        const input = inputs.value[v][0]
        if (!input) {
          // eslint-disable-next-line no-alert
          alert(`No more input for variable ${v}`)
          return
        }
        context[v] = input === '1'
      }
      // console.log(context, expr, evaluateBooleanExpression(expr, context))
      if (evaluateBooleanExpression(expr, context)) {
        targets.push(transition.to)
      }
    }
    if (targets.length === 1) {
      currentNode.value = targets[0]
      for (const v of variables) {
        inputs.value[v] = inputs.value[v].slice(1)
      }
    }
    else if (targets.length > 1) {
      // eslint-disable-next-line no-alert
      alert('Nondeterministic transition, multiple targets match condition')
    }
    else {
      // eslint-disable-next-line no-alert
      alert('No valid transition found')
    }
  }
}

const containerEl = useTemplateRef('containerEl')
function styleCurrentNode(circle: SVGCircleElement | null) {
  if (circle) {
    circle.classList.add('!stroke-blue-800', '!fill-blue-500/50')
  }
}
function unstyleCurrentNode(circle: SVGCircleElement | null) {
  if (circle) {
    circle.classList.remove('!stroke-blue-800', '!fill-blue-500/50')
  }
}
const currentNodeCircle = computed(() => {
  return containerEl.value?.querySelector<SVGCircleElement>(`.fsm-nodes g.fsm-node[data-node-id="${currentNode.value}"] circle`) ?? null
})
watch(currentNodeCircle, (newCircle, oldCircle) => {
  unstyleCurrentNode(oldCircle)
  styleCurrentNode(newCircle)
})
</script>

<template>
  <div :id="container" ref="containerEl" class="border-2 border-gray-300 border-dashed flex-[1.5] self-stretch relative">
    <div class="flex flex-row items-center right-2 top-2 absolute">
      <button class="i-mdi-step-forward icon-btn" title="Step Forward" @click="step" />
      <button class="i-mdi-refresh icon-btn icon-btn" title="Reset" @click="currentNode = undefined" />
    </div>
  </div>
</template>

<style scoped>
</style>
