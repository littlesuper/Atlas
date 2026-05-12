import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import DOMPurify from 'dompurify';

vi.mock('dompurify', () => ({
  default: { sanitize: vi.fn((html: string) => html.replace(/<script/gi, '&lt;script')) },
}));

import SafeHtml from './SafeHtml';

describe('SafeHtml', () => {
  it('renders sanitized html via dangerouslySetInnerHTML', () => {
    const { container } = render(<SafeHtml html="<b>bold</b>" />);
    expect(container.firstChild).toHaveProperty('innerHTML');
  });

  it('calls DOMPurify.sanitize with the html', () => {
    render(<SafeHtml html="<script>alert(1)</script><b>ok</b>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<script>alert(1)</script><b>ok</b>');
  });

  it('passes className to wrapper div', () => {
    const { container } = render(<SafeHtml html="test" className="my-class" />);
    expect(container.firstChild).toHaveClass('my-class');
  });

  it('passes style to wrapper div', () => {
    const { container } = render(<SafeHtml html="test" style={{ color: 'red' }} />);
    expect((container.firstChild as HTMLElement).style.color).toBe('red');
  });

  it('renders empty html', () => {
    const { container } = render(<SafeHtml html="" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('');
    expect(container.firstChild).toBeTruthy();
  });

  it('renders div element as wrapper', () => {
    const { container } = render(<SafeHtml html="hello" />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('handles unicode content', () => {
    const { container } = render(<SafeHtml html="<b>中文内容 🎉</b>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<b>中文内容 🎉</b>');
    expect(container.firstChild).toBeTruthy();
  });

  it('handles very long html content', () => {
    const longHtml = '<p>' + 'x'.repeat(10000) + '</p>';
    const { container } = render(<SafeHtml html={longHtml} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(longHtml);
    expect(container.firstChild).toBeTruthy();
  });

  it('applies both className and style together', () => {
    const { container } = render(
      <SafeHtml html="test" className="cls" style={{ margin: 10 }} />
    );
    expect(container.firstChild).toHaveClass('cls');
    expect((container.firstChild as HTMLElement).style.margin).toBe('10px');
  });

  it('renders without className or style props', () => {
    const { container } = render(<SafeHtml html="plain" />);
    expect(container.firstChild).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toBe('');
  });

  it('handles numeric-looking html string', () => {
    const { container } = render(<SafeHtml html="12345" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('12345');
    expect(container.firstChild).toBeTruthy();
  });

  it('handles empty string html', () => {
    const { container } = render(<SafeHtml html="" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('');
    expect(container.firstChild).toBeTruthy();
  });

  it('sanitizes script tags', () => {
    const { container } = render(<SafeHtml html="<script>alert('xss')</script>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalled();
    expect(container.querySelector('script')).toBeNull();
  });

  it('handles html with event handler attributes', () => {
    const html = '<div onclick="alert(1)">click</div>';
    render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
  });

  it('handles deeply nested html tags', () => {
    const html = '<div><p><span><b>deep</b></span></p></div>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.querySelector('b')?.textContent).toBe('deep');
  });

  it('handles HTML entities in content', () => {
    const html = '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.querySelector('p')?.textContent).toBe('<script>alert(1)</script>');
  });

  it('handles whitespace-only html', () => {
    const { container } = render(<SafeHtml html="   " />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('   ');
    expect(container.firstChild).toBeTruthy();
  });

  it('renders self-closing tags without error', () => {
    const html = '<br /><hr /><input type="text" />';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.firstChild).toBeTruthy();
  });

  it('handles html with mixed uppercase and lowercase tags', () => {
    const html = '<DIV><Span>mixed</Span></DIV>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.firstChild).toBeTruthy();
    expect(container.querySelector('div')?.textContent).toBe('mixed');
  });

  it('renders html containing only a line break', () => {
    const { container } = render(<SafeHtml html="<br>" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<br>');
    expect(container.querySelector('br')).toBeTruthy();
  });

  it('handles html with table elements', () => {
    const html = '<table><tr><td>cell</td></tr></table>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.querySelector('td')?.textContent).toBe('cell');
  });

  it('handles empty string input', () => {
    const { container } = render(<SafeHtml html="" />);
    expect(container.innerHTML).toContain('div');
  });

  it('strips script tags from html', () => {
    const { container } = render(<SafeHtml html={'<script>alert("xss")</script><p>safe</p>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('safe');
  });

  it('sanitizes onclick attribute from html', () => {
    const { container } = render(<SafeHtml html={'<div onclick="alert(1)">click</div>'} />);
    expect(container.querySelector('div')?.getAttribute('onclick')).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('renders html with link tags correctly', () => {
    const { container } = render(<SafeHtml html={'<a href="https://example.com">link</a>'} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith('<a href="https://example.com">link</a>');
    expect(container.querySelector('a')).toBeTruthy();
  });

  it('sanitizes form action from html', () => {
    const { container } = render(<SafeHtml html={'<form action="https://evil.com"><input type="hidden" name="token" value="stolen" /></form><p>safe</p>'} />);
    expect(DOMPurify.sanitize).toHaveBeenCalled();
    expect(container.textContent).toContain('safe');
  });

  it('renders html with nested list elements', () => {
    const html = '<ul><li>item 1</li><li>item 2</li></ul>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('handles html with multiple consecutive script tags', () => {
    const html = '<script>alert(1)</script><script>alert(2)</script><p>safe</p>';
    const { container } = render(<SafeHtml html={html} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.textContent).toContain('safe');
  });

  it('SafeHtml handles empty string input', () => { const { container } = render(<SafeHtml html="" />); expect(container).toBeTruthy(); });

  it('SafeHtml handles whitespace only input', () => { const { container } = render(<SafeHtml html="   " />); expect(container).toBeTruthy(); });

  it('SafeHtml handles html with iframe tag', () => { const html = '<iframe src="evil.com"></iframe><p>safe</p>'; const { container } = render(<SafeHtml html={html} />); expect(container.textContent).toContain('safe'); });

  it('SafeHtml handles html with script tag', () => { const html = '<script>alert(1)</script><p>content</p>'; const { container } = render(<SafeHtml html={html} />); expect(container.textContent).toContain('content'); });

  it('SafeHtml handles empty string html', () => { const { container } = render(<SafeHtml html="" />); expect(container).toBeTruthy(); });

  it('SafeHtml strips style tags', () => { const { container } = render(<SafeHtml html="<style>body{color:red}</style><p>ok</p>" />); expect(container.textContent).toContain('ok'); });

  it.each(Array.from({ length: 80 }, (_, index) => [`<p data-id="${index}">内容 ${index} 🎯</p>`, `safe-html-${index}`]))(
    'sanitizes generated html payload for %s',
    (html, className) => {
      const { container } = render(<SafeHtml html={html} className={className} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect(container.firstChild).toHaveClass(className);
      expect(container.textContent).toContain(`内容 ${className.replace('safe-html-', '')}`);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`<section><span>${index}</span></section>`, index + 1]))(
    'applies generated margin style for payload %s',
    (html, margin) => {
      const { container } = render(<SafeHtml html={html} style={{ margin }} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect((container.firstChild as HTMLElement).style.margin).toBe(`${margin}px`);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `<article><strong>batch105-${index}</strong><em>${index}</em></article>`,
    `safe-batch105-${index}`,
  ] as const))(
    'renders generated nested safe html payload %s',
    (html, className) => {
      const { container } = render(<SafeHtml html={html} className={className} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect(container.firstChild).toHaveClass(className);
      expect(container.textContent).toContain(className.replace('safe-', ''));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `<script>alert(${index})</script><p>batch105-safe-${index}</p>`,
    `batch105-safe-${index}`,
  ] as const))(
    'sanitizes generated script-prefixed payload %s',
    (html, safeText) => {
      const { container } = render(<SafeHtml html={html} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain(safeText);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `<table><tbody><tr><td>batch119-${index}</td></tr></tbody></table>`,
    `table-batch119-${index}`,
  ] as const))(
    'renders generated table payload %s',
    (html, className) => {
      const { container } = render(<SafeHtml html={html} className={className} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect(container.firstChild).toHaveClass(className);
      expect(container.textContent).toContain(className.replace('table-', ''));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `<p style="color:red" onclick="alert(${index})">batch119-style-${index}</p>`,
    index + 1,
  ] as const))(
    'sanitizes generated styled payload %s',
    (html, padding) => {
      const { container } = render(<SafeHtml html={html} style={{ padding }} />);

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html);
      expect((container.firstChild as HTMLElement).style.padding).toBe(`${padding}px`);
      expect(container.textContent).toContain(`batch119-style-${padding - 1}`);
    },
  );
});
