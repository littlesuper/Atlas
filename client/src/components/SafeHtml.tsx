import React from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 安全渲染 HTML 内容，使用 DOMPurify 消毒防止 XSS
 */
const SafeHtml: React.FC<SafeHtmlProps> = ({ html, className, style }) => (
  <div
    className={className}
    style={style}
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
  />
);

export default SafeHtml;
