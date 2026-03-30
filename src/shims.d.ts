// Type declarations for virtual modules and CSS side-effect imports

declare module 'virtual:uno.css' {}

declare module '*.css' {
  const css: string
  export default css
}
