import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';

export interface IntegrationTestContext {
  app: Express;
  prisma: PrismaClient;
  dbDir: string;
  databaseUrl: string;
  seed: {
    adminUser: { id: string; username: string | null; realName: string };
    project: { id: string; name: string };
  };
}

export interface IntegrationDatabaseContext {
  prisma: PrismaClient;
  dbDir: string;
  databaseUrl: string;
}

interface SetupIntegrationDatabaseOptions {
  updateProcessEnv?: boolean;
}

export async function setupIntegrationTest(): Promise<IntegrationTestContext> {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'atlas-integration-jwt-secret'; // pragma: allowlist secret
  process.env.JWT_REFRESH_SECRET = 'atlas-integration-refresh-secret'; // pragma: allowlist secret

  const database = await setupIntegrationDatabase({ updateProcessEnv: true });
  const { prisma } = database;
  const seed = await seedAuthProjectFlow(prisma);

  vi.resetModules();
  const { createApp } = await import('../../../index');

  return {
    app: createApp(),
    prisma,
    dbDir: database.dbDir,
    databaseUrl: database.databaseUrl,
    seed,
  };
}

export async function cleanupIntegrationTest(context?: IntegrationTestContext): Promise<void> {
  await cleanupIntegrationDatabase(context);
}

export async function setupIntegrationDatabase(
  options: SetupIntegrationDatabaseOptions = {}
): Promise<IntegrationDatabaseContext> {
  const dbDir = mkdtempSync(join(tmpdir(), 'atlas-integration-'));
  const databaseUrl = `file:${join(dbDir, 'test.db')}`;

  process.env.NODE_ENV = 'test';
  if (options.updateProcessEnv) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await applySchema(prisma, databaseUrl);

  return { prisma, dbDir, databaseUrl };
}

export async function cleanupIntegrationDatabase(context?: IntegrationDatabaseContext): Promise<void> {
  if (!context) {
    return;
  }

  await context.prisma.$disconnect();
  rmSync(context.dbDir, { recursive: true, force: true });
}

async function applySchema(prisma: PrismaClient, databaseUrl: string): Promise<void> {
  const sql = execFileSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const ddl = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  for (const statement of ddl
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedAuthProjectFlow(prisma: PrismaClient): Promise<IntegrationTestContext['seed']> {
  const allPermission = await prisma.permission.create({
    data: { resource: '*', action: '*' },
  });
  const adminRole = await prisma.role.create({
    data: { name: '系统管理员', description: 'integration admin role' },
  });
  await prisma.rolePermission.create({
    data: { roleId: adminRole.id, permissionId: allPermission.id },
  });

  const adminUser = await prisma.user.create({
    data: {
      username: 'integration-admin',
      password: await bcrypt.hash('admin123', 10),
      realName: 'Integration Admin',
      canLogin: true,
      status: 'ACTIVE',
    },
    select: { id: true, username: true, realName: true },
  });
  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: adminRole.id },
  });

  const project = await prisma.project.create({
    data: {
      name: 'Integration Project',
      description: 'Created by the Week 5 integration test scaffold',
      productLine: 'Router',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      managerId: adminUser.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    },
    select: { id: true, name: true },
  });

  return { adminUser, project };
}
