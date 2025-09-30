<script setup lang="ts">
import { decompressFromEncodedURIComponent as decode, compressToEncodedURIComponent as encode } from 'lz-string'
import Toastify from 'toastify-js'
import { fsmStateToBackwardsCompatible, logicOnlyFsm, logicOnlyLegacyFsm } from './utils/fsmHelpers'

const fsmState = useLocalStorage('fsmState', { nodes: {} })
const variables = useLocalStorage('variables', 'ab')
const inputs = useLocalStorage('inputs', {} as Record<string, string>)
const searchParams = new URLSearchParams(window.location.search)

const searchState = searchParams.get('state')
fsmState.value = searchState ? JSON.parse(decode(searchState)) : fsmState.value
variables.value = searchParams.get('vars') ?? variables.value
const searchInputs = searchParams.get('inputs')
inputs.value = searchInputs ? JSON.parse(decode(searchInputs)) : inputs.value

const isSafari = computed(() => {
  const ua = navigator.userAgent
  return ua.includes('Safari') && !ua.includes('Chrome')
})

const { copy } = useClipboard()
async function share() {
  const params = new URLSearchParams()
  if (fsmState.value) {
    params.set('state', encode(JSON.stringify(fsmState.value)))
  }
  if (variables.value)
    params.set('vars', variables.value)
  if (inputs.value && Object.keys(inputs.value).length > 0)
    params.set('inputs', encode(JSON.stringify(inputs.value)))
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
  history.replaceState(null, '', url)
  await copy(url)
  Toastify({
    text: 'Link copied to clipboard',
    duration: 3000,
    gravity: 'top',
    position: 'right',
    style: {
      background: 'linear-gradient(to right, #00b09b, #96c93d)',
    },
  }).showToast()
}

watch(variables, (varsStr) => {
  const vars = Array.from(varsStr)
  for (const key of Object.keys(inputs.value)) {
    if (!vars.includes(key)) {
      delete inputs.value[key]
    }
  }
  for (const v of vars) {
    if (!(v in inputs.value)) {
      inputs.value[v] = ''
    }
  }
}, { immediate: true })

// accept only 01
function onKeydown(event: KeyboardEvent) {
  if (event.key.length === 1 && !'01'.includes(event.key)) {
    event.preventDefault()
  }
}

function onInput(event: InputEvent, variable: string) {
  inputs.value[variable] = (event.target as HTMLInputElement).value
}

const validationContainer = ref<string | undefined>(undefined)
onMounted(() => {
  validationContainer.value = `#${useId()}`
})

const updateKey = ref(0) // to force re-mount FsmBuilder
function forceUpdate() {
  updateKey.value += 1
}

const legacy = ref(false)
const logicOnly = ref(false)

const textareaContent = computed(() => {
  let data: any
  if (logicOnly.value) {
    if (legacy.value)
      data = logicOnlyLegacyFsm(fsmStateToBackwardsCompatible(fsmState.value))
    else
      data = logicOnlyFsm(fsmState.value)
  }
  else if (legacy.value) {
    data = fsmStateToBackwardsCompatible(fsmState.value)
  }
  else {
    data = fsmState.value
  }
  return JSON.stringify(data, null, 2)
})

function copyTextarea() {
  copy(textareaContent.value)
  Toastify({
    text: 'Copied to clipboard',
    duration: 3000,
    gravity: 'top',
    position: 'right',
    style: {
      background: 'linear-gradient(to right, #00b09b, #96c93d)',
    },
  }).showToast()
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
    <FsmBuilder :key="`${validationContainer}${updateKey}`" v-model="fsmState" v-model:inputs="inputs" :validation-container :variables />
    <div class="px-2 flex flex-1 flex-col gap-2 h-full overflow-scroll">
      <label class="text-sm text-gray-700 font-semibold mb-1 p-2 border border-gray-200 rounded-lg bg-gray-50 block">
        Variables:
        <input
          v-model="variables"
          placeholder="Variables (e.g. abcd)"
          class="text-sm px-3 py-2 border border-gray-300 rounded-md w-full shadow-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
        >
      </label>
      <!-- why does v-model not work here -->
      <input
        v-for="variable in Array.from(variables)"
        :key="variable" type="text"
        class="text-sm px-3 py-2 border border-gray-300 rounded-md w-full shadow-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
        :placeholder="`input sequence for ${variable}`"
        :value="inputs[variable]"
        @keydown="onKeydown"
        @input="onInput($event as InputEvent, variable)"
      >
      <div class="flex-1 h-full w-full relative">
        <div class="p-3 border border-gray-200 rounded-lg bg-white/90 flex flex-col gap-2 shadow-sm right-2 top-2 absolute backdrop-blur-sm">
          <label class="text-sm text-gray-700 flex gap-2 cursor-pointer transition-colors items-center hover:text-gray-900">
            <input v-model="legacy" type="checkbox" class="text-teal-600 border-gray-300 rounded">
            <span>Legacy</span>
          </label>
          <label class="text-sm text-gray-700 flex gap-2 cursor-pointer transition-colors items-center hover:text-gray-900">
            <input v-model="logicOnly" type="checkbox" class="text-teal-600 border-gray-300 rounded">
            <span>Logic Only</span>
          </label>
        </div>
        <button class="i-carbon-copy icon-btn bottom-2 right-2 absolute" @click="copyTextarea" />
        <textarea
          :value="textareaContent"
          :disabled="logicOnly || legacy"
          class="text-sm font-mono border-0 bg-transparent h-full w-full resize-none whitespace-pre overflow-scroll focus:outline-none"
          @input="textareaOnInput"
        />
      </div>
      <div :id="validationContainer?.slice(1)" />
    </div>
  </main>
</template>
