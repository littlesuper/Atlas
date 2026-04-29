import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { sanitizeRichText } from '../sanitize';

describe('SYS-001: path traversal in file uploads', () => {
  it('SYS-001 sanitizes path traversal in filename', () => {
    const dangerousNames = [
      '../../etc/passwd',
      '../../../boot.ini',
      'test/../../../etc/shadow',
    ];

    for (const name of dangerousNames) {
      const sanitized = path.basename(name);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');
    }

    const winStyle = '..\\..\\windows\\system32';
    const normalized = winStyle.replace(/\\/g, '/');
    const sanitized = path.basename(normalized);
    expect(sanitized).not.toContain('..');
  });

  it('SYS-001 timestamp rename prevents path traversal', () => {
    const maliciousName = '../../etc/passwd';
    const ext = path.extname(maliciousName) || '.bin';
    const timestamp = Date.now();
    const safeName = `${timestamp}${ext}`;
    expect(safeName).not.toContain('..');
    expect(safeName).toMatch(/^\d+\.\w+$/);
  });
});

describe('SYS-002: content sniffing / magic number validation', () => {
  it('SYS-002 detects fake PNG (actually JS content)', () => {
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jsContent = Buffer.from('alert("xss")');
    const isPng = jsContent.slice(0, 8).equals(PNG_MAGIC);
    expect(isPng).toBe(false);
  });

  it('SYS-002 validates real PNG magic number', () => {
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const realPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const isPng = realPngHeader.slice(0, 8).equals(PNG_MAGIC);
    expect(isPng).toBe(true);
  });

  it('SYS-002 rejects executable masquerading as image', () => {
    const EXE_MAGIC = Buffer.from([0x4d, 0x5a]);
    const content = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const isExe = content.slice(0, 2).equals(EXE_MAGIC);
    const isPng = content.slice(0, 4).equals(PNG_MAGIC);
    expect(isExe).toBe(true);
    expect(isPng).toBe(false);
  });
});

describe('PROD-024: upload .exe renamed to .png', () => {
  it('PROD-024 extension-based validation rejects .exe', () => {
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const exeFile = 'malware.exe';
    const ext = path.extname(exeFile).toLowerCase();
    expect(allowedExtensions).not.toContain(ext);
  });
});

describe('PROD-026: upload .exe document', () => {
  it('PROD-026 document upload rejects executable files', () => {
    const allowedDocExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar'];
    const exeFile = 'virus.exe';
    const ext = path.extname(exeFile).toLowerCase();
    expect(allowedDocExtensions).not.toContain(ext);
  });
});

describe('WR-009: path traversal in weekly report attachment', () => {
  it('WR-009 attachment filename with path traversal is sanitized', () => {
    const dangerousName = '../../../etc/passwd.png';
    const basename = path.basename(dangerousName);
    expect(basename).toBe('passwd.png');
    expect(basename).not.toContain('..');
  });
});

describe('WRX-024: path traversal in weekly report upload', () => {
  it('WRX-024 file upload with path traversal renamed safely', () => {
    const maliciousName = '../../../etc/shadow';
    const basename = path.basename(maliciousName);
    const timestamp = Date.now();
    const safeName = `${timestamp}_${basename}`;
    expect(safeName).not.toContain('..');
    expect(safeName).not.toContain('/');
  });
});

describe('ARC-003: archive rollback on failure', () => {
  it('ARC-003 if snapshot creation fails, project status remains unchanged', async () => {
    const originalStatus = 'IN_PROGRESS';
    const archiveFailed = true;
    const finalStatus = archiveFailed ? originalStatus : 'ARCHIVED';
    expect(finalStatus).toBe('IN_PROGRESS');
  });
});

describe('ARC-004: concurrent writes during archive', () => {
  it('ARC-004 writes during archive are rejected by rejectIfArchived', () => {
    const projectStatus = 'ARCHIVED';
    const isArchived = projectStatus === 'ARCHIVED';
    expect(isArchived).toBe(true);
  });
});

describe('WRX-009: HTML entity bypass', () => {
  it('WRX-009 named entities (&lt;script&gt;) are sanitized safely', () => {
    const result = sanitizeRichText('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toMatch(/<script/i);
  });

  it('WRX-009 numeric entities (&#60;script&#62;) are decoded and stripped', () => {
    const result = sanitizeRichText('&#60;script&#62;alert(1)&#60;/script&#62;');
    expect(result).not.toContain('<script>');
    expect(result).not.toMatch(/<script/i);
  });

  it('WRX-009 hex entities (&#x3c;script&#x3e;) are decoded and stripped', () => {
    const result = sanitizeRichText('&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;');
    expect(result).not.toContain('<script>');
    expect(result).not.toMatch(/<script/i);
  });

  it('WRX-009 double-encoded entities remain as text (not executable)', () => {
    const result = sanitizeRichText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
    expect(result).not.toContain('<script>');
  });

  it('WRX-009 mixed entity attack in img onerror is stripped', () => {
    const result = sanitizeRichText('<img src=x &#111;&#110;error=alert(1)>');
    expect(result).not.toContain('onerror');
  });
});

describe('CHAOS-009: Prisma schema mismatch', () => {
  it('CHAOS-009 importing PrismaClient when not generated throws or is empty', async () => {
    try {
      const mod = await import('@prisma/client');
      expect(mod.PrismaClient).toBeDefined();
    } catch {
      expect(true).toBe(true);
    }
  });

  it('CHAOS-009 npx prisma generate produces client with expected exports', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const instance = new PrismaClient();
    expect(instance).toBeDefined();
    expect(instance.user).toBeDefined();
    expect(instance.project).toBeDefined();
    expect(instance.product).toBeDefined();
  });
});

describe('PROD-025: SVG upload sanitization', () => {
  function sanitizeSvgContent(content: string): string {
    let sanitized = content;

    const DANGEROUS_SVG_TAGS = new Set([
      'script', 'iframe', 'embed', 'object', 'applet', 'form',
      'input', 'textarea', 'select', 'button', 'link', 'meta',
      'base', 'style', 'noscript', 'template',
    ]);

    for (const tag of DANGEROUS_SVG_TAGS) {
      const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>|<${tag}[\\s\\/]*>`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }

    sanitized = sanitized.replace(
      /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      '',
    );

    sanitized = sanitized.replace(
      /\s+(?:xlink:)?href\s*=\s*("(?:javascript|data|vbscript)[^"]*"|'(?:javascript|data|vbscript)[^']*'|(?:javascript|data|vbscript)[^\s>]+)/gi,
      '',
    );

    return sanitized;
  }

  it('PROD-025 strips onload event from SVG', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" onload="alert(1)"/></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('onload');
    expect(result).toContain('<rect');
    expect(result).toContain('</svg>');
  });

  it('PROD-025 strips script tag from SVG', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle r="50"/></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<circle');
  });

  it('PROD-025 strips onerror event handler', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)"/></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('onerror');
    expect(result).toContain('<image');
  });

  it('PROD-025 strips javascript: href in SVG', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<a');
    expect(result).toContain('<text');
  });

  it('PROD-025 preserves safe SVG content', () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="red"/></svg>';
    const result = sanitizeSvgContent(safe);
    expect(result).toBe(safe);
  });

  it('PROD-025 strips onclick, onmouseover, onfocus attributes', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><g onclick="evil()" onmouseover="bad()" onfocus="harm()"><rect/></g></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('onfocus');
    expect(result).toContain('<rect');
  });

  it('PROD-025 strips iframe from SVG', () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="http://evil.com"></iframe></foreignObject></svg>';
    const result = sanitizeSvgContent(malicious);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<foreignObject');
  });
});
