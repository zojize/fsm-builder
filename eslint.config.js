import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    unocss: true,
    formatters: true,
    ignores: ['docs/'],
  },
)
