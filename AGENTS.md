# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

Foresight is two npm workspace packages plus one folder of shared types.

- `web` is the React and D3 frontend, scaffolded from the Vite `react-ts` template. `web/src/App.tsx` owns the layout: the command input, then command info beside the commit graph.
- `server` is the Express backend. `src/index.ts` only listens; `src/app.ts` builds the app, its routes, and the static serving of `web/dist`.
- `shared` holds the two modules both packages import: `types.ts` and `caveats.ts`.

The backend is organised by domain under `server/src`:

| Folder | Responsibility |
| --- | --- |
| `platform/` | process and filesystem primitives (`git.ts`, `fsutil.ts`) |
| `command/` | the gate: allowlist, tokenizer and argv parsing, guards, failure explanations |
| `repository/` | reading the repository: modelled state, aliases and identity, disqualifying signals |
| `rehearsal/` | the throwaway run: mirror, sandbox, outcome classification |
| `change/` | the diff between before and after, plus the side-effect fingerprints |
| `session/` | the in-memory session history |
| `pipeline.ts` | the stages in order, from a pasted command to an outcome |

Run these from the repository root: `npm run dev` (both packages), `npm test` (server suites), `npm run build` (frontend), `npm start` (server, serving the built frontend).

Decisions are recorded in `docs/adr/`; the vocabulary is in `CONTEXT.md`.

## Common Workflows
- Commits should be atomic, 1 commit per 1 task
- Do not use comments
