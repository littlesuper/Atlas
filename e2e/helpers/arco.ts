import { type Page, expect } from '@playwright/test';

// 注意：站点已从 Arco Design 迁移到 shadcn/ui（Tailwind + Radix）。
// 文件名保留为 arco.ts 以免改动 85+ spec 的 import 路径；选择器已全部改为 shadcn 等价物：
//   表格 → 原生 table/tr/td（含 [data-slot="table-*"]）
//   抽屉 Drawer → Sheet（[data-slot="sheet-*"]）
//   弹窗 Modal → Dialog / AlertDialog（[data-slot="dialog-*"] / [data-slot="alert-dialog-*"]）
//   下拉 Select → shadcn Select（[role="option"]）或 Combobox/MultiSelect（[data-slot="command-item"]）
//   消息 Message → sonner toast（[data-sonner-toast]）
//   日期选择 → Popover + react-day-picker（[data-day] 日按钮）

/** Open a Select/Combobox trigger (by its placeholder/visible text) then pick an option by text */
export async function selectOption(page: Page, placeholder: string, optionText: string) {
  // 触发器：可能是带 placeholder 的 input（Combobox 模型字段），或显示 placeholder 文案的 button（Select/Combobox）
  const inputTrigger = page.getByPlaceholder(placeholder);
  if (await inputTrigger.count()) {
    await inputTrigger.first().click();
  } else {
    await page
      .getByRole('combobox', { name: placeholder })
      .or(page.getByRole('button', { name: placeholder }))
      .or(page.getByText(placeholder, { exact: false }))
      .first()
      .click();
  }
  // 选项：shadcn Select 的 [role="option"] 或 Combobox/MultiSelect 的 command-item
  await page
    .locator('[data-slot="select-content"] [role="option"], [data-slot="command-item"], [role="option"]')
    .filter({ hasText: optionText })
    .first()
    .click();
}

/** Wait for a sonner toast containing the given text */
export async function expectMessage(page: Page, text: string) {
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: text }).or(page.getByText(text)).first(),
  ).toBeVisible({ timeout: 10_000 });
}

/** Click a nav menu item by its visible text */
export async function clickNavItem(page: Page, text: string) {
  await page.locator('.nav-item').filter({ hasText: text }).click();
}

/** Click the confirm/OK button in a Dialog or AlertDialog */
export async function confirmModal(page: Page) {
  await page
    .locator('[data-slot="alert-dialog-action"]')
    .or(page.locator('[data-slot="dialog-footer"] button').last())
    .first()
    .click();
}

/** Wait for table loading spinner to disappear */
export async function waitForTableLoad(page: Page) {
  await page.locator('.animate-spin').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
}

/** Click a Tabs tab by its title text */
export async function clickTab(page: Page, title: string) {
  const tab = page.locator('[role="tab"]').filter({ hasText: title }).first();
  await tab.waitFor({ state: 'visible', timeout: 10_000 });
  await tab.click();
}

/** Wait for navigation to complete and content to settle */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/** Click a Sheet (drawer) footer submit button by text */
export async function clickDrawerSubmit(page: Page, text: string) {
  const btn = page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: text });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

/**
 * Fill a shadcn DateRangePicker by opening the popover and clicking two day cells.
 * The trigger button shows "选择起止日期" (or a formatted range). The popover renders a
 * react-day-picker calendar; day buttons carry a [data-day] attribute.
 */
export async function pickDateRange(page: Page, container: string = '[data-slot="sheet-content"]') {
  const scope = page.locator(container);
  await scope.getByRole('button', { name: /选择起止日期|~/ }).first().click();
  await pickTwoCalendarDays(page);
}

async function pickTwoCalendarDays(page: Page) {
  const days = page.locator('[data-day]:not([disabled]):not([aria-disabled="true"])');
  await days.first().waitFor({ state: 'visible', timeout: 5_000 });
  const count = await days.count();
  await days.nth(Math.min(2, count - 1)).click();
  await page.waitForTimeout(300);
  await days.nth(Math.min(count - 2, count - 1)).click();
  await page.waitForTimeout(300);
  // 关闭日历 popover
  await page.keyboard.press('Escape').catch(() => {});
}

/**
 * Open the "新建活动" drawer via the "活动" dropdown in the project detail toolbar.
 */
export async function openCreateActivityDrawer(page: Page) {
  await page.getByRole('button', { name: '活动' }).click();
  await page.waitForTimeout(300);
  await page.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: '新建活动' }).click();
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible({ timeout: 5_000 });
}

/**
 * Click a sub-nav item by text (admin 用户管理/角色管理/企微配置 are now Tabs).
 */
export async function clickSubNav(page: Page, text: string) {
  const tab = page.locator('[role="tab"]').filter({ hasText: text }).first();
  if (await tab.count()) {
    await tab.click();
  } else {
    await page.getByText(text, { exact: true }).click();
  }
  await page.waitForTimeout(500);
}

/** Search for a project by name on the project list page. */
export async function searchProject(page: Page, projectName: string) {
  const searchInput = page.getByPlaceholder(/搜索项目名称/);
  await searchInput.fill(projectName);
  await page.waitForTimeout(500);
  await waitForTableLoad(page);
}

/**
 * Create a project via the Sheet form. Returns the project name used.
 */
export async function createProjectViaPage(page: Page, options?: { name?: string; desc?: string }) {
  const projectName = options?.name || `E2E-${Date.now()}`;
  const projectDesc = options?.desc || 'E2E auto test project';
  const sheet = page.locator('[data-slot="sheet-content"]');

  await page.getByRole('button', { name: '新建项目' }).click();
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(300);

  await sheet.getByPlaceholder('请输入项目名称').fill(projectName);
  await sheet.getByPlaceholder('请输入项目描述').fill(projectDesc);

  await pickDateRange(page);

  // 项目经理 Combobox
  await sheet.getByRole('combobox', { name: /选择项目经理|请选择/ }).or(sheet.getByText('选择项目经理')).first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-slot="command-item"]').first().click();
  await page.waitForTimeout(200);

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '创建项目' }).click();
  const resp = await responsePromise;
  expect(resp.status()).toBeLessThan(400);

  await expect(sheet).not.toBeVisible({ timeout: 5_000 });
  await waitForTableLoad(page);

  return projectName;
}

/**
 * Edit an existing project via the Sheet form.
 */
export async function editProjectViaPage(
  page: Page,
  projectName: string,
  updates: { name?: string; desc?: string },
) {
  await searchProject(page, projectName);
  await page.waitForTimeout(300);

  const row = page.locator('tbody tr').filter({ hasText: projectName }).first();
  await row.getByRole('button', { name: '编辑' }).click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(500);

  if (updates.name) {
    const nameInput = sheet.getByPlaceholder('请输入项目名称');
    await nameInput.clear();
    await nameInput.fill(updates.name);
  }
  if (updates.desc) {
    const descInput = sheet.getByPlaceholder('请输入项目描述');
    await descInput.clear();
    await descInput.fill(updates.desc);
  }

  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/projects') && resp.request().method() === 'PUT',
    { timeout: 15_000 },
  );
  await page.locator('[data-slot="sheet-footer"]').getByRole('button', { name: '保存修改' }).click();
  const resp = await responsePromise;
  expect(resp.status()).toBeLessThan(400);

  await expect(sheet).not.toBeVisible({ timeout: 5_000 });
}

/** Pick a date range on a full page (not inside a drawer) */
export async function pickDateRangeOnPage(page: Page) {
  await page.getByRole('button', { name: /选择起止日期|~/ }).first().click();
  await pickTwoCalendarDays(page);
}
