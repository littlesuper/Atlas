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
import holidaysRoutes from './routes/holidays';
import roleMembersRoutes from './routes/roleMembers';
import featureFlagsRoutes from './routes/featureFlags';
import { evaluateMetricAlerts } from './utils/alertRules';
import { startScheduledJobs } from './utils/scheduler';
import { refreshHolidayCache } from './utils/workday';
import { logger } from './utils/logger';
import { requestId } from './middleware/requestId';
import { httpLogger } from './middleware/httpLogger';
import { captureServerError, flushMonitoring, initMonitoring } from './utils/monitoring';
import { businessMetrics, snapshotBusinessMetrics } from './utils/businessMetrics';
import { formatPrometheusMetrics } from './utils/prometheusMetrics';
import {
  createRequestMetrics,
  isMetricsRequestAuthorized,
  recordRequestMetric,
  snapshotRequestMetrics,
} from './utils/requestMetrics';
import { setupSwagger } from './swagger';

// ==================== 安全校验 ====================

initMonitoring();

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
const requestMetrics = createRequestMetrics({
  slowRequestThresholdMs: Number(process.env.SLOW_REQUEST_THRESHOLD_MS ?? 1000),
});

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
app.use((req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    recordRequestMetric(requestMetrics, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});
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
app.get('/api/health', async (req: Request, res: Response) => {
  const databaseStartedAt = Date.now();
  const checks = {
    database: {
      status: 'ok' as 'ok' | 'error',
      latencyMs: 0,
    },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database.latencyMs = Date.now() - databaseStartedAt;

    res.json({
      status: 'ok',
      version: getVersion(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: req.id,
      checks,
    });
  } catch (error) {
    checks.database.status = 'error';
    checks.database.latencyMs = Date.now() - databaseStartedAt;
    captureServerError(error, {
      requestId: req.id,
      tags: { source: 'healthcheck', dependency: 'database' },
      req,
    });
    logger.error({ err: error, requestId: req.id }, '健康检查数据库探测失败');

    res.status(503).json({
      status: 'degraded',
      version: getVersion(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: req.id,
      checks,
    });
  }
});

app.get('/api/metrics', (req: Request, res: Response) => {
  if (!isMetricsRequestAuthorized(req.headers, process.env.NODE_ENV, process.env.METRICS_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized', requestId: req.id });
    return;
  }

  const requests = snapshotRequestMetrics(requestMetrics);
  const business = snapshotBusinessMetrics(businessMetrics);
  const metricsPayload = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    requestId: req.id,
    process: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    requests,
    business,
    alerts: evaluateMetricAlerts({ requests }),
  };

  if (req.query.format === 'prometheus') {
    res
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(formatPrometheusMetrics(metricsPayload));
    return;
  }

  res.json(metricsPayload);
});

app.use('/api/feature-flags', featureFlagsRoutes);

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

// 节假日路由
app.use('/api/holidays', holidaysRoutes);

// 角色成员管理路由
app.use('/api/role-members', roleMembersRoutes);

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
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  captureServerError(err, {
    requestId: req.id,
    tags: {
      source: 'express',
      statusCode: 500,
    },
    req,
  });
  logger.error({ err, requestId: req.id }, '服务器错误');
  res.status(500).json({
    error: '服务器内部错误',
    requestId: req.id,
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

  // 加载节假日缓存（用于工作日计算）
  refreshHolidayCache().catch((err) => {
    logger.warn({ err }, '节假日缓存加载失败，将使用内置兜底数据');
  });
});

// ==================== 优雅关闭 ====================

const shutdown = async (signal: string) => {
  logger.info(`收到 ${signal} 信号，正在关闭服务器...`);
  server.close(async () => {
    await flushMonitoring();
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
