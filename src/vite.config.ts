import path from 'node:path'
import { presetIcons } from 'unocss'
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
    sourcemap: true,
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
        presetIcons({
          collections: {
            bi: () => import('@iconify-json/bi/icons.json').then(i => i.default),
          },
        }),
      ],
    }),
  ],
})
