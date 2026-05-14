import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, invalidateUserCache } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { blacklistToken } from '../../utils/tokenBlacklist';
import prisma from '../../db';

const router = express.Router();

router.put('/profile', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { realName } = req.body;
    const data: Record<string, string | null> = {};

    if (realName !== undefined) {
      if (!realName || !realName.trim()) {
        res.status(400).json({ error: '姓名不能为空' });
        return;
      }
      data.realName = realName.trim();
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: '没有需要更新的字段' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, username: true, realName: true },
    });

    res.json(updatedUser);
  } catch (error) {
    logger.error({ err: error }, '更新个人信息错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: '当前密码和新密码不能为空' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: '新密码长度不能少于6位' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true },
    });

    if (!user || !user.password) {
      res.status(404).json({ error: '用户不存在或不支持密码登录' });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      res.status(400).json({ error: '当前密码不正确' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    invalidateUserCache(req.user.id);
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      blacklistToken(authHeader.substring(7));
    }

    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    logger.error({ err: error }, '修改密码错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });

    res.json(user?.preferences || {});
  } catch (error) {
    logger.error({ err: error }, '获取偏好设置错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.put('/preferences', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未认证' });
      return;
    }

    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
      res.status(400).json({ error: '偏好设置格式不正确' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });

    const existing = (user?.preferences as Record<string, unknown>) || {};
    const merged = { ...existing, ...preferences };

    await prisma.user.update({
      where: { id: req.user.id },
      data: { preferences: merged },
    });

    res.json(merged);
  } catch (error) {
    logger.error({ err: error }, '更新偏好设置错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
