# Node Runtime Baseline

This document records the Node.js runtime baseline used by Atlas tooling, CI, and deployment validation.

## Current Baseline

- Node.js: `>=20.19.0`
- npm: `>=9.0.0`
- CI pin: `.github/workflows/ci.yml` uses `NODE_VERSION: 20.19.0`
- Local hint: `.nvmrc` contains `20.19.0`

## Why This Changed

Atlas previously declared `engines.node >=18.0.0`. That was no longer accurate for the current dependency upgrade path because `eslint@10.2.1` requires Node `^20.19.0 || ^22.13.0 || >=24`.

Keeping the project engine at `>=18.0.0` while accepting ESLint 10 would let CI pass but leave some developer machines unable to run `npm ci` or `npm run lint`. The baseline is now explicit before the ESLint 10 upgrade is considered.

## Operational Notes

- Developers using nvm can run `nvm use` from the repo root.
- CI should keep `NODE_VERSION` aligned with this document and root `package.json`.
- Production deployment validation should reject hosts below Node `20.19.0`.
- This change documents the minimum runtime baseline only; it does not modify production service configuration or deployment scripts.
