import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { auditLog, diffFields } from '../utils/auditLog';
import { invalidateWecomConfigCache } from '../utils/wecom';

const router = express.Router();
const prisma = new PrismaClient();

function maskSecret(secret: string): string {
  if (!secret) return '';
  return '****' + secret.slice(-4);
}

/**
 * GET /api/wecom-config
 * 返回当前企微配置（secret 掩码）
 * 权限: system:ai
 */
router.get(
  '/',
  authenticate,
  requirePermission('system', 'ai'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await prisma.wecomConfig.findFirst();
      if (!config) {
        res.json({});
        return;
      }
      res.json({ ...config, secret: maskSecret(config.secret) });
    } catch (error) {
      console.error('获取企微配置错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/wecom-config
 * 创建或更新企微配置
 * 权限: system:ai
 */
router.put(
  '/',
  authenticate,
  requirePermission('system', 'ai'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { corpId, agentId, secret, redirectUri } = req.body;

      const existing = await prisma.wecomConfig.findFirst();

      const data: Record<string, string> = {};
      if (corpId !== undefined) data.corpId = corpId;
      if (agentId !== undefined) data.agentId = agentId;
      if (redirectUri !== undefined) data.redirectUri = redirectUri;
      if (secret !== undefined && !secret.startsWith('****')) {
        data.secret = secret;
      }

      let config;
      if (existing) {
        config = await prisma.wecomConfig.update({
          where: { id: existing.id },
          data,
        });

        const changes = diffFields(
          existing as unknown as Record<string, unknown>,
          config as unknown as Record<string, unknown>,
          ['corpId', 'agentId', 'redirectUri'],
        );
        // Add secret change indicator without exposing values
        if (secret !== undefined && !secret.startsWith('****') && secret !== existing.secret) {
          (changes || {} as Record<string, { from: unknown; to: unknown }>)['secret'] = { from: '***', to: '***（已更新）' };
        }

        auditLog({
          req,
          action: 'UPDATE',
          resourceType: 'wecom_config',
          resourceId: config.id,
          resourceName: '企微配置',
          changes,
        });
      } else {
        config = await prisma.wecomConfig.create({
          data: {
            corpId: corpId || '',
            agentId: agentId || '',
            secret: (secret && !secret.startsWith('****')) ? secret : '',
            redirectUri: redirectUri || '',
          },
        });

        auditLog({
          req,
          action: 'CREATE',
          resourceType: 'wecom_config',
          resourceId: config.id,
          resourceName: '企微配置',
        });
      }

      invalidateWecomConfigCache();
      res.json({ ...config, secret: maskSecret(config.secret) });
    } catch (error) {
      console.error('更新企微配置错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
