// Icons are rendered via UnoCSS presetIcons at build time.
// The safelist in vite.config.ts ensures all i-bi-* classes land in the CSS bundle.

export function createIconElement(name: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = name
  return span
}
