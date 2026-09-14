# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes

Foresight is a local Node/TypeScript server (`src/server`) plus a React/D3 frontend (`src/web`). The rehearsal pipeline runs in seven stages:

1. `repoState.ts` — read Modelled state through git plumbing with `--no-optional-locks`
2. `parseCommand.ts`, `allowlist.ts`, `guards.ts` — parsed argv (never a shell), alias expansion, subcommand allowlist, `-c` key gate, interactive refusals, untracked/ignored gate
3. `mirror.ts` — `git clone --local`, sever `origin`, rebuild the index through plumbing rather than copying `.git/index`
4. `sandbox.ts` — sanitized environment, `unshare -Urn`, a verified network probe, wall-clock timeout, output cap
5. `classify.ts` — Preview / Conflict stop / Pause stop / Failure / Refusal / Tool error
6. `diff.ts` — change set, side-effect fingerprints, blocking anomaly
7. `src/web` — playback of the four Modelled surfaces, one shared outcome panel, side-effect badges in their own region

Decisions are recorded in `docs/adr/`; the vocabulary is in `CONTEXT.md`.

## Common Workflows
- Commits should be atomic, 1 commit per 1 task
- Do not use comments
