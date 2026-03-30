<script setup lang="ts">
const emit = defineEmits<{
  (e: 'share'): void
}>()
</script>

<template>
  <nav class="text-xl flex gap-2 w-full items-center">
    <h1 class="font-bold font-mono">
      FSM Builder
    </h1>
    <div class="flex-1" />
    <button class="i-mdi-share icon-btn" title="Share" @click="emit('share')" />
    <a
      class="i-carbon-logo-github icon-btn"
      rel="noreferrer"
      href="https://github.com/zojize/fsm-builder"
      target="_blank"
      title="GitHub"
    />
  </nav>
</template>
