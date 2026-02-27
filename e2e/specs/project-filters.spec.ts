import { test, expect } from '../fixtures/auth';
import { waitForTableLoad } from '../helpers/arco';

/**
 * 项目列表页筛选功能测试
 * - 产品线筛选按钮显示与交互
 * - 产品线筛选按钮尺寸
 */
test.describe('Project List Filters', () => {
  test('product line filter tags are visible and properly sized', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    // Find product line checkable tags (蒲公英 / 向日葵)
    const dandelionTag = page.locator('.arco-tag-checkable').filter({ hasText: '蒲公英' });
    const sunflowerTag = page.locator('.arco-tag-checkable').filter({ hasText: '向日葵' });

    await expect(dandelionTag).toBeVisible();
    await expect(sunflowerTag).toBeVisible();

    // Verify medium size: check that font-size is 14px
    const fontSize = await dandelionTag.evaluate(el => window.getComputedStyle(el).fontSize);
    expect(parseInt(fontSize)).toBeGreaterThanOrEqual(14);
  });

  test('clicking product line tag toggles filter', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    const totalRows = await page.locator('.arco-table-body .arco-table-tr').count();

    // Uncheck 向日葵 (should keep at least 蒲公英)
    const sunflowerTag = page.locator('.arco-tag-checkable').filter({ hasText: '向日葵' });
    await sunflowerTag.click();
    await waitForTableLoad(page);

    const filteredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(filteredRows).toBeLessThanOrEqual(totalRows);

    // Re-check 向日葵
    await sunflowerTag.click();
    await waitForTableLoad(page);

    const restoredRows = await page.locator('.arco-table-body .arco-table-tr').count();
    expect(restoredRows).toBe(totalRows);
  });

  test('cannot uncheck the last product line tag', async ({ authedPage: page }) => {
    await waitForTableLoad(page);

    const dandelionTag = page.locator('.arco-tag-checkable').filter({ hasText: '蒲公英' });
    const sunflowerTag = page.locator('.arco-tag-checkable').filter({ hasText: '向日葵' });

    // Uncheck 蒲公英 first
    await dandelionTag.click();
    await page.waitForTimeout(300);

    // Try to uncheck 向日葵 (should not work — at least one must remain)
    await sunflowerTag.click();
    await page.waitForTimeout(300);

    // 向日葵 should still be checked (has a color class, not plain gray)
    const isChecked = await sunflowerTag.evaluate(
      el => el.classList.contains('arco-tag-checked') || el.classList.contains('arco-tag-checkable-checked')
    );
    expect(isChecked).toBeTruthy();

    // Restore: re-check 蒲公英
    await dandelionTag.click();
    await page.waitForTimeout(300);
  });
});
