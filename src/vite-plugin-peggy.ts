import type { Plugin } from 'vite'
import peggy from 'peggy'

export default function peggyPlugin(): Plugin {
  return {
    name: 'peggy',
    transform(source, id) {
      if (!id.endsWith('.peggy'))
        return
      return peggy.generate(source, { format: 'es', output: 'source' })
    },
  }
}
