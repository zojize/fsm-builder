<script setup lang="ts">
import { logicOnlyFsm } from '@zojize/fsm-builder'
import { decompressFromEncodedURIComponent as decode, compressToEncodedURIComponent as encode } from 'lz-string'
import Toastify from 'toastify-js'

const fsmState = useLocalStorage('fsmState', { nodes: {} })
const variables = useLocalStorage('variables', 'ab')
const searchParams = new URLSearchParams(window.location.search)

const searchState = searchParams.get('state')
fsmState.value = searchState ? JSON.parse(decode(searchState)) : fsmState.value
variables.value = searchParams.get('vars') ?? variables.value

const isSafari = computed(() => {
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome')
})

const { copy } = useClipboard()

function showToast(text: string) {
  Toastify({
    text,
    duration: 3000,
    gravity: 'top',
    position: 'right',
    style: {
      background: 'linear-gradient(to right, #00b09b, #96c93d)',
    },
  }).showToast()
}

async function share() {
  const params = new URLSearchParams()
  if (fsmState.value) {
    params.set('state', encode(JSON.stringify(fsmState.value)))
  }
  if (variables.value)
    params.set('vars', variables.value)
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
  history.replaceState(null, '', url)
  await copy(url)
  showToast('Link copied to clipboard')
}

const validationContainer = ref<string | undefined>(undefined)
onMounted(() => {
  validationContainer.value = `#${useId()}`
})

const updateKey = ref(0) // to force re-mount FsmBuilder
function forceUpdate() {
  updateKey.value += 1
}

const logicOnly = ref(false)

const textareaContent = computed(() => {
  const data = logicOnly.value ? logicOnlyFsm(fsmState.value) : fsmState.value
  return JSON.stringify(data, null, 2)
})

function copyTextarea() {
  copy(textareaContent.value)
  showToast('Copied to clipboard')
}

function textareaOnInput(event: Event) {
  try {
    fsmState.value = JSON.parse((event.target as HTMLTextAreaElement).value)
  }
  catch {
    return
  }
  forceUpdate()
}
</script>

<template>
  <!-- TODO: fix compatibility -->
  <div v-if="isSafari" class="text-yellow-700 mb-4 p-4 border-l-4 border-yellow-500 bg-yellow-100" role="alert">
    <p class="font-bold">
      Safari Compatibility Notice
    </p>
    <p>You may not have the full experience on Safari. Please switch to Chrome for the best experience.</p>
  </div>
  <TheHeader @share="share" />
  <main class="flex flex-1 flex-row gap-2 max-h-[calc(100vh-4rem)]">
    <FsmBuilder :key="`${validationContainer}${updateKey}${variables}`" v-model="fsmState" :validation-container :variables />
    <div class="px-2 flex flex-1 flex-col gap-2 h-full overflow-scroll">
      <div class="flex-1 h-full w-full relative">
        <div class="flex gap-3 items-center right-2 top-2 absolute z-10">
          <label class="text-sm text-gray-700 flex gap-1.5 items-center">
            <span>Variables</span>
            <input
              v-model="variables"
              type="text"
              spellcheck="false"
              class="text-sm font-mono px-1.5 py-0.5 outline-none border border-gray-300 rounded w-24 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            >
          </label>
          <label class="text-sm text-gray-700 flex gap-1.5 cursor-pointer transition-colors items-center hover:text-gray-900">
            <input v-model="logicOnly" type="checkbox" class="text-blue-600 border-gray-300 rounded">
            <span>Logic Only</span>
          </label>
          <button class="i-carbon-copy icon-btn" @click="copyTextarea" />
        </div>
        <textarea
          :value="textareaContent"
          :disabled="logicOnly"
          class="text-sm font-mono border-0 bg-transparent h-full w-full resize-none whitespace-pre overflow-scroll focus:outline-none"
          @input="textareaOnInput"
        />
      </div>
      <div :id="validationContainer?.slice(1)" />
    </div>
  </main>
</template>
