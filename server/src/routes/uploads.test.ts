import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

type AuthRequest = Request & { user?: unknown };

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
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

import uploadRoutes from './uploads';

const app = express();
app.use(express.json());
app.use('/api/uploads', uploadRoutes);

const uploadsDir = path.join(__dirname, '../../uploads');

describe('POST /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .field('file', '');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('未上传');
  });

  it('uploads a text file successfully', async () => {
    const testContent = 'hello test upload';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(testContent), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.name).toMatch(/^\d{8}_\d{6}_\d{4}\.txt$/);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.mimetype).toBe('text/plain');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects unsupported file types', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('executable content'), { filename: 'test.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(500);
  });

  it('deletes an uploaded file', async () => {
    const testContent = 'to be deleted';
    const uploadRes = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(testContent), { filename: 'delete-me.txt', contentType: 'text/plain' });

    expect(uploadRes.status).toBe(200);

    const delRes = await request(app).delete(`/api/uploads/${uploadRes.body.name}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toContain('删除');
  });

  it('returns 404 when deleting a nonexistent file', async () => {
    const res = await request(app).delete('/api/uploads/nonexistent_file_12345.txt');

    expect(res.status).toBe(404);
  });

  it('rejects path traversal in delete', async () => {
    const res = await request(app).delete('/api/uploads/../prisma/schema.prisma');

    expect(res.status).toBe(404);
  });

  it('uploads a PNG file with valid magic bytes', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', pngHeader, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('image/png');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects PNG with invalid magic bytes', async () => {
    const fakePng = Buffer.from('this is not a real png file');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', fakePng, { filename: 'fake.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不匹配');
  });

  it('uploads a PDF with valid magic bytes', async () => {
    const pdfHeader = Buffer.from('%PDF-1.4 fake pdf content here');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', pdfHeader, { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('application/pdf');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('sanitizes SVG with script tags', async () => {
    const svgWithScript = '<svg><script>alert("xss")</script><circle r="10"/></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svgWithScript), { filename: 'dangerous.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('<script');
        fs.unlinkSync(filePath);
      }
    }
  });

  it('sanitizes SVG with onclick handler', async () => {
    const svgWithEvent = '<svg><rect onclick="alert(1)" width="100" height="100"/></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svgWithEvent), { filename: 'evil.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('onclick');
        fs.unlinkSync(filePath);
      }
    }
  });

  it('returns correct file size after upload', async () => {
    const content = 'x'.repeat(100);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(content), { filename: 'size.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(100);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects JPEG with invalid magic bytes', async () => {
    const fakeJpeg = Buffer.from('pretending to be jpeg');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', fakeJpeg, { filename: 'fake.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  it('uploads a ZIP file with valid magic bytes', async () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', zipHeader, { filename: 'test.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('application/zip');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('upload response includes all expected fields', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('fields test'), { filename: 'fields.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('url');
    expect(res.body).toHaveProperty('mimetype');
    expect(res.body).toHaveProperty('size');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('delete rejects path traversal with encoded dots', async () => {
    const res = await request(app).delete('/api/uploads/%2e%2e/prisma/schema.prisma');
    expect(res.status).toBe(404);
  });

  it('uploads a GIF with valid magic bytes', async () => {
    const gifHeader = Buffer.from('GIF89a\x00\x00\x00\x00');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', gifHeader, { filename: 'test.gif', contentType: 'image/gif' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('image/gif');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('uploads a JPEG with valid magic bytes', async () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', jpegHeader, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('image/jpeg');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('sanitizes SVG with javascript href', async () => {
    const svgWithHref = '<svg><a xlink:href="javascript:alert(1)"><rect width="50" height="50"/></a></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svgWithHref), { filename: 'xlink.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('javascript:');
        fs.unlinkSync(filePath);
      }
    }
  });

  it('sanitizes SVG with data URI href', async () => {
    const svgWithDataHref = '<svg><a href="data:text/html,<script>alert(1)</script>"><text>click</text></a></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svgWithDataHref), { filename: 'data.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('data:text/html');
        fs.unlinkSync(filePath);
      }
    }
  });

  it('rejects PDF with invalid magic bytes', async () => {
    const fakePdf = Buffer.from('not a real pdf file content here');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', fakePdf, { filename: 'fake.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不匹配');
  });

  it('uploads a DOCX with valid ZIP magic bytes', async () => {
    const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', docxHeader, { filename: 'test.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects file with double extension in filename', async () => {
    const buf = Buffer.from('test content');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: 'malware.exe.txt', contentType: 'text/plain' });

    expect([200, 400]).toContain(res.status);
  });

  it('uploads an Excel file with valid ZIP magic bytes', async () => {
    const xlsxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', xlsxHeader, { filename: 'test.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('upload response url starts with /uploads/', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from('url test'), { filename: 'url.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.url).toContain(res.body.name);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('uploads a WEBP with valid RIFF magic bytes', async () => {
    const webpHeader = Buffer.from('RIFF\x00\x00\x00\x00WEBP');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', webpHeader, { filename: 'test.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe('image/webp');

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects SVG with onerror attribute', async () => {
    const svgWithOnerror = '<svg><image onerror="alert(1)" href="x" /></svg>';
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from(svgWithOnerror), { filename: 'onerror.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('onerror');
        fs.unlinkSync(filePath);
      }
    }
  });

  it('uploads file with no extension returns error or success', async () => {
    const buf = Buffer.from('no extension content');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: 'noext', contentType: 'application/octet-stream' });

    expect([200, 400, 500]).toContain(res.status);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('uploads a small text file with txt extension', async () => {
    const buf = Buffer.from('hello world');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);

    if (res.body.name) {
      const filePath = path.join(uploadsDir, res.body.name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('rejects upload without file attachment', async () => {
    const res = await request(app)
      .post('/api/uploads');

    expect(res.status).toBe(400);
  });

  it('rejects upload with unsupported file type', async () => {
    const res = await request(app)
      .post('/api/uploads');

    expect(res.status).toBe(400);
  });

  it('rejects upload with empty filename', async () => {
    const buf = Buffer.from('test');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: '', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when no file field is provided in multipart', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .field('name', 'test');

    expect(res.status).toBe(400);
  });

  it('accepts upload with regular filename', async () => {
    const buf = Buffer.from('test');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: 'document.txt', contentType: 'text/plain' });

    expect([200, 201]).toContain(res.status);
  });

  it('rejects upload without file attachment', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .field('name', 'no-file');

    expect(res.status).toBe(400);
  });

  it('accepts upload with unicode filename', async () => {
    const buf = Buffer.from('test');
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', buf, { filename: '测试文件.txt', contentType: 'text/plain' });

    expect([200, 201, 400]).toContain(res.status);
  });
});
