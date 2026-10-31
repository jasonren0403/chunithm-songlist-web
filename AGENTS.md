# Project Instructions

## Project overview

- This is CHUNITHM Song Atlas, a Vue 3 + TypeScript + Vite application using Element Plus.
- The browser reads local catalog JSON and cover images from `public/`; it does not call SEGA, LXNS, or remote image services at runtime.
- Catalog synchronization and its tests are maintained in `scripts/`.

## Development

- Use `pnpm` for package scripts.
- Run `pnpm run type-check`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test`, and `pnpm run build` as applicable to the change.
- Run `pnpm run sync:data` only when catalog data needs updating; it fetches external catalog data and cover images and writes under `public/data/` and `public/images/`.
- Preserve catalog timestamp conventions and data schema when changing synchronization logic. Release-date guidance is in `.agents/skills/sync-wiki-dates/SKILL.md`.
