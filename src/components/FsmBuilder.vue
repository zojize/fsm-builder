<script setup lang="ts">
import type { FSMState } from '~/utils/fsm'
import { createFSMBuilder } from '~/utils/fsm'

const state = defineModel<FSMState>()

const container = useId()
onMounted(() => {
  createFSMBuilder({
    container: `#${container}`,
    debug: true,
    initialState: state.value ?? { nodes: {} },
    onChange: (newState) => {
      state.value = newState
    },
  })
})
</script>

<template>
  <div :id="container" class="border-2 border-gray-300 border-dashed flex-[1.5] self-stretch" />
</template>
