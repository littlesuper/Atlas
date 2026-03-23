import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Atlas API',
      version: '1.0.0',
      description: 'Atlas 项目管理平台 API 文档',
    },
    servers: [
      { url: '/api', description: '开发服务器' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: '错误消息' },
            details: { type: 'array', items: { type: 'string' }, description: '详细错误信息' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: {} },
            total: { type: 'integer' },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string', nullable: true },
            realName: { type: 'string' },
            canLogin: { type: 'boolean' },
            status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
            roles: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            progress: { type: 'number', minimum: 0, maximum: 100 },
            productLine: { type: 'string', nullable: true },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'string' },
            assigneeId: { type: 'string', nullable: true },
            planStartDate: { type: 'string', format: 'date-time', nullable: true },
            planEndDate: { type: 'string', format: 'date-time', nullable: true },
            progress: { type: 'number' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        CheckItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            checked: { type: 'boolean' },
            sortOrder: { type: 'integer' },
            activityId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: '认证', description: '用户登录、令牌刷新、密码修改' },
      { name: '用户管理', description: '用户 CRUD' },
      { name: '角色管理', description: '角色和权限管理' },
      { name: '项目管理', description: '项目 CRUD、归档、快照' },
      { name: '活动管理', description: '项目活动 CRUD、依赖、导入导出' },
      { name: '产品管理', description: '产品信息管理' },
      { name: '风险评估', description: '风险评估和仪表盘' },
      { name: '周报', description: '项目周报管理' },
      { name: '模板', description: '项目模板管理' },
      { name: '检查项', description: '活动检查项管理' },
      { name: '通知', description: '系统通知' },
      { name: '文件上传', description: '文件上传管理' },
      { name: '审计日志', description: '操作审计记录' },
      { name: 'AI配置', description: 'AI 功能配置' },
      { name: '企微配置', description: '企业微信配置' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Atlas API 文档',
  }));

  // JSON format spec
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
