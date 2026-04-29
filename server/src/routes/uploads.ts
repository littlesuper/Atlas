import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

// 确保uploads目录存在
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // 生成时间戳文件名：yyyyMMdd_HHmmss_随机数.扩展名
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const ext = path.extname(file.originalname);
    cb(null, `${ts}_${rand}${ext}`);
  },
});

// 文件类型验证
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    // 图片
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // PDF
    'application/pdf',
    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Excel
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // ZIP
    'application/zip',
    'application/x-zip-compressed',
    // TXT
    'text/plain',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'));
  }
};

// 配置multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * POST /api/uploads
 * 上传文件
 */
// 文件头 magic bytes 校验（防止 MIME 欺骗）
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'image/webp': [Buffer.from('RIFF')], // RIFF....WEBP
  'application/pdf': [Buffer.from('%PDF')],
  'application/zip': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  'application/x-zip-compressed': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  // Office 2007+ (docx/xlsx) 也是 ZIP 格式
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  // 老版 Office (doc/xls) 是 OLE2
  'application/msword': [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  'application/vnd.ms-excel': [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
};

function validateFileContent(filePath: string, mimetype: string): boolean {
  const expectedSignatures = MAGIC_BYTES[mimetype];
  if (!expectedSignatures) return true; // text/plain, svg 等无固定头的类型直接放行

  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(8);
  fs.readSync(fd, header, 0, 8, 0);
  fs.closeSync(fd);

  return expectedSignatures.some(sig => header.subarray(0, sig.length).equals(sig));
}

const DANGEROUS_SVG_TAGS = new Set([
  'script', 'iframe', 'embed', 'object', 'applet', 'form',
  'input', 'textarea', 'select', 'button', 'link', 'meta',
  'base', 'style', 'noscript', 'template',
]);

const DANGEROUS_ATTR_PATTERN = /\bon\w+\s*=/i;
const DANGEROUS_HREF_PATTERN = /^\s*(javascript|data|vbscript)\s*:/i;

function sanitizeSvg(filePath: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  if (!/<svg[\s>]/i.test(content)) {
    return false;
  }

  let sanitized = content;
  let modified = false;

  for (const tag of DANGEROUS_SVG_TAGS) {
    const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>|<${tag}[\\s\\/]*>`, 'gi');
    const before = sanitized;
    sanitized = sanitized.replace(regex, '');
    if (sanitized !== before) modified = true;
  }

  let prev = sanitized;
  sanitized = sanitized.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    '',
  );
  if (sanitized !== prev) modified = true;

  prev = sanitized;
  sanitized = sanitized.replace(
    /\s+(?:xlink:)?href\s*=\s*("(?:javascript|data|vbscript)[^"]*"|'(?:javascript|data|vbscript)[^']*'|(?:javascript|data|vbscript)[^\s>]+)/gi,
    '',
  );
  if (sanitized !== prev) modified = true;

  if (modified) {
    fs.writeFileSync(filePath, sanitized, 'utf-8');
  }

  return true;
}

router.post('/', authenticate, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '未上传文件' });
      return;
    }

    // 验证文件内容是否与声明的 MIME 类型一致
    if (!validateFileContent(req.file.path, req.file.mimetype)) {
      // 删除可疑文件
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: '文件内容与类型不匹配，已拒绝' });
      return;
    }

    // SVG 文件消毒：移除 script/iframe 等危险标签和事件属性
    if (req.file.mimetype === 'image/svg+xml') {
      if (!sanitizeSvg(req.file.path)) {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ error: 'SVG 文件内容无效' });
        return;
      }
    }

    // 返回文件信息（name 使用时间戳文件名）
    res.json({
      name: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    logger.error({ err: error }, '文件上传错误');
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: '文件大小超过10MB限制' });
        return;
      }
    }
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/uploads/:filename
 * 删除文件
 */
router.delete('/:filename', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;

    // 安全处理文件名，防止路径遍历攻击
    const safeFilename = path.basename(filename);
    const filePath = path.join(uploadsDir, safeFilename);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }

    // 删除文件
    fs.unlinkSync(filePath);

    res.json({ message: '文件已删除' });
  } catch (error) {
    logger.error({ err: error }, '删除文件错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
