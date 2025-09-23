<script setup lang="ts">
const fsmState = useLocalStorage('fsmState', { nodes: {} })
</script>

<template>
  <TheHeader />
  <main class="flex flex-1 flex-row gap-2 max-h-[calc(100vh-4rem)]">
    <FsmBuilder v-model="fsmState" />
    <pre class="flex-1 h-full overflow-scroll">{{ JSON.stringify(fsmState, null, 2) }}</pre>
  </main>
</template>
