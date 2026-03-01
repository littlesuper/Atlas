import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, sanitizePagination } from '../middleware/permission';
import {
  isValidProductStatus,
  isValidProductCategory,
  isValidProductStatusTransition,
} from '../utils/validation';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

// 上传目录
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// 清理文件列表中的上传文件（静默处理失败）
function cleanupFiles(files: Array<{ url?: string; name?: string }> | null | undefined) {
  if (!Array.isArray(files)) return;
  for (const file of files) {
    const url = file.url || '';
    const filename = path.basename(url);
    if (!filename) continue;
    try {
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 静默处理
    }
  }
}

// 记录产品变更日志
async function logProductChange(
  productId: string | null,
  userId: string,
  userName: string,
  action: string,
  changes?: Record<string, { from: unknown; to: unknown }> | null,
) {
  try {
    await prisma.productChangeLog.create({
      data: {
        productId,
        userId,
        userName,
        action,
        changes: changes ? (changes as any) : undefined,
      },
    });
  } catch {
    // 日志记录失败不影响主流程
  }
}

// 计算对象差异
function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[],
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (newVal !== undefined && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * GET /api/products/export
 * CSV 导出（必须在 /:id 之前注册）
 */
router.get('/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const keyword = req.query.keyword as string | undefined;
    const projectStatus = req.query.projectStatus as string | undefined;

    const where: any = {};

    if (status) where.status = status;
    if (category) where.category = category;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }
    if (projectStatus) {
      where.project = { status: projectStatus };
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    // 构建 CSV
    const BOM = '\uFEFF';
    const headers = ['名称', '型号', '版本', '类别', '状态', '项目', '描述', '规格', '性能', '创建时间'];
    const rows = products.map((p) => [
      p.name,
      p.model || '',
      p.revision || '',
      p.category || '',
      p.status,
      (p.project as any)?.name || '',
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
    console.error('导出产品错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/products
 * 获取产品列表（分页、状态筛选、类别筛选、关键词搜索、项目筛选、统计）
 */
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

    // 构建筛选条件
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (projectStatus) {
      where.project = { status: projectStatus };
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    // 统计条件（不受 status 筛选影响）
    const statsWhere: any = {};
    if (category) statsWhere.category = category;
    if (projectId) statsWhere.projectId = projectId;
    if (projectStatus) statsWhere.project = { status: projectStatus };
    if (keyword) {
      statsWhere.OR = [
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    // 并行查询统计 + 列表 + 总数
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

    // specKeyword 后过滤（SQLite 不支持 JSON 内搜索）
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
    console.error('获取产品列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/products/:id
 * 获取单个产品
 */
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

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
    console.error('获取产品详情错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/products/:id/changelog
 * 获取产品变更记录（最近 50 条）
 */
router.get('/:id/changelog', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const logs = await prisma.productChangeLog.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(logs);
  } catch (error) {
    console.error('获取变更记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/products
 * 创建产品
 * 权限：product:create
 */
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

      // 归档项目检查
      if (projectId) {
        const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
        if (proj?.status === 'ARCHIVED') {
          res.status(403).json({ error: '归档项目不可修改' });
          return;
        }
      }

      // 验证必填字段
      if (!name) {
        res.status(400).json({ error: '产品名称不能为空' });
        return;
      }

      // 校验状态枚举
      if (status && !isValidProductStatus(status)) {
        res.status(400).json({ error: `无效的产品状态: ${status}` });
        return;
      }

      // 校验类别枚举
      if (category && !isValidProductCategory(category)) {
        res.status(400).json({ error: `无效的产品类别: ${category}` });
        return;
      }

      // 验证项目是否存在
      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          res.status(400).json({ error: '关联项目不存在' });
          return;
        }
      }

      // 检查 model+revision 唯一性
      if (model) {
        const existing = await prisma.product.findFirst({
          where: { model, revision: revision || null },
        });
        if (existing) {
          res.status(409).json({ error: `型号 ${model}${revision ? ' ' + revision : ''} 已存在` });
          return;
        }
      }

      // 创建产品
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

      // 记录变更日志
      const user = (req as any).user;
      await logProductChange(product.id, user?.id || '', user?.realName || user?.username || '', 'CREATE');

      res.status(201).json(product);
    } catch (error) {
      console.error('创建产品错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/products/:id/copy
 * 复制产品版本
 * 权限：product:create
 */
router.post(
  '/:id/copy',
  authenticate,
  requirePermission('product', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { revision } = req.body;

      if (!revision) {
        res.status(400).json({ error: '新版本号不能为空' });
        return;
      }

      // 获取源产品
      const source = await prisma.product.findUnique({ where: { id } });
      if (!source) {
        res.status(404).json({ error: '源产品不存在' });
        return;
      }

      // 检查 model+revision 唯一性
      if (source.model) {
        const existing = await prisma.product.findFirst({
          where: { model: source.model, revision },
        });
        if (existing) {
          res.status(409).json({ error: `型号 ${source.model} ${revision} 已存在` });
          return;
        }
      }

      // 复制产品（不复制 images/documents）
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

      // 记录变更日志
      const user = (req as any).user;
      await logProductChange(newProduct.id, user?.id || '', user?.realName || user?.username || '', 'COPY', {
        sourceId: { from: null, to: id },
        sourceRevision: { from: null, to: source.revision },
      });

      res.status(201).json(newProduct);
    } catch (error) {
      console.error('复制产品错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/products/:id
 * 更新产品
 * 权限：product:update
 */
router.put(
  '/:id',
  authenticate,
  requirePermission('product', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
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

      // 检查产品是否存在
      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        res.status(404).json({ error: '产品不存在' });
        return;
      }

      // 归档项目检查
      const effectiveProjectId = projectId !== undefined ? projectId : existingProduct.projectId;
      if (effectiveProjectId) {
        const proj = await prisma.project.findUnique({ where: { id: effectiveProjectId }, select: { status: true } });
        if (proj?.status === 'ARCHIVED') {
          res.status(403).json({ error: '归档项目不可修改' });
          return;
        }
      }

      // 校验状态枚举
      if (status && !isValidProductStatus(status)) {
        res.status(400).json({ error: `无效的产品状态: ${status}` });
        return;
      }

      // 校验类别枚举
      if (category && !isValidProductCategory(category)) {
        res.status(400).json({ error: `无效的产品类别: ${category}` });
        return;
      }

      // 状态流转校验
      if (status && status !== existingProduct.status) {
        if (!isValidProductStatusTransition(existingProduct.status, status)) {
          res.status(400).json({
            error: `不允许从 ${existingProduct.status} 变更为 ${status}，状态流转：DEVELOPING → PRODUCTION → DISCONTINUED`,
          });
          return;
        }
      }

      // 验证项目是否存在
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

      // 检查 model+revision 唯一性（排除自身）
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

      // 构建更新数据
      const updateData: any = {};
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

      // 计算差异
      const changes = diffObjects(
        existingProduct as unknown as Record<string, unknown>,
        updateData,
        ['name', 'model', 'revision', 'category', 'description', 'status', 'projectId'],
      );

      // 更新产品
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

      // 记录变更日志
      const user = (req as any).user;
      await logProductChange(id, user?.id || '', user?.realName || user?.username || '', 'UPDATE', changes);

      res.json(product);
    } catch (error) {
      console.error('更新产品错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/products/:id
 * 删除产品
 * 权限：product:delete
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('product', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      // 检查产品是否存在
      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        res.status(404).json({ error: '产品不存在' });
        return;
      }

      // 记录变更日志（在删除前记录）
      const user = (req as any).user;
      await logProductChange(null, user?.id || '', user?.realName || user?.username || '', 'DELETE', {
        productName: { from: existingProduct.name, to: null },
        productModel: { from: existingProduct.model, to: null },
      });

      // 先删除数据库记录，再异步清理文件（文件清理失败不影响业务逻辑）
      await prisma.product.delete({
        where: { id },
      });

      // 异步清理图片和文档文件
      cleanupFiles(existingProduct.images as any);
      cleanupFiles(existingProduct.documents as any);

      res.json({ success: true });
    } catch (error) {
      console.error('删除产品错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
