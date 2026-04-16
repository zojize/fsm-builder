# FSM Builder

Bun workspace monorepo: `src/` (npm library `@zojize/fsm-builder`) + `playground/` (Vue SPA).

## Commands

```sh
bun run test          # vitest (from src/)
bun run build:lib     # vite build + tsc declarations (from src/)
bun run build         # build lib + playground
bun run lint          # eslint
bun run typecheck     # tsc --noEmit
```

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please). On every push to `main`, release-please opens/updates a PR that bumps the version and generates a changelog. Merging that PR triggers npm publish automatically.

**Follow [Conventional Commits](https://www.conventionalcommits.org/) closely** — commit messages become the changelog:

- `feat:` → minor bump, appears under "Features"
- `fix:` → patch bump, appears under "Bug Fixes"
- `feat!:` or `BREAKING CHANGE:` footer → major bump
- `chore:`, `docs:`, `refactor:`, `test:` → no release, no changelog entry

Do **not** manually bump versions or run `npm publish`. The `NPM_TOKEN` repo secret handles authentication.

## Code style

- UnoCSS atomic classes use the `uno-` prefix (e.g., `uno-cursor-pointer`)
- Prefer editing existing files over creating new ones
