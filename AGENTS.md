# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

Foresight is two npm workspace packages plus one folder of shared types.

- `web` is the React and D3 frontend, scaffolded from the Vite `react-ts` template. `web/src/App.tsx` is the shell: the route, the connected repository, the sandbox health, the session activity, and the masthead.
- `core` is the Express backend. `src/index.ts` only listens; `src/app.ts` builds the app, its routes, and the static serving of `web/dist`.
- `shared` holds the two modules both packages import: `types.ts` and `caveats.ts`.

The frontend is organised under `web/src`:

| Folder | Responsibility |
| --- | --- |
| `pages/` | the four screens, each importing its own stylesheet from beside it |
| `components/` | UI grouped by domain (`masthead/`, `connect/`, `repository/`, `outcome/`), with single-file components left at its root; every component imports its own stylesheet |
| `lib/` | app-wide modules: the API client, routing, the session status, and the view models a repository is rendered through |
| `styles.css` | the shared style layer: tokens, reset, controls, form primitives, the page and section shell, prose, and the utilities |

The backend is organised by domain under `core/src`:

| Folder | Responsibility |
| --- | --- |
| `platform/` | process and filesystem primitives (`git.ts`, `fsutil.ts`, `fsBrowse.ts`, `mounts.ts`, `host.ts`, `winpath.ts`) |
| `command/` | the gate: allowlist, tokenizer and argv parsing, guards, failure explanations |
| `repository/` | reading the repository: modelled state, aliases and identity, disqualifying signals |
| `rehearsal/` | the throwaway run: mirror, sandbox, outcome classification |
| `change/` | the diff between before and after, plus the side-effect fingerprints |
| `pipeline.ts` | the stages in order, from a pasted command to an outcome |

Run these from the repository root: `npm run dev` (both packages), `npm test` (core suites), `npm run typecheck` (both packages), `npm run build` (frontend), `npm start` (core, serving the built frontend). The frontend linter is `npm run lint --workspace web`.

Decisions are recorded in `docs/adr/`; the vocabulary is in `docs/CONTEXT.md`.

## Common Workflows
- Commits should be atomic, 1 commit per 1 task
- Never add a co-author trailer (such as `Co-authored-by:`) to a commit message, and strip any that are present
- Do not use comments
