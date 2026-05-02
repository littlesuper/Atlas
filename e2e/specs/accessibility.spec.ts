import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wcagTags = ['wcag2a', 'wcag2aa'];
const arcoKnownIssueExclusions = {
  table: '.arco-table',
  tabs: '.arco-tabs',
} as const;

async function expectNoCriticalA11yViolations(page: Page, pageName: string, excludedSelectors: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(wcagTags);

  for (const selector of excludedSelectors) {
    builder = builder.exclude(selector);
  }

  const results = await builder.analyze();
  const critical = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious'
  );

  const details = critical
    .flatMap((violation) =>
      violation.nodes.map(
        (node) => `[${violation.impact}] ${violation.id}: ${violation.help} (${node.target.join(', ')})`
      )
    )
    .join('\n');

  expect(critical, `${pageName} critical/serious a11y violations:\n${details}`).toHaveLength(0);
}

test.describe('Accessibility audit @a11y', () => {
  test('login page has no critical or serious accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();

    await expectNoCriticalA11yViolations(page, 'Login page', [
      // Arco Tabs missing role="tablist" on wrapper (v2.66).
      arcoKnownIssueExclusions.tabs,
    ]);
  });

  test.describe('authenticated pages', () => {
    test.use({ storageState: 'e2e/.auth/state.json' });

    test('projects page has no critical or serious accessibility violations', async ({ page }) => {
      await page.goto('/projects');
      await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();

      await expectNoCriticalA11yViolations(page, 'Projects page', [
        // Known Arco component issues; keep exclusions explicit and narrow.
        arcoKnownIssueExclusions.table,
        arcoKnownIssueExclusions.tabs,
      ]);
    });

    test('admin page has no critical or serious accessibility violations', async ({ page }) => {
      await page.goto('/admin');
      await expect(page.getByRole('tab', { name: 'AI管理' })).toBeVisible();

      await expectNoCriticalA11yViolations(page, 'Admin page', [
        // Known Arco component issues; keep exclusions explicit and narrow.
        arcoKnownIssueExclusions.table,
        arcoKnownIssueExclusions.tabs,
      ]);
    });
  });
});
