import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupIntegrationDatabase,
  type IntegrationDatabaseContext,
  setupIntegrationDatabase,
} from './helpers/testApp';

describe('integration: database schema and transactions', () => {
  let context: IntegrationDatabaseContext;

  beforeAll(async () => {
    context = await setupIntegrationDatabase();
  }, 30_000);

  afterAll(async () => {
    await cleanupIntegrationDatabase(context);
  });

  it('builds a fresh database from the Prisma schema DDL', async () => {
    const tables = await context.prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );

    const expectedTables = [
      'activities',
      'activity_comments',
      'activity_executors',
      'ai_configs',
      'ai_usage_logs',
      'audit_logs',
      'check_items',
      'holidays',
      'notifications',
      'permissions',
      'product_change_logs',
      'products',
      'project_archives',
      'project_members',
      'project_templates',
      'projects',
      'risk_assessments',
      'risk_item_logs',
      'risk_items',
      'role_members',
      'role_permissions',
      'roles',
      'template_activities',
      'user_roles',
      'users',
      'weekly_reports',
      'wecom_configs',
    ].sort();

    expect(tables.map((table) => table.name)).toEqual(expectedTables);

    const userColumns =
      await context.prisma.$queryRawUnsafe<{ name: string; notnull: number }[]>("PRAGMA table_info('users')");
    const columnNames = userColumns.map((column) => column.name);

    expect(columnNames).toContain('canLogin');
    expect(columnNames).toContain('wecomUserId');
    expect(columnNames).not.toContain('email');
    expect(columnNames).not.toContain('phone');
  });

  it('keeps high-volume lookup indexes available and used by SQLite', async () => {
    const indexes = await context.prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'index'"
    );
    const indexNames = indexes.map((index) => index.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'projects_managerId_idx',
        'role_members_roleId_isActive_sortOrder_idx',
        'weekly_reports_projectId_year_weekNumber_key',
      ])
    );

    const role = await context.prisma.role.create({
      data: { name: 'Integration DB Role' },
    });
    const users = await context.prisma.user.createManyAndReturn({
      data: Array.from({ length: 40 }, (_, index) => ({
        username: `db-user-${index}`,
        realName: `DB User ${index}`,
      })),
      select: { id: true },
    });
    await context.prisma.roleMember.createMany({
      data: users.map((user, index) => ({
        roleId: role.id,
        userId: user.id,
        isActive: index % 2 === 0,
        sortOrder: index,
      })),
    });

    const plan = await context.prisma.$queryRawUnsafe<{ detail: string }[]>(
      'EXPLAIN QUERY PLAN SELECT * FROM role_members WHERE roleId = ? AND isActive = 1 ORDER BY sortOrder ASC',
      role.id
    );

    expect(plan.map((row) => row.detail).join('\n')).toContain('role_members_roleId_isActive_sortOrder_idx');
  });

  it('rolls back all writes when a transaction fails', async () => {
    await expect(
      context.prisma.$transaction(async (tx) => {
        const permission = await tx.permission.create({
          data: { resource: 'db-test', action: 'rollback' },
        });
        const role = await tx.role.create({
          data: { name: 'Rollback Test Role' },
        });
        await tx.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });

        throw new Error('force rollback');
      })
    ).rejects.toThrow('force rollback');

    await expect(context.prisma.role.findUnique({ where: { name: 'Rollback Test Role' } })).resolves.toBeNull();
    await expect(
      context.prisma.permission.findUnique({
        where: { resource_action: { resource: 'db-test', action: 'rollback' } },
      })
    ).resolves.toBeNull();
  });
});
