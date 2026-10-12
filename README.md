# Team Scheduler

Team calendar with drag-n-drop, shared free-time search and public booking pages.
Built with Next.js (App Router), React, TypeScript, React Hook Form + zod and date-fns.

## Requirements

- Node.js 22.12+ (see `.nvmrc`; run `nvm use`)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript in strict mode |
| `npm test` | Unit tests (Vitest) |
| `npm run test:tz` | Unit tests under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`; results must match |

Environment variables, manual verification steps and architecture notes are added as the features land.
