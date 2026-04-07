<script setup lang="ts">
import type { FSMState } from '@zojize/fsm-builder'
import { createFSMBuilder, validateBooleanExpression } from '@zojize/fsm-builder'

const {
  variables = 'ab',
  validationContainer,
} = defineProps<{
  variables?: string
  validationContainer?: string
}>()

const state = defineModel<FSMState>()

const container = useId()
onMounted(() => {
  createFSMBuilder({
    container: `#${container}`,
    debug: true,
    initialState: toRaw(state.value) ?? { nodes: {} },
    onChange: (newState) => {
      state.value = structuredClone(newState)
    },
    simulation: { variables },
    validate: {
      container: validationContainer,
      edge: {
        inputAttributes: {
          pattern: `^[${variables}01\\(\\)'+]*$`,
        },
        validate(input) {
          return validateBooleanExpression(input, { alphabet: variables })
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
</script>

<template>
  <div :id="container" class="border-2 border-gray-300 border-dashed flex-[1.5] self-stretch relative" />
</template>
