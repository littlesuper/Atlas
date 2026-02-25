import { type Page, expect } from '@playwright/test';

/** Click an Arco Design Select trigger by placeholder, then pick an option */
export async function selectOption(
  page: Page,
  placeholder: string,
  optionText: string,
) {
  await page.getByPlaceholder(placeholder).click();
  await page.locator('.arco-select-popup .arco-select-option').filter({ hasText: optionText }).first().click();
}

/** Wait for an Arco Message notification containing the given text */
export async function expectMessage(page: Page, text: string) {
  await expect(
    page.locator('.arco-message').filter({ hasText: text }),
  ).toBeVisible({ timeout: 10_000 });
}

/** Click a nav menu item by its visible text */
export async function clickNavItem(page: Page, text: string) {
  await page.locator('.nav-item').filter({ hasText: text }).click();
}

/** Click the OK button in an Arco Modal confirm dialog */
export async function confirmModal(page: Page) {
  await page.locator('.arco-modal-footer .arco-btn-primary').click();
}

/** Wait for table loading overlay to disappear */
export async function waitForTableLoad(page: Page) {
  await page.locator('.arco-spin-loading').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
}

/** Click an Arco Tabs tab by its title text */
export async function clickTab(page: Page, title: string) {
  const tab = page.locator('[role="tab"]').filter({ hasText: title }).first();
  await tab.waitFor({ state: 'visible', timeout: 10_000 });
  await tab.click();
}

/** Wait for navigation to complete and content to settle */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/** Click a drawer/modal footer submit button */
export async function clickDrawerSubmit(page: Page, text: string) {
  const btn = page.locator('.arco-drawer-footer').getByRole('button', { name: text });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

/**
 * Fill an Arco RangePicker by clicking calendar cells.
 * The range picker renders two side-by-side `.arco-panel-date` panels.
 * We click today in the left panel (start) and the 15th in the right panel (end).
 */
export async function pickDateRange(page: Page, container: string = '.arco-drawer') {
  const picker = page.locator(`${container} .arco-picker-range`);
  await picker.locator('input').first().click();

  // Wait for the calendar popup panels
  const panels = page.locator('.arco-panel-date');
  await panels.first().waitFor({ state: 'visible', timeout: 5_000 });

  // Click today in the left panel as start date
  await panels.first().locator('.arco-picker-cell-today').click();
  await page.waitForTimeout(500);

  // Click the 15th in the right panel as end date
  const rightCells = panels.nth(1).locator('.arco-picker-cell.arco-picker-cell-in-view');
  await rightCells.nth(14).click();
  await page.waitForTimeout(500);
}
