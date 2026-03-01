/**
 * Global teardown: 测试跑完后自动清理所有带时间戳后缀的测试数据。
 *
 * 直接操作 SQLite 数据库，不依赖 API 服务（globalTeardown 运行时 webServer 已关闭）。
 * 匹配规则：名称以 `_` + 13位数字结尾（Date.now() 生成的时间戳）。
 * 清理顺序：projects → templates → products → roles → users。
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.resolve(__dirname, '../server/prisma/dev.db');

/** 在 SQLite 中执行 SQL 并返回输出 */
function sql(query: string): string {
  return execSync(`sqlite3 "${DB_PATH}" "${query}"`, { encoding: 'utf-8' }).trim();
}

async function globalTeardown() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('[teardown] Database not found, skipping cleanup');
    return;
  }

  // 开启外键约束以确保级联删除生效
  const prefix = 'PRAGMA foreign_keys = ON;';
  let totalDeleted = 0;

  // 时间戳后缀匹配：name LIKE '%_1%' 且末尾是 13+ 位数字
  // SQLite 不支持正则，用 GLOB 模式匹配
  const timestampPattern = '*_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';

  // 1. 清理测试项目（级联删除 activities, weekly_reports 等）
  try {
    const count = sql(`${prefix} DELETE FROM projects WHERE name GLOB '${timestampPattern}'; SELECT changes();`);
    const n = parseInt(count) || 0;
    if (n > 0) {
      totalDeleted += n;
      console.log(`[teardown] Deleted ${n} test projects`);
    }
  } catch (e: any) {
    console.log('[teardown] Error cleaning projects:', e.message);
  }

  // 2. 清理测试模板
  try {
    const count = sql(`${prefix} DELETE FROM project_templates WHERE name GLOB '${timestampPattern}'; SELECT changes();`);
    const n = parseInt(count) || 0;
    if (n > 0) {
      totalDeleted += n;
      console.log(`[teardown] Deleted ${n} test templates`);
    }
  } catch (e: any) {
    console.log('[teardown] Error cleaning templates:', e.message);
  }

  // 3. 清理测试产品
  try {
    const count = sql(`${prefix} DELETE FROM products WHERE name GLOB '${timestampPattern}'; SELECT changes();`);
    const n = parseInt(count) || 0;
    if (n > 0) {
      totalDeleted += n;
      console.log(`[teardown] Deleted ${n} test products`);
    }
  } catch (e: any) {
    console.log('[teardown] Error cleaning products:', e.message);
  }

  // 4. 清理测试角色
  try {
    const count = sql(`${prefix} DELETE FROM roles WHERE name GLOB '${timestampPattern}'; SELECT changes();`);
    const n = parseInt(count) || 0;
    if (n > 0) {
      totalDeleted += n;
      console.log(`[teardown] Deleted ${n} test roles`);
    }
  } catch (e: any) {
    console.log('[teardown] Error cleaning roles:', e.message);
  }

  // 5. 清理测试用户（realName 匹配）
  try {
    const count = sql(`${prefix} DELETE FROM users WHERE realName GLOB '${timestampPattern}'; SELECT changes();`);
    const n = parseInt(count) || 0;
    if (n > 0) {
      totalDeleted += n;
      console.log(`[teardown] Deleted ${n} test users`);
    }
  } catch (e: any) {
    console.log('[teardown] Error cleaning users:', e.message);
  }

  if (totalDeleted > 0) {
    console.log(`[teardown] Total cleaned: ${totalDeleted} test records`);
  } else {
    console.log('[teardown] No test data to clean');
  }
}

export default globalTeardown;
