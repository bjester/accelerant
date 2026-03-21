# AGENTS.md

## Environment bootstrap
- If there exists a `.venv/` directory, then before running any `pnpm` command, always run:
  - `source .venv/bin/activate`
- Run all project commands from the project directory where `package.json` exists

## Common commands
Before running any of these, be sure to follow 'Environment bootstrap' instructions.
- Unit tests:
  - `pnpm test:unit`
- Integration tests (Firebase emulators):
  - `pnpm test:integ`
- Full test suite:
  - `pnpm test`

## Practical repo notes
- This is an ESM package (`"type": "module"`).
- Source of truth is `src/`; `dist/` is build output.
- If `rg` is unavailable in the environment, use `grep`/`find` fallback.

## Editing and safety expectations
- Do not revert unrelated local changes.
- Prefer minimal, targeted edits with tests for behavior changes.
- Avoid destructive git operations unless explicitly requested.

