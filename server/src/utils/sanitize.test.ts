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
});
