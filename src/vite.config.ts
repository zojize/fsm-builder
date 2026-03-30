import path from 'node:path'
import { presetIcons } from 'unocss'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

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
    dts({ rollupTypes: true, exclude: ['vite.config.ts'] }),
  ],
})
