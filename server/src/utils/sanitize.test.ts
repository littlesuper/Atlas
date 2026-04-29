import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from './sanitize';

describe('sanitizeRichText', () => {
  // ─── null / undefined / empty ─────────────────────────────
  it('returns null for null input', () => {
    expect(sanitizeRichText(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizeRichText(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeRichText('')).toBeNull();
  });

  // ─── safe tags preserved ──────────────────────────────────
  it('preserves safe tags: p, strong, em, ul, li', () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p><ul><li>item</li></ul>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item</li>');
  });

  it('preserves heading and table tags', () => {
    const html = '<h1>Title</h1><table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
    const result = sanitizeRichText(html);
    expect(result).toContain('<h1>');
    expect(result).toContain('<table>');
    expect(result).toContain('<td>Cell</td>');
  });

  // ─── dangerous tags stripped ──────────────────────────────
  it('strips <script> tags', () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips <iframe> tags', () => {
    const html = '<p>Content</p><iframe src="http://evil.com"></iframe>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('evil.com');
  });

  it('strips onerror and other event handler attributes', () => {
    const html = '<img src="x" onerror="alert(1)" />';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  // ─── allowed attributes ───────────────────────────────────
  it('preserves whitelisted attributes on tags', () => {
    const html = '<a href="https://example.com" target="_blank">Link</a>';
    const result = sanitizeRichText(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
  });

  it('preserves img src and alt attributes', () => {
    const html = '<img src="photo.jpg" alt="Photo" width="100" />';
    const result = sanitizeRichText(html);
    expect(result).toContain('src="photo.jpg"');
    expect(result).toContain('alt="Photo"');
    expect(result).toContain('width="100"');
  });

  // ─── auto rel for links ───────────────────────────────────
  it('auto-adds rel="noopener noreferrer" to <a> tags', () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitizeRichText(html);
    expect(result).toContain('rel="noopener noreferrer"');
  });

  // ─── WRX-003: SVG onload ────────────────────────────
  it('WRX-003 strips <svg onload=...>', () => {
    const html = '<svg onload="alert(1)"><circle r="40"/></svg>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert');
  });

  // ─── WRX-004: javascript: URI ──────────────────────
  it('WRX-004 strips javascript: href from <a> tags', () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert');
  });

  // ─── WRX-006: style tag ────────────────────────────
  it('WRX-006 strips <style> tags', () => {
    const html = '<p>text</p><style>@import url("http://evil.com/evil.css")</style>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<style');
    expect(result).not.toContain('@import');
    expect(result).toContain('<p>text</p>');
  });

  // ─── WRX-007: data: URI ────────────────────────────
  it('WRX-007 rejects data:text/html URIs in src', () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>" />';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('data:text/html');
  });

  // ─── WRX-008: case bypass ──────────────────────────
  it('WRX-008 strips <ScRiPt> case-insensitive', () => {
    const html = '<ScRiPt>alert(1)</ScRiPt>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('cript');
    expect(result).not.toContain('alert');
  });

  // ─── WRX-014: dangerous tags blacklist ─────────────
  it('WRX-014 strips form, input, object, embed tags', () => {
    const html = '<form action="/steal"><input type="text" /><object data="evil"></object><embed src="x"></form>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  // ─── PROD-025: SVG with onload event ───────────────
  it('PROD-025 SVG onload event is stripped', () => {
    const html = '<svg width="100" onload="alert(\'xss\')"><rect/></svg>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('onload');
  });

  // ─── WRX-010: markdown injection ────────
  it('WRX-010 markdown syntax is treated as plain text', () => {
    const html = '<p>**bold** [link](http://evil.com) {{template}}</p>';
    const result = sanitizeRichText(html);
    expect(result).toContain('**bold**');
    expect(result).not.toContain('<a href="http://evil.com">link</a>');
  });

  // ─── WRX-013: non-whitelist tags stripped ────────
  it('WRX-013 non-whitelist tags like <marquee> are stripped', () => {
    const html = '<p>Hello</p><marquee>scrolling</marquee><blink>blinking</blink>';
    const result = sanitizeRichText(html);
    expect(result).not.toContain('<marquee');
    expect(result).not.toContain('<blink');
    expect(result).toContain('<p>Hello</p>');
  });

  // ─── WRX-015: large HTML content ────────
  it('WRX-015 handles large HTML content (100KB)', () => {
    const bigContent = '<p>' + 'A'.repeat(100000) + '</p>';
    const result = sanitizeRichText(bigContent);
    expect(result).toContain('<p>');
    expect(result).toContain('</p>');
  });

  // ─── WRX-016: deeply nested HTML ────────
  it('WRX-016 handles 100-level nested divs', () => {
    const deep = '<div>'.repeat(100) + 'content' + '</div>'.repeat(100);
    const result = sanitizeRichText(deep);
    expect(result).toContain('content');
  });
});
