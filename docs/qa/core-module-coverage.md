# Core Module Coverage

> Week 4 follow-up: define an honest coverage metric for Atlas core modules.

## Scope

This report is backend-only for now. It tracks the Top 10 candidate core modules from
`docs/qa/core-modules-test-targets.md`, limited to high-risk files in:

- `server/src/routes/`
- `server/src/middleware/`
- `server/src/utils/`

It intentionally does not mix backend coverage with client page/component coverage. Client core coverage should get its own metric after the business team confirms the final Top 10 module list.

## Command

Run server coverage first, then generate the core report:

```bash
npm run test:coverage --workspace=server
npm run coverage:core
```

CI runs the same report after server coverage. The report is advisory only and does not enforce a threshold yet.

## Metric Rule

The script reads `server/coverage/coverage-summary.json` and computes:

- Per-module coverage for statements, branches, functions, and lines.
- Overall core coverage from unique core files, so files shared by multiple modules are not double-counted.
- Missing files from the coverage summary, if any.

The ROADMAP target remains `>= 80%`, but Atlas should not turn this into a blocking gate until the business team confirms the final core module list and agrees which metric is the release gate.

## Current Snapshot

Generated on 2026-05-01 after `npm run test:coverage --workspace=server`.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Overall unique backend core files | 78.37% | 67.58% | 82.53% | 79.66% |

Current interpretation:

- `functions` is above 80%.
- `lines` is close to 80% but not yet at the target.
- `statements` and especially `branches` still need improvement.
- The weakest modules are project lifecycle/snapshots, auth/token lifecycle, and activity scheduling/import paths.

## Next Test Targets

To reach the ROADMAP target honestly, prioritize tests that improve branch coverage in:

1. `server/src/routes/projects.ts`
2. `server/src/routes/auth.ts`
3. `server/src/routes/activities.ts`
4. `server/src/utils/riskEngine.ts`
5. `server/src/utils/excelActivityParser.ts`
