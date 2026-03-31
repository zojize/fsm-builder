import { defineConfig } from 'vitest/config'
import peggyPlugin from './vite-plugin-peggy'

export default defineConfig({
  plugins: [peggyPlugin()],
  test: {
    environment: 'happy-dom',
  },
})
