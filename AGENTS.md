# AGENTS.md

## Environment bootstrap
- Before running any `pnpm` command, always run:
  - `source .venv/bin/activate`
- Run all project commands from the project directory where `package.json` exists

## Common commands
- Unit tests:
  - `source .venv/bin/activate && pnpm test:unit`
- Integration tests (Firebase emulators):
  - `source .venv/bin/activate && pnpm test:integ`
- Full test suite:
  - `source .venv/bin/activate && pnpm test`

## Practical repo notes
- This is an ESM package (`"type": "module"`).
- Source of truth is `src/`; `dist/` is build output.
- If `rg` is unavailable in the environment, use `grep`/`find` fallback.

## Editing and safety expectations
- Do not revert unrelated local changes.
- Prefer minimal, targeted edits with tests for behavior changes.
- Avoid destructive git operations unless explicitly requested.

