# Dependency Management Baseline

This document records the Week 2 Day 5 dependency management rollout for Atlas.

## Scope

Atlas is an npm workspaces monorepo with:

- root tooling dependencies
- `client` React/Vite dependencies
- `server` Express/Prisma dependencies

There is no Python package manifest or lockfile in the current project, so `pip-audit` does not apply.

## Current Audit Result

`npm audit --audit-level=high` passes.

The current lockfile still reports two moderate advisories from `exceljs -> uuid`. The automatic force fix would downgrade `exceljs` to `3.4.0`, which is a breaking dependency change. Because the roadmap only requires high/critical remediation at this stage, this was documented instead of forced.

## Removed Direct Dependencies

The following direct dependencies were removed after checking both `depcheck` output and source references with `rg`:

- `client`: `@arco-design/color`
- `client`: `@vitejs/plugin-basic-ssl`
- `server`: `dayjs`
- `server`: `morgan`
- `server`: `@types/morgan`

Notes:

- `@arco-design/color` remains in the lockfile as a transitive dependency of Arco Design; only the unused direct dependency was removed.
- `morgan` had already been replaced by the Pino-based `httpLogger` middleware.

## Kept Despite depcheck Warnings

- `@vitest/coverage-v8`: required by CI coverage runs that call `vitest --coverage`.
- `pino-pretty`: loaded dynamically by Pino through `transport.target`.

`depcheck` also cannot parse `client/tsconfig.json` as strict JSON because Vite/TypeScript projects commonly use JSONC comments. Treat future depcheck output as a signal for manual review, not as an automatic deletion list.

## Update Flow

Dependabot is configured in `.github/dependabot.yml`:

- npm workspace dependency updates every Monday at 09:00 Asia/Shanghai
- GitHub Actions dependency updates every Monday at 09:30 Asia/Shanghai
- PR limits are capped to avoid flooding the team
- commit messages use `chore(deps)` for easy filtering

Dependency PRs should follow the existing protected-branch process: required CI checks must pass, and AI/code-owner review should confirm the update is necessary, maintained, and compatible before merge.
