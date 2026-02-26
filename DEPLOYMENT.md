# Atlas 硬件项目管理平台 - 部署指南

## 生产环境部署

本指南将帮助您将系统从开发环境（SQLite）部署到生产环境（PostgreSQL）。

## 开发 → 生产环境差异

| 项目 | 开发环境 | 生产环境 |
|------|---------|---------|
| 数据库 | SQLite（file:./dev.db） | PostgreSQL 17 |
| Prisma Provider | sqlite | postgresql |
| 进程管理 | tsx watch | PM2 cluster |
| 前端 | Vite dev server | Nginx 静态文件 |
| CORS | localhost:5173 | 生产域名 |

**注意:** 生产部署前需要将 `server/prisma/schema.prisma` 中的 `provider` 从 `"sqlite"` 改为 `"postgresql"`，并更新 `DATABASE_URL`。

## 部署架构

```
┌─────────────────┐
│   Nginx/Caddy   │  (反向代理 + 静态文件服务)
│   Port 80/443   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼────┐ ┌──▼──────┐
│ React  │ │ Express │  (API 服务)
│ Build  │ │ Server  │  (Port 3000)
└────────┘ └────┬────┘
                │
          ┌─────▼─────┐
          │PostgreSQL │  (数据库)
          │  Port     │
          │  5432     │
          └───────────┘
```

## 部署步骤

### 1. 准备服务器环境

推荐配置:
- **操作系统:** Ubuntu 22.04 LTS 或更高版本
- **CPU:** 2核及以上
- **内存:** 4GB 及以上
- **存储:** 20GB 及以上

安装必要软件:

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PostgreSQL 17
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-17

# 安装 Nginx
sudo apt install -y nginx

# 安装 PM2 (进程管理器)
sudo npm install -g pm2
```

### 2. 配置数据库

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 在 psql 中执行以下命令:
CREATE DATABASE hwsystem;
CREATE USER hwsystem_user WITH ENCRYPTED PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE hwsystem TO hwsystem_user;
\q
```

### 3. 克隆和配置项目

```bash
# 创建应用目录
sudo mkdir -p /var/www/hwsystem
sudo chown -R $USER:$USER /var/www/hwsystem
cd /var/www/hwsystem

# 克隆代码(或上传代码)
# git clone <your-repo-url> .

# 安装依赖
npm install

# 配置生产环境变量
cd server
cat > .env << EOF
DATABASE_URL="postgresql://hwsystem_user:your_strong_password@localhost:5432/hwsystem"
JWT_SECRET="$(openssl rand -base64 32)"
JWT_REFRESH_SECRET="$(openssl rand -base64 32)"
PORT=3000
NODE_ENV=production
AI_API_KEY=""
AI_API_URL=""
CORS_ORIGINS="https://your-domain.com"
WECOM_CORP_ID=""
WECOM_AGENT_ID=""
WECOM_SECRET=""
WECOM_REDIRECT_URI="https://your-domain.com/login"
EOF

# 将 Prisma provider 改为 postgresql
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# 初始化数据库
npx prisma generate
npx prisma migrate deploy
npx tsx src/prisma/seed.ts

# 编译 TypeScript
npm run build

cd ..
```

### 4. 构建前端

```bash
cd client
npm run build
cd ..
```

构建后的文件在 `client/dist` 目录。

### 5. 配置 PM2

创建 PM2 配置文件:

```bash
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'hwsystem-api',
      cwd: './server',
      script: './dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
EOF
```

启动应用:

```bash
# 创建日志目录
mkdir -p server/logs

# 启动应用
pm2 start ecosystem.config.js

# 设置开机自启
pm2 save
pm2 startup
```

### 6. 配置 Nginx

创建 Nginx 配置文件:

```bash
sudo nano /etc/nginx/sites-available/hwsystem
```

添加以下配置:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为您的域名

    # 静态文件
    root /var/www/hwsystem/client/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 上传文件服务
    location /uploads {
        alias /var/www/hwsystem/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 日志
    access_log /var/log/nginx/hwsystem-access.log;
    error_log /var/log/nginx/hwsystem-error.log;
}
```

启用站点:

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/hwsystem /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 7. 配置 SSL (可选但推荐)

使用 Let's Encrypt 免费证书:

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com
```

Certbot 会自动修改 Nginx 配置以启用 HTTPS。

### 8. 配置防火墙

```bash
# 允许 HTTP 和 HTTPS
sudo ufw allow 'Nginx Full'

# 允许 SSH(如果未开启)
sudo ufw allow OpenSSH

# 启用防火墙
sudo ufw enable

# 检查状态
sudo ufw status
```

## 安全加固

### 1. 修改默认账号

首次部署后,立即登录系统修改默认账号密码:
- admin / admin123 → 修改为强密码

或直接在数据库中修改:

```bash
cd server
npx tsx << EOF
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.update({
    where: { username: 'admin' },
    data: { password: await bcrypt.hash('your_new_password', 10) }
  });
  console.log('Password updated');
}

main().finally(() => prisma.$disconnect());
EOF
```

### 2. 定期备份数据库

创建备份脚本:

```bash
sudo nano /usr/local/bin/backup-hwsystem.sh
```

添加以下内容:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/hwsystem"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# 备份数据库
sudo -u postgres pg_dump hwsystem | gzip > $BACKUP_DIR/hwsystem_$DATE.sql.gz

# 删除30天前的备份
find $BACKUP_DIR -name "hwsystem_*.sql.gz" -mtime +30 -delete

echo "Backup completed: hwsystem_$DATE.sql.gz"
```

设置权限并添加定时任务:

```bash
sudo chmod +x /usr/local/bin/backup-hwsystem.sh

# 添加到 crontab(每天凌晨2点执行)
sudo crontab -e
# 添加以下行:
0 2 * * * /usr/local/bin/backup-hwsystem.sh
```

### 3. 监控和日志

```bash
# 查看应用日志
pm2 logs hwsystem-api

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/hwsystem-access.log
sudo tail -f /var/log/nginx/hwsystem-error.log

# 监控应用状态
pm2 monit
```

## 更新部署

更新应用时:

```bash
cd /var/www/hwsystem

# 拉取最新代码
# git pull

# 更新依赖
npm install

# 后端更新
cd server
npm run build
npx prisma migrate deploy  # 如有数据库变更
cd ..

# 前端更新
cd client
npm run build
cd ..

# 重启应用
pm2 restart hwsystem-api

# 重载 Nginx
sudo nginx -t && sudo systemctl reload nginx
```

## 性能优化

### 1. PostgreSQL 优化

编辑 PostgreSQL 配置:

```bash
sudo nano /etc/postgresql/17/main/postgresql.conf
```

建议修改(根据服务器配置调整):

```conf
# 连接数
max_connections = 100

# 内存配置(假设4GB内存)
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 10MB

# 日志
log_min_duration_statement = 1000  # 记录超过1秒的查询
```

重启 PostgreSQL:

```bash
sudo systemctl restart postgresql
```

### 2. Node.js 优化

在 `ecosystem.config.js` 中增加:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3000,
  NODE_OPTIONS: '--max-old-space-size=2048'  # 根据实际内存调整
}
```

## Docker 部署（可选）

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: hwsystem
      POSTGRES_USER: hwsystem
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://hwsystem:${DB_PASSWORD}@postgres:5432/hwsystem
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./client/dist:/usr/share/nginx/html
    depends_on:
      - api

volumes:
  postgres_data:
```

## 故障排查

### 应用无法启动

```bash
# 检查 PM2 日志
pm2 logs hwsystem-api --lines 100

# 检查端口占用
sudo netstat -tlnp | grep 3000

# 检查数据库连接
cd server && npx prisma db push
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql

# 检查连接
sudo -u postgres psql -c "\l"

# 查看日志
sudo tail -f /var/log/postgresql/postgresql-17-main.log
```

## 支持

遇到问题?
- 查看日志文件
- 检查环境变量配置
- 确认服务运行状态
- 查阅 GitHub Issues

祝部署顺利!
