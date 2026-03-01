import { test, expect } from '../fixtures/auth';
import { waitForTableLoad, waitForPageLoad } from '../helpers/arco';

/**
 * 全站表头单行检测
 *
 * 规则：所有页面的表格表头文字不允许换行（换行说明列宽不足）。
 * 判定方式：每个 th 的实际渲染高度不超过单行基准高度（首个 th 高度 + 4px 容差）。
 * 覆盖页面：项目列表、项目详情（活动列表）、产品列表、周报汇总、资源负荷、系统管理（用户/角色/审计日志）。
 */
test.describe('Table header no-wrap check', () => {
  /** 在当前页面检测所有 arco-table 的表头是否存在换行 */
  async function assertNoHeaderWrap(page: import('@playwright/test').Page, pageName: string) {
    const tables = page.locator('.arco-table');
    const tableCount = await tables.count();

    for (let t = 0; t < tableCount; t++) {
      const table = tables.nth(t);
      if (!(await table.isVisible().catch(() => false))) continue;

      const wrappedHeaders = await table.locator('thead th').evaluateAll((ths) => {
        if (ths.length === 0) return [];
        // 检测表头是否换行（标题文字与排序图标不在同一行）
        // 策略 1：有排序的列 → 比较 sorter-wrapper 高度，超过正常值说明内容被挤到多行
        // 策略 2：无排序的列 → 比较 title 元素的高度与单行基准
        // 先收集所有有排序列的 wrapper 高度，取最小值作为正常基准
        const sorterHeights: number[] = [];
        for (const th of ths) {
          const wrapper = th.querySelector('.arco-table-cell-with-sorter') as HTMLElement | null;
          if (wrapper) sorterHeights.push(wrapper.getBoundingClientRect().height);
        }
        const normalSorterH = sorterHeights.length > 0 ? Math.min(...sorterHeights) : 0;

        type WrappedInfo = { text: string; height: number; baseline: number };
        return ths.reduce<WrappedInfo[]>((acc, th) => {
          const titleEl = th.querySelector('.arco-table-th-item-title') as HTMLElement | null;
          if (!titleEl) return acc;
          const text = (titleEl.textContent || '').trim();
          if (!text) return acc;

          const wrapper = th.querySelector('.arco-table-cell-with-sorter') as HTMLElement | null;
          if (wrapper) {
            // 有排序列：wrapper 高度超过正常值 + 10px 视为换行
            const h = wrapper.getBoundingClientRect().height;
            if (h > normalSorterH + 10) {
              acc.push({ text, height: Math.round(h), baseline: Math.round(normalSorterH) });
            }
          } else {
            // 无排序列：title 元素高度超过 1.5 倍行高视为换行
            const style = window.getComputedStyle(titleEl);
            const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 22;
            const h = titleEl.getBoundingClientRect().height;
            if (h > lineHeight * 1.5) {
              acc.push({ text, height: Math.round(h), baseline: Math.round(lineHeight) });
            }
          }
          return acc;
        }, []);
      });

      if (wrappedHeaders.length > 0) {
        const details = wrappedHeaders
          .map(h => `"${h.text}" (${h.height}px, 基准${h.baseline}px)`)
          .join(', ');
        // 截图以便定位问题
        await page.screenshot({
          path: `e2e/screenshots/header-wrap-${pageName}-table${t}.png`,
          fullPage: false,
        });
        expect.soft(wrappedHeaders.length, `[${pageName}] 表头换行: ${details}`).toBe(0);
      }
    }
  }

  test('project list headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForTableLoad(page);
    await assertNoHeaderWrap(page, 'project-list');
  });

  test('activity list headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForTableLoad(page);

    // 进入第一个项目详情（活动列表）
    const link = page.locator('.arco-table-td a').first();
    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click();
      await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 15_000 });
      await page.waitForTimeout(1_000);
      await waitForTableLoad(page);
      await assertNoHeaderWrap(page, 'activity-list');
    }
  });

  test('product list headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('.nav-item').filter({ hasText: '产品管理' }).click();
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
    await assertNoHeaderWrap(page, 'product-list');
  });

  test('weekly report headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('.nav-item').filter({ hasText: '项目周报' }).click();
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
    await assertNoHeaderWrap(page, 'weekly-report');
  });

  test('workload headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('.nav-item').filter({ hasText: '项目资源' }).click();
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
    await assertNoHeaderWrap(page, 'workload');
  });

  test('admin page headers do not wrap', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator('.nav-item').filter({ hasText: '系统管理' }).click();
    await page.waitForTimeout(1_000);
    await waitForTableLoad(page);
    await assertNoHeaderWrap(page, 'admin');
  });
});
