import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = express.Router();
const prisma = new PrismaClient();

function maskApiKey(key: string): string {
  return key ? '****' + key.slice(-4) : '';
}

/**
 * 从其他配置中移除指定功能的绑定（确保一个功能只绑定一个配置）
 */
async function removeFeatureAssignments(featuresToAssign: string[], excludeConfigId?: string) {
  const allConfigs = await prisma.aiConfig.findMany();
  for (const config of allConfigs) {
    if (excludeConfigId && config.id === excludeConfigId) continue;
    const currentFeatures = config.features.split(',').map((f) => f.trim()).filter(Boolean);
    const remaining = currentFeatures.filter((f) => !featuresToAssign.includes(f));
    if (remaining.length !== currentFeatures.length) {
      await prisma.aiConfig.update({
        where: { id: config.id },
        data: { features: remaining.join(',') },
      });
    }
  }
}

/**
 * GET /api/ai-config
 * 获取所有 AI 配置列表（apiKey 脱敏）
 * 首次加载时自动修复旧数据（name/features 为空的单条记录）
 * 权限: user:read
 */
router.get(
  '/',
  authenticate,
  requirePermission('user', 'read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      let configs = await prisma.aiConfig.findMany({ orderBy: { updatedAt: 'desc' } });

      // 向后兼容：旧单条配置 name/features 为空时自动修复
      if (configs.length === 1 && !configs[0].name && !configs[0].features) {
        await prisma.aiConfig.update({
          where: { id: configs[0].id },
          data: { name: '默认配置', features: 'risk,weekly_report' },
        });
        configs = await prisma.aiConfig.findMany({ orderBy: { updatedAt: 'desc' } });
      }

      res.json(configs.map((c) => ({ ...c, apiKey: maskApiKey(c.apiKey) })));
    } catch (error) {
      console.error('获取AI配置列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/ai-config/test-connection
 * 验证 AI API 连接是否可用（最小请求，不记录用量）
 * 权限: user:update
 */
router.post(
  '/test-connection',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    const { apiUrl, apiKey, modelName, configId } = req.body;

    // 如果 apiKey 是掩码或为空，且提供了 configId，则从数据库读取真实 key
    let realApiKey = apiKey;
    if ((!apiKey || apiKey.startsWith('****')) && configId) {
      const existing = await prisma.aiConfig.findUnique({ where: { id: configId } });
      if (existing) {
        realApiKey = existing.apiKey;
      }
    }

    if (!apiUrl || !realApiKey) {
      res.status(400).json({ success: false, message: '请填写 API URL 和 API Key' });
      return;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${realApiKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const body = await response.text();
        res.json({ success: false, message: `API 返回 ${response.status}: ${body.slice(0, 200)}` });
        return;
      }

      res.json({ success: true, message: '连接成功' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败';
      res.json({ success: false, message });
    }
  }
);

/**
 * POST /api/ai-config
 * 创建新配置
 * 权限: user:update
 */
router.post(
  '/',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, apiKey, apiUrl, modelName, features } = req.body;

      if (!name) {
        res.status(400).json({ error: '配置名称不能为空' });
        return;
      }

      // 从其他配置中移除待绑定的功能
      if (features) {
        const featureList = features.split(',').map((f: string) => f.trim()).filter(Boolean);
        await removeFeatureAssignments(featureList);
      }

      const config = await prisma.aiConfig.create({
        data: {
          name,
          apiKey: apiKey || '',
          apiUrl: apiUrl || '',
          modelName: modelName || 'gpt-4o-mini',
          features: features || '',
        },
      });

      res.status(201).json({ ...config, apiKey: maskApiKey(config.apiKey) });
    } catch (error) {
      console.error('创建AI配置错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/ai-config/:id
 * 更新配置
 * 权限: user:update
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, apiKey, apiUrl, modelName, features } = req.body;

      const existing = await prisma.aiConfig.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: '配置不存在' });
        return;
      }

      const data: Record<string, string> = {};
      if (name !== undefined) data.name = name;
      if (apiUrl !== undefined) data.apiUrl = apiUrl;
      if (modelName !== undefined) data.modelName = modelName;
      if (apiKey !== undefined && !apiKey.startsWith('****')) {
        data.apiKey = apiKey;
      }
      if (features !== undefined) {
        const featureList = features.split(',').map((f: string) => f.trim()).filter(Boolean);
        await removeFeatureAssignments(featureList, id);
        data.features = features;
      }

      const config = await prisma.aiConfig.update({ where: { id }, data });

      res.json({ ...config, apiKey: maskApiKey(config.apiKey) });
    } catch (error) {
      console.error('更新AI配置错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/ai-config/:id
 * 删除配置
 * 权限: user:update
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('user', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.aiConfig.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: '配置不存在' });
        return;
      }
      await prisma.aiConfig.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error('删除AI配置错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * GET /api/ai-config/usage-stats
 * 获取 token 使用统计
 * 权限: user:read
 */
router.get(
  '/usage-stats',
  authenticate,
  requirePermission('user', 'read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;

      const where: Record<string, unknown> = {};
      if (startDate || endDate) {
        const createdAt: Record<string, Date> = {};
        if (startDate) createdAt.gte = new Date(startDate as string);
        if (endDate) createdAt.lte = new Date(endDate as string);
        where.createdAt = createdAt;
      }

      // 汇总统计
      const totals = await prisma.aiUsageLog.aggregate({
        where,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
        _count: true,
      });

      // 按日分组（JS 端聚合，避免 SQLite raw query 兼容问题）
      const allLogs = await prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const dailyMap = new Map<
        string,
        { date: string; feature: string; callCount: number; promptTokens: number; completionTokens: number; totalTokens: number }
      >();
      for (const log of allLogs) {
        const dateKey = log.createdAt.toISOString().split('T')[0];
        const key = `${dateKey}-${log.feature}`;
        if (!dailyMap.has(key)) {
          dailyMap.set(key, { date: dateKey, feature: log.feature, callCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
        }
        const entry = dailyMap.get(key)!;
        entry.callCount++;
        entry.promptTokens += log.promptTokens;
        entry.completionTokens += log.completionTokens;
        entry.totalTokens += log.totalTokens;
      }
      const dailyStats = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

      // 最近 50 条明细
      const recentLogs = await prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          project: { select: { id: true, name: true } },
        },
      });

      res.json({
        totals: {
          callCount: totals._count,
          promptTokens: totals._sum.promptTokens || 0,
          completionTokens: totals._sum.completionTokens || 0,
          totalTokens: totals._sum.totalTokens || 0,
        },
        dailyStats,
        recentLogs,
      });
    } catch (error) {
      console.error('获取AI使用统计错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
