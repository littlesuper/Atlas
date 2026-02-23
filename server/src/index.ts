import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { PrismaClient } from '@prisma/client';
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

// 请求日志
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('short'));
}

// 登录接口限流：每 IP 每 15 分钟最多 20 次
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '登录尝试过于频繁，请15分钟后重试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 解析JSON请求体（限制 10MB）
app.use(express.json({ limit: '10mb' }));

// 解析URL编码的请求体（限制 10MB）
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务 - /uploads目录
const uploadsPath = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ==================== 路由注册 ====================

// 健康检查接口
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
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

// ==================== 错误处理中间件 ====================

// 404处理
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==================== 启动服务器 ====================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

// ==================== 优雅关闭 ====================

const shutdown = async (signal: string) => {
  console.log(`\n收到 ${signal} 信号，正在关闭服务器...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('数据库连接已关闭');
    process.exit(0);
  });
  // 10 秒超时强制退出
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
