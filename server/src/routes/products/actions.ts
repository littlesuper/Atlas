import express, { Request, Response } from 'express';
import { ProductStatus, ProjectStatus, type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permission';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { logProductChange } from './shared';

const router = express.Router();

router.get('/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const keyword = req.query.keyword as string | undefined;
    const projectStatus = req.query.projectStatus as string | undefined;

    const where: Prisma.ProductWhereInput = {};

    if (status) where.status = status as ProductStatus;
    if (category) where.category = category;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }
    if (projectStatus) {
      where.project = { status: projectStatus as ProjectStatus };
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    const BOM = '\uFEFF';
    const headers = ['名称', '型号', '版本', '类别', '状态', '项目', '描述', '规格', '性能', '创建时间'];
    const rows = products.map((p) => [
      p.name,
      p.model || '',
      p.revision || '',
      p.category || '',
      p.status,
      p.project?.name || '',
      (p.description || '').replace(/[\r\n]+/g, ' '),
      p.specifications ? JSON.stringify(p.specifications) : '',
      p.performance ? JSON.stringify(p.performance) : '',
      p.createdAt.toISOString().slice(0, 10),
    ]);

    const csvContent = BOM + [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\r\n');

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=products_${today}.csv`);
    res.send(csvContent);
  } catch (error) {
    logger.error({ err: error }, '导出产品错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id/changelog', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;

    const logs = await prisma.productChangeLog.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(logs);
  } catch (error) {
    logger.error({ err: error }, '获取变更记录错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/:id/copy',
  authenticate,
  requirePermission('product', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      const { revision } = req.body;

      if (!revision) {
        res.status(400).json({ error: '新版本号不能为空' });
        return;
      }

      const source = await prisma.product.findUnique({ where: { id } });
      if (!source) {
        res.status(404).json({ error: '源产品不存在' });
        return;
      }

      if (source.model) {
        const existing = await prisma.product.findFirst({
          where: { model: source.model, revision },
        });
        if (existing) {
          res.status(409).json({ error: `型号 ${source.model} ${revision} 已存在` });
          return;
        }
      }

      const newProduct = await prisma.product.create({
        data: {
          name: source.name,
          model: source.model,
          revision,
          category: source.category,
          description: source.description,
          status: 'DEVELOPING',
          specifications: source.specifications || undefined,
          performance: source.performance || undefined,
          projectId: source.projectId,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              productLine: true,
            },
          },
        },
      });

      const user = req.user;
      await logProductChange(newProduct.id, user?.id || '', user?.realName || user?.username || '', 'COPY', {
        sourceId: { from: null, to: id },
        sourceRevision: { from: null, to: source.revision },
      });

      res.status(201).json(newProduct);
    } catch (error) {
      logger.error({ err: error }, '复制产品错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
