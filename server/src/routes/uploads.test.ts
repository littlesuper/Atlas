import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      roles: [{ id: 'r1', name: 'admin', description: null }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import uploadsRoutes from './uploads';

const app = express();
app.use('/api/uploads', uploadsRoutes);

const uploadsDir = path.join(__dirname, '../../uploads');
const createdFiles = new Set<string>();

function uploadedPath(filename: string): string {
  return path.join(uploadsDir, filename);
}

function trackUploadedFile(filename: string): string {
  const filePath = uploadedPath(filename);
  createdFiles.add(filePath);
  return filePath;
}

afterEach(() => {
  for (const filePath of createdFiles) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  createdFiles.clear();
});

describe('POST /api/uploads', () => {
  it('renames path traversal filenames into the uploads directory', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    const res = await request(app)
      .post('/api/uploads')
      .attach('file', png, {
        filename: '../../evil.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toMatch(/^\d{8}_\d{6}_\d{4}\.png$/);
    expect(res.body.name).not.toContain('..');
    expect(res.body.name).not.toContain('/');
    expect(res.body.url).toBe(`/uploads/${res.body.name}`);

    const savedPath = trackUploadedFile(res.body.name);
    expect(path.dirname(savedPath)).toBe(uploadsDir);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  it('rejects files whose content does not match the declared MIME type', async () => {
    const before = new Set(fs.readdirSync(uploadsDir));

    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('alert("xss")'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });

    const after = new Set(fs.readdirSync(uploadsDir));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('文件内容与类型不匹配，已拒绝');
    expect([...after].sort()).toEqual([...before].sort());
  });

  it('sanitizes dangerous SVG content before returning the upload URL', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(2)"><rect onload="evil()" width="10" height="10"/></a></svg>',
    );

    const res = await request(app)
      .post('/api/uploads')
      .attach('file', svg, {
        filename: 'diagram.svg',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(200);

    const savedPath = trackUploadedFile(res.body.name);
    const sanitized = fs.readFileSync(savedPath, 'utf-8');
    expect(sanitized).toContain('<svg');
    expect(sanitized).toContain('<rect');
    expect(sanitized).not.toMatch(/<script/i);
    expect(sanitized).not.toMatch(/\sonload\s*=/i);
    expect(sanitized).not.toMatch(/javascript:/i);
  });
});

describe('DELETE /api/uploads/:filename', () => {
  it('keeps encoded path traversal deletes inside the uploads directory', async () => {
    const outsidePath = path.join(os.tmpdir(), 'atlas-upload-outside.txt');
    const insidePath = uploadedPath('atlas-upload-outside.txt');
    fs.writeFileSync(outsidePath, 'outside');
    fs.writeFileSync(insidePath, 'inside');
    createdFiles.add(outsidePath);
    createdFiles.add(insidePath);

    const res = await request(app).delete(`/api/uploads/${encodeURIComponent('../../../../tmp/atlas-upload-outside.txt')}`);

    expect(res.status).toBe(200);
    expect(fs.existsSync(outsidePath)).toBe(true);
    expect(fs.existsSync(insidePath)).toBe(false);
  });

  it('returns 404 for missing files without exposing local filesystem paths', async () => {
    const res = await request(app).delete('/api/uploads/missing-file.png');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: '文件不存在' });
    expect(JSON.stringify(res.body)).not.toContain(uploadsDir);
  });
});
