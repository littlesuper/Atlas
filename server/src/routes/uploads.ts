import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';

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
router.post('/', authenticate, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '未上传文件' });
      return;
    }

    // 返回文件信息（name 使用时间戳文件名）
    res.json({
      name: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('文件上传错误:', error);
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
    console.error('删除文件错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
