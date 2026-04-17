import path from 'node:path'
import transformerVariantGroup from '@unocss/transformer-variant-group'
import { presetIcons, presetWind4 } from 'unocss'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import peggyPlugin from './vite-plugin-peggy'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'index.ts'),
      name: 'FsmBuilder',
      fileName: 'fsm-builder',
      formats: ['es'],
    },
    sourcemap: false,
    minify: false,
  },
  plugins: [
    peggyPlugin(),
    UnoCSS({
      content: {
        pipeline: {
          include: [/\.ts$/],
        },
      },
      presets: [
        presetWind4({ preflights: { reset: false }, prefix: 'uno-' }),
        presetIcons({
          collections: {
            bi: () => import('@iconify-json/bi/icons.json').then(i => i.default),
          },
        }),
      ],
      transformers: [transformerVariantGroup()],
    }),
  ],
})
