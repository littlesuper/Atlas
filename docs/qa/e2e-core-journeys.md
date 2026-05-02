# Week 5 Day 3-4 E2E Core User Journeys

This document records the Atlas core user journeys selected for Week 5 E2E
coverage. It is the execution index for the ROADMAP item "覆盖核心用户旅程".

## Selection Rules

- Prefer real business flows over isolated button checks.
- Prefer P0/P1 journeys that would block launch if broken.
- Do not duplicate low-value coverage already present in `e2e/specs/`.
- Treat Atlas' actual product model as source of truth: Atlas has no public
  self-registration flow; users are created by admins.

## Core Journeys

| #   | Core user journey                                                                       | Current E2E coverage                                                                                                                                                                                                                                     | Status  | Next action                                                                    |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| 1   | Login, session, and logout                                                              | `e2e/specs/auth.spec.ts`, `e2e/specs/auth-validation.spec.ts`, `e2e/specs/token-lifecycle.spec.ts`                                                                                                                                                       | Covered | Keep as required smoke coverage                                                |
| 2   | Project base lifecycle: create, search, open detail, delete                             | `e2e/specs/projects.spec.ts`, `e2e/specs/project-edit-search.spec.ts`, `e2e/specs/project-detail-tabs.spec.ts`                                                                                                                                           | Covered | Keep as required smoke coverage                                                |
| 3   | Create project from template and verify generated activities                            | `e2e/specs/project-template-instantiation.spec.ts`, `e2e/specs/template-management.spec.ts`, `e2e/specs/projects.spec.ts`                                                                                                                                | Covered | Keep template instantiation in required E2E coverage                           |
| 4   | Project archive lifecycle: archive, archived filter, restore, read-only restrictions    | `e2e/specs/project-archive.spec.ts`, `e2e/specs/p1-project-activity-ui.spec.ts`, `e2e/specs/snapshots.spec.ts`                                                                                                                                           | Covered | Tighten soft branches when touched                                             |
| 5   | Activity planning: create activity, role binding, dates, dependencies, status edits     | `e2e/specs/activities.spec.ts`, `e2e/specs/activity-role-binding.spec.ts`, `e2e/specs/activity-date-edit.spec.ts`, `e2e/specs/activity-dependencies.spec.ts`, `e2e/specs/activity-inline-edit.spec.ts`, `e2e/specs/inline-editing-comprehensive.spec.ts` | Covered | Keep role binding and date tests in required E2E set                           |
| 6   | Activity import/export and undo rollback                                                | `e2e/specs/activity-export.spec.ts`, `e2e/specs/activity-import.spec.ts`, `e2e/specs/frontend-interactions.spec.ts`                                                                                                                                      | Covered | Keep real import undo rollback in required E2E coverage                        |
| 7   | Weekly report flow: create from project, save draft, edit content, submit, view summary | `e2e/specs/weekly-report-crud.spec.ts`, `e2e/specs/weekly-report-form.spec.ts`, `e2e/specs/weekly-reports.spec.ts`                                                                                                                                       | Covered | Keep deterministic draft/save/submit coverage in required E2E set              |
| 8   | Product flow: create, link project, edit, copy, compare, delete                         | `e2e/specs/products.spec.ts`, `e2e/specs/product-advanced.spec.ts`, `e2e/specs/product-comparison.spec.ts`, `e2e/specs/product-filters.spec.ts`                                                                                                          | Covered | Keep product create/edit/delete in required E2E set                            |
| 9   | Risk flow: trigger assessment, create risk item, view risk dashboard                    | `e2e/specs/risk.spec.ts`, `e2e/specs/risk-items.spec.ts`, `e2e/specs/risk-dashboard.spec.ts`, `e2e/specs/risk-tag-contrast.spec.ts`                                                                                                                      | Covered | Keep risk assessment smoke coverage, avoid requiring external AI configuration |
| 10  | Admin and permissions: users, roles, permissions, and low-privilege restrictions        | `e2e/specs/admin.spec.ts`, `e2e/specs/user-management.spec.ts`, `e2e/specs/role-management.spec.ts`, `e2e/specs/permission-access.spec.ts`, `e2e/specs/permission-buttons.spec.ts`, `e2e/specs/idor-permission.spec.ts`                                  | Covered | Keep permission button visibility and IDOR checks in required E2E set          |

## Immediate Week 5 E2E Backlog

- Completed for the selected Week 5 core journeys.

## CI Expectations

- Every PR continues to run `npm run test:e2e:core`.
- `test:e2e:core` runs the Chromium project because the full E2E suite already
  takes about 22 minutes in CI.
- Cross-browser support is available through `npm run test:e2e:all-browsers` and
  should be used for release validation or targeted smoke checks.

## References

- Detailed case inventory: `e2e/TEST_CASES.md`
- E2E implementation files: `e2e/specs/`
- Playwright configuration: `playwright.config.ts`
