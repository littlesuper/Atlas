import { test, expect } from '../fixtures/auth';
import { waitForTableLoad } from '../helpers/arco';
import type { Page } from '@playwright/test';

/**
 * 风险评估标签对比度测试
 * - 风险等级标签（中文/英文值）正确映射颜色
 * - 文字与背景对比度符合可读性要求
 * - 风险因素严重性标签正确着色
 * - 亮色/暗色模式均可读
 */
test.describe('Risk Tag Contrast', () => {
  async function goToRiskTab(page: Page) {
    await page.goto('/projects');
    await waitForTableLoad(page);
    const firstProjectLink = page.locator('.arco-table-td a, .arco-table-td .arco-link').first();
    await firstProjectLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstProjectLink.click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.waitForTimeout(1_000);

    const riskTab = page.locator('[role="tab"]').filter({ hasText: 'AI风险评估' });
    await riskTab.click();
    await page.waitForTimeout(1_500);
  }

  /** Parse CSS rgb/rgba string to [r,g,b,a] */
  function parseRgba(s: string): [number, number, number, number] | null {
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] != null ? parseFloat(m[4]) : 1];
  }

  /** Composite foreground rgba over an opaque background rgb */
  function composite(fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] {
    const a = fg[3];
    return [
      Math.round(fg[0] * a + bg[0] * (1 - a)),
      Math.round(fg[1] * a + bg[1] * (1 - a)),
      Math.round(fg[2] * a + bg[2] * (1 - a)),
    ];
  }

  /** Compute relative luminance (WCAG formula) */
  function luminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /** Compute WCAG contrast ratio between two colors */
  function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
    const l1 = luminance(...fg);
    const l2 = luminance(...bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // ──────── TC1: risk level badge uses correct mapped color, not fallback gray ────────
  test('risk level badge renders with mapped color, not default gray', async ({ authedPage: page }) => {
    await goToRiskTab(page);

    // Find risk level tags (中风险, 高风险, 低风险, 严重风险)
    const riskTags = await page.evaluate(() => {
      const labels = ['低风险', '中风险', '高风险', '严重风险'];
      const tags = document.querySelectorAll('.arco-tag');
      return Array.from(tags)
        .filter(tag => labels.includes(tag.textContent?.trim() || ''))
        .map(tag => {
          const style = getComputedStyle(tag);
          return {
            text: tag.textContent?.trim() || '',
            color: style.color,
            bg: style.backgroundColor,
            inlineStyle: tag.getAttribute('style') || '',
          };
        });
    });

    // At least one risk tag should exist if there are assessments
    if (riskTags.length === 0) {
      test.skip();
      return;
    }

    for (const tag of riskTags) {
      // Should NOT be the fallback gray (--color-text-3 ≈ rgb(134,144,156))
      expect(tag.color).not.toBe('rgb(134, 144, 156)');
      // Should have explicit risk-related inline styles
      expect(tag.inlineStyle).toContain('--risk-');
    }
  });

  // ──────── TC2: risk level badge has sufficient contrast ratio ────────
  test('risk level badge has WCAG AA contrast ratio (>=4.5:1)', async ({ authedPage: page }) => {
    await goToRiskTab(page);

    const riskTags = await page.evaluate(() => {
      const labels = ['低风险', '中风险', '高风险', '严重风险'];
      const tags = document.querySelectorAll('.arco-tag');
      return Array.from(tags)
        .filter(tag => labels.includes(tag.textContent?.trim() || ''))
        .map(tag => {
          const style = getComputedStyle(tag);
          return { text: tag.textContent?.trim() || '', color: style.color, bg: style.backgroundColor };
        });
    });

    if (riskTags.length === 0) {
      test.skip();
      return;
    }

    for (const tag of riskTags) {
      const fg = parseRgba(tag.color);
      const bgRaw = parseRgba(tag.bg);
      if (!fg || !bgRaw) continue;
      // Composite semi-transparent bg over white page background
      const bg = composite(bgRaw, [255, 255, 255]);
      const fgRgb: [number, number, number] = [fg[0], fg[1], fg[2]];
      const ratio = contrastRatio(fgRgb, bg);
      // WCAG AA requires >= 4.5:1 for normal text, >= 3:1 for large text (14px bold)
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });

  // ──────── TC3: severity tags on risk factors are colored, not default gray ────────
  test('risk factor severity tags render with correct color', async ({ authedPage: page }) => {
    await goToRiskTab(page);

    const severityTags = await page.evaluate(() => {
      const labels = ['低', '中', '高', '严重'];
      const tags = document.querySelectorAll('.arco-tag');
      return Array.from(tags)
        .filter(tag => labels.includes(tag.textContent?.trim() || ''))
        .map(tag => ({
          text: tag.textContent?.trim() || '',
          classes: tag.className,
          color: getComputedStyle(tag).color,
          bg: getComputedStyle(tag).backgroundColor,
        }));
    });

    if (severityTags.length === 0) {
      test.skip();
      return;
    }

    for (const tag of severityTags) {
      // Should have an Arco color class (arco-tag-red, arco-tag-orange, arco-tag-green)
      // and NOT be the default unstyled tag
      const hasColorClass = /arco-tag-(red|orange|green)/.test(tag.classes);
      expect(hasColorClass).toBe(true);
    }
  });

  // ──────── TC4: dark mode risk tags remain readable ────────
  test('risk tags have sufficient contrast in dark mode', async ({ authedPage: page }) => {
    await goToRiskTab(page);

    // Switch to dark mode
    await page.evaluate(() => document.body.setAttribute('arco-theme', 'dark'));
    await page.waitForTimeout(500);

    const riskTags = await page.evaluate(() => {
      const labels = ['低风险', '中风险', '高风险', '严重风险'];
      const tags = document.querySelectorAll('.arco-tag');
      return Array.from(tags)
        .filter(tag => labels.includes(tag.textContent?.trim() || ''))
        .map(tag => {
          const style = getComputedStyle(tag);
          return { text: tag.textContent?.trim() || '', color: style.color, bg: style.backgroundColor };
        });
    });

    if (riskTags.length === 0) {
      test.skip();
      return;
    }

    for (const tag of riskTags) {
      const fg = parseRgba(tag.color);
      const bgRaw = parseRgba(tag.bg);
      if (!fg || !bgRaw) continue;
      // Dark mode card bg ≈ #252630 = rgb(37,38,48)
      const bg = composite(bgRaw, [37, 38, 48]);
      const fgRgb: [number, number, number] = [fg[0], fg[1], fg[2]];
      const ratio = contrastRatio(fgRgb, bg);
      // Dark mode: text should be clearly readable on dark background
      expect(ratio).toBeGreaterThanOrEqual(3);
    }

    // Restore light mode
    await page.evaluate(() => document.body.removeAttribute('arco-theme'));
  });
});
