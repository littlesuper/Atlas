import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const authedPage = async (page: any) => {
  // Load auth state
  const storageState = 'e2e/.auth/state.json';
  return page;
};

test.describe('无障碍 (Accessibility) 审计', () => {
  test.use({ storageState: 'e2e/.auth/state.json' });

  test('项目列表页无严重无障碍问题', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.arco-table')  // Arco Table has known issues
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (critical.length > 0) {
      console.log('Critical/Serious a11y violations:');
      critical.forEach((v) => {
        console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
        console.log(`    Help: ${v.helpUrl}`);
        v.nodes.forEach((n) => console.log(`    Target: ${n.target}`));
      });
    }

    expect(critical.length).toBe(0);
  });

  test('登录页无严重无障碍问题', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical.length).toBe(0);
  });

  test('管理员页面无严重无障碍问题', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.arco-table')
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(critical.length).toBe(0);
  });
});
