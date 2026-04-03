import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
// morgan replaced by pino-based httpLogger
import path from 'path';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const pkgPath = path.join(__dirname, '..', '..', 'package.json');
const getVersion = () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
};
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import rolesRoutes from './routes/roles';
import projectsRoutes from './routes/projects';
import activitiesRoutes from './routes/activities';
import productsRoutes from './routes/products';
import riskRoutes from './routes/risk';
import weeklyReportsRoutes from './routes/weeklyReports';
import uploadsRoutes from './routes/uploads';
import aiConfigRoutes from './routes/aiConfig';
import auditLogsRoutes from './routes/auditLogs';
import wecomConfigRoutes from './routes/wecomConfig';
import activityCommentsRoutes from './routes/activityComments';
import notificationsRoutes from './routes/notifications';
import templatesRoutes from './routes/templates';
import riskItemsRoutes from './routes/riskItems';
import checkItemsRoutes from './routes/checkItems';
import { startScheduledJobs } from './utils/scheduler';
import { logger } from './utils/logger';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
import { setupSwagger } from './swagger';

// ==================== 安全校验 ====================

const DEFAULT_JWT_SECRETS = ['hw-system-jwt-secret', 'hw-system-refresh-secret'];

if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET || '';
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || '';

  if (!jwtSecret || !jwtRefreshSecret) {
    logger.fatal('生产环境必须设置 JWT_SECRET 和 JWT_REFRESH_SECRET 环境变量');
    process.exit(1);
  }

  if (DEFAULT_JWT_SECRETS.includes(jwtSecret) || DEFAULT_JWT_SECRETS.includes(jwtRefreshSecret)) {
    logger.fatal('生产环境禁止使用默认 JWT 密钥，请设置安全的随机密钥');
    process.exit(1);
  }

  if (!process.env.CORS_ORIGINS) {
    logger.fatal('生产环境必须设置 CORS_ORIGINS 环境变量（逗号分隔的允许域名）');
    process.exit(1);
  }
}

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT) || 3000;

// ==================== 中间件配置 ====================

// 信任一层反向代理（Vite dev proxy / Nginx），使 req.ip 和 x-forwarded-for 正确
// 使用具体跳数而非 true，避免 express-rate-limit 的 ERR_ERL_PERMISSIVE_TRUST_PROXY
app.set('trust proxy', 1);

// 安全响应头
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS配置
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// 请求 ID + 结构化日志
app.use(requestId);
if (process.env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// 登录接口限流：每 IP 每 15 分钟最多 N 次（开发环境放宽以支持 E2E 测试）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  message: { error: '登录尝试过于频繁，请15分钟后重试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 解析JSON请求体（限制 10MB）
app.use(express.json({ limit: '10mb' }));

// 解析URL编码的请求体（限制 10MB）
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API 文档（仅非生产环境）
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// 静态文件服务 - /uploads目录
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ==================== 路由注册 ====================

// 健康检查接口
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: getVersion(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 认证路由（登录接口限流）
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/wecom/login', loginLimiter);
app.use('/api/auth', authRoutes);

// 用户管理路由
app.use('/api/users', usersRoutes);

// 角色管理路由
app.use('/api/roles', rolesRoutes);

// 项目管理路由
app.use('/api/projects', projectsRoutes);

// 活动管理路由
app.use('/api/activities', activitiesRoutes);

// 产品管理路由
app.use('/api/products', productsRoutes);

// 风险评估路由
app.use('/api/risk', riskRoutes);

// 项目周报路由
app.use('/api/weekly-reports', weeklyReportsRoutes);

// 文件上传路由
app.use('/api/uploads', uploadsRoutes);

// AI配置路由
app.use('/api/ai-config', aiConfigRoutes);

// 审计日志路由
app.use('/api/audit-logs', auditLogsRoutes);

// 企微配置路由
app.use('/api/wecom-config', wecomConfigRoutes);

// 活动评论路由
app.use('/api/activity-comments', activityCommentsRoutes);

// 通知路由
app.use('/api/notifications', notificationsRoutes);

// 项目模板路由
app.use('/api/templates', templatesRoutes);

// 风险项路由
app.use('/api/risk-items', riskItemsRoutes);

// 检查项路由
app.use('/api/check-items', checkItemsRoutes);

// ==================== 前端静态文件（生产环境） ====================

if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDistPath));

  // SPA fallback：非 /api 且非 /uploads 的请求返回 index.html
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ==================== 错误处理中间件 ====================

// 404处理（仅捕获未匹配的 /api 路由）
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, requestId: req.id }, '服务器错误');
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==================== 启动服务器 ====================

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, `服务器运行在端口 ${PORT}`);
  logger.info(`健康检查: http://localhost:${PORT}/api/health`);

  // Start scheduled jobs (only in non-test environment)
  if (process.env.NODE_ENV !== 'test') {
    startScheduledJobs();
  }
});

// ==================== 优雅关闭 ====================

const shutdown = async (signal: string) => {
  logger.info(`收到 ${signal} 信号，正在关闭服务器...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('数据库连接已关闭');
    process.exit(0);
  });
  // 10 秒超时强制退出
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
