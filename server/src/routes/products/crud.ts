import express, { Request, Response } from 'express';
import { ProductStatus, ProjectStatus, type Prisma } from '../../generated/prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermission, sanitizePagination } from '../../middleware/permission';
import {
  isValidProductStatus,
  isValidProductCategory,
  isValidProductStatusTransition,
} from '../../utils/validation';
import { logger } from '../../utils/logger';
import prisma from '../../db';
import { logProductChange, diffObjects } from './shared';

const router = express.Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = (req.query.page as string) || '1';
    const pageSize = (req.query.pageSize as string) || '20';
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const keyword = req.query.keyword as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const projectStatus = req.query.projectStatus as string | undefined;
    const specKeyword = req.query.specKeyword as string | undefined;

    const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: Prisma.ProductWhereInput = {};

    if (status) {
      where.status = status as ProductStatus;
    }

    if (category) {
      where.category = category;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (projectStatus) {
      where.project = { status: projectStatus as ProjectStatus };
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const statsWhere: Prisma.ProductWhereInput = {};
    if (category) statsWhere.category = category;
    if (projectId) statsWhere.projectId = projectId;
    if (projectStatus) statsWhere.project = { status: projectStatus as ProjectStatus };
    if (keyword) {
      statsWhere.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const [all, developing, production, discontinued, products, total] = await Promise.all([
      prisma.product.count({ where: statsWhere }),
      prisma.product.count({ where: { ...statsWhere, status: 'DEVELOPING' } }),
      prisma.product.count({ where: { ...statsWhere, status: 'PRODUCTION' } }),
      prisma.product.count({ where: { ...statsWhere, status: 'DISCONTINUED' } }),
      prisma.product.findMany({
        where,
        skip,
        take: pageSizeNum,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              productLine: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    let filteredProducts = products;
    if (specKeyword) {
      const kw = specKeyword.toLowerCase();
      filteredProducts = products.filter((p) => {
        const specs = p.specifications as Record<string, unknown> | null;
        if (!specs) return false;
        return Object.entries(specs).some(
          ([k, v]) => k.toLowerCase().includes(kw) || String(v).toLowerCase().includes(kw)
        );
      });
    }

    res.json({
      data: filteredProducts,
      total: specKeyword ? filteredProducts.length : total,
      page: pageNum,
      pageSize: pageSizeNum,
      stats: {
        all,
        developing,
        production,
        discontinued,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '获取产品列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;

    const product = await prisma.product.findUnique({
      where: { id },
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

    if (!product) {
      res.status(404).json({ error: '产品不存在' });
      return;
    }

    res.json(product);
  } catch (error) {
    logger.error({ err: error }, '获取产品详情错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/',
  authenticate,
  requirePermission('product', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        model,
        revision,
        category,
        description,
        status,
        specifications,
        performance,
        images,
        documents,
        projectId,
      } = req.body;

      if (projectId) {
        const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
        if (proj?.status === 'ARCHIVED') {
          res.status(403).json({ error: '归档项目不可修改' });
          return;
        }
      }

      if (!name) {
        res.status(400).json({ error: '产品名称不能为空' });
        return;
      }

      if (status && !isValidProductStatus(status)) {
        res.status(400).json({ error: `无效的产品状态: ${status}` });
        return;
      }

      if (category && !isValidProductCategory(category)) {
        res.status(400).json({ error: `无效的产品类别: ${category}` });
        return;
      }

      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          res.status(400).json({ error: '关联项目不存在' });
          return;
        }
      }

      if (model) {
        const existing = await prisma.product.findFirst({
          where: { model, revision: revision || null },
        });
        if (existing) {
          res.status(409).json({ error: `型号 ${model}${revision ? ' ' + revision : ''} 已存在` });
          return;
        }
      }

      const product = await prisma.product.create({
        data: {
          name,
          model: model || null,
          revision: revision || null,
          category: category || null,
          description: description || null,
          status: status || 'DEVELOPING',
          specifications: specifications || null,
          performance: performance || null,
          images: images || null,
          documents: documents || null,
          projectId: projectId || null,
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
      await logProductChange(product.id, user?.id || '', user?.realName || user?.username || '', 'CREATE');

      res.status(201).json(product);
    } catch (error) {
      logger.error({ err: error }, '创建产品错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('product', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      const {
        name,
        model,
        revision,
        category,
        description,
        status,
        specifications,
        performance,
        images,
        documents,
        projectId,
      } = req.body;

      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        res.status(404).json({ error: '产品不存在' });
        return;
      }

      const effectiveProjectId = projectId !== undefined ? projectId : existingProduct.projectId;
      if (effectiveProjectId) {
        const proj = await prisma.project.findUnique({ where: { id: effectiveProjectId }, select: { status: true } });
        if (proj?.status === 'ARCHIVED') {
          res.status(403).json({ error: '归档项目不可修改' });
          return;
        }
      }

      if (status && !isValidProductStatus(status)) {
        res.status(400).json({ error: `无效的产品状态: ${status}` });
        return;
      }

      if (category && !isValidProductCategory(category)) {
        res.status(400).json({ error: `无效的产品类别: ${category}` });
        return;
      }

      if (status && status !== existingProduct.status) {
        if (!isValidProductStatusTransition(existingProduct.status, status)) {
          res.status(400).json({
            error: `不允许从 ${existingProduct.status} 变更为 ${status}，状态流转：DEVELOPING → PRODUCTION → DISCONTINUED`,
          });
          return;
        }
      }

      if (projectId !== undefined) {
        if (projectId) {
          const project = await prisma.project.findUnique({
            where: { id: projectId },
          });

          if (!project) {
            res.status(400).json({ error: '关联项目不存在' });
            return;
          }
        }
      }

      const newModel = model !== undefined ? model : existingProduct.model;
      const newRevision = revision !== undefined ? (revision || null) : existingProduct.revision;
      if (newModel && (model !== undefined || revision !== undefined)) {
        const existing = await prisma.product.findFirst({
          where: {
            model: newModel,
            revision: newRevision,
            id: { not: id },
          },
        });
        if (existing) {
          res.status(409).json({ error: `型号 ${newModel}${newRevision ? ' ' + newRevision : ''} 已存在` });
          return;
        }
      }

      const updateData: Prisma.ProductUncheckedUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (model !== undefined) updateData.model = model || null;
      if (revision !== undefined) updateData.revision = revision || null;
      if (category !== undefined) updateData.category = category || null;
      if (description !== undefined) updateData.description = description || null;
      if (status !== undefined) updateData.status = status;
      if (specifications !== undefined) updateData.specifications = specifications;
      if (performance !== undefined) updateData.performance = performance;
      if (images !== undefined) updateData.images = images;
      if (documents !== undefined) updateData.documents = documents;
      if (projectId !== undefined) updateData.projectId = projectId || null;

      const changes = diffObjects(
        existingProduct as unknown as Record<string, unknown>,
        updateData,
        ['name', 'model', 'revision', 'category', 'description', 'status', 'projectId'],
      );

      const product = await prisma.product.update({
        where: { id },
        data: updateData,
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
      await logProductChange(id, user?.id || '', user?.realName || user?.username || '', 'UPDATE', changes);

      res.json(product);
    } catch (error) {
      logger.error({ err: error }, '更新产品错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('product', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;

      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        res.status(404).json({ error: '产品不存在' });
        return;
      }

      const user = req.user;
      await logProductChange(null, user?.id || '', user?.realName || user?.username || '', 'DELETE', {
        productName: { from: existingProduct.name, to: null },
        productModel: { from: existingProduct.model, to: null },
      });

      await prisma.product.delete({
        where: { id },
      });

      const { cleanupFiles } = await import('./shared');
      cleanupFiles(existingProduct.images);
      cleanupFiles(existingProduct.documents);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除产品错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
