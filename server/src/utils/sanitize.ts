import sanitizeHtml from 'sanitize-html';

/**
 * 清洗 HTML 内容，只保留安全的标签和属性
 * 用于周报富文本字段等用户输入的 HTML 内容
 */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (!html) return null;

  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img', 'span', 'div', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      span: ['style'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedStyles: {
      span: {
        color: [/.*/],
        'background-color': [/.*/],
      },
    },
    // 自动给链接加 noopener
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}
