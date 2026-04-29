// NOTE: This migration has been completed. The `_ActivityAssignees` table
// and the `assignees` relation no longer exist in the Prisma schema.
// This file is kept for historical reference only.
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

interface MigrationReport {
  migrationTime: string;
  totalActivities: number;
  activitiesWithAssignees: number;
  successSingleRole: number;
  successMultiRole: number;
  contactNoRole: number;
  noRoleUser: number;
  totalExecutorsCreated: number;
  totalRoleMembersCreated: number;
  needsManualReview: number;
  reviewItems: Array<{ activityId: string; activityName: string; reason: string }>;
}

async function migrate() {
  const report: MigrationReport = {
    migrationTime: new Date().toISOString(),
    totalActivities: 0,
    activitiesWithAssignees: 0,
    successSingleRole: 0,
    successMultiRole: 0,
    contactNoRole: 0,
    noRoleUser: 0,
    totalExecutorsCreated: 0,
    totalRoleMembersCreated: 0,
    needsManualReview: 0,
    reviewItems: [],
  };

  console.log('=== Activity Role Binding 迁移开始 ===\n');

  // Step 1: Backup
  console.log('Step 1: 创建备份表...');
  try {
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS _activity_executor_backup;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE _activity_executor_backup AS
      SELECT A.id AS activityId, U.id AS userId, U.realName, A.createdAt
      FROM activities A
      INNER JOIN _ActivityAssignees AA ON A.id = AB.A
      INNER JOIN users U ON AA.B = U.id;
    `);
  } catch {
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS _activity_executor_backup;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE _activity_executor_backup (
        activityId TEXT,
        userId TEXT,
        realName TEXT,
        createdAt TEXT
      );
    `);
    const links = await prisma.$queryRawUnsafe(`
      SELECT A.id as activityId, U.id as userId, U.realName, A.createdAt
      FROM _ActivityAssignees AA
      INNER JOIN activities A ON A.id = AA.A
      INNER JOIN users U ON U.id = AA.B
    `) as any[];
    for (const link of links) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO _activity_executor_backup (activityId, userId, realName, createdAt) VALUES (?, ?, ?, ?)`,
        link.activityId, link.userId, link.realName, link.createdAt
      );
    }
    const backupCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM _activity_executor_backup`) as any[];
    console.log(`  备份完成: ${backupCount[0].count} 条记录\n`);
  }

  // Step 2: Get all activities with their assignees
  console.log('Step 2: 获取所有活动和当前负责人...');
  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      assignees: {
        select: {
          id: true,
          realName: true,
          canLogin: true,
          userRoles: {
            include: { role: true },
          },
        },
      },
    },
  });

  report.totalActivities = activities.length;
  console.log(`  总活动数: ${activities.length}\n`);

  // Step 3: For each activity, infer roleId and create ActivityExecutor records
  console.log('Step 3: 为每条活动推断角色并创建执行人记录...');
  for (const activity of activities) {
    if (activity.assignees.length === 0) continue;

    report.activitiesWithAssignees++;

    // Collect all role IDs from all assignees to determine the "primary" role for this activity
    const allRoleIds = new Map<string, number>();
    for (const assignee of activity.assignees) {
      for (const ur of assignee.userRoles) {
        const count = allRoleIds.get(ur.role.id) || 0;
        allRoleIds.set(ur.role.id, count + 1);
      }
    }

    // The activity's role is the most common role among assignees
    let activityRoleId: string | null = null;
    let maxCount = 0;
    for (const [roleId, count] of allRoleIds.entries()) {
      if (count > maxCount) {
        maxCount = count;
        activityRoleId = roleId;
      }
    }

    // Update activity with roleId
    if (activityRoleId) {
      await prisma.activity.update({
        where: { id: activity.id },
        data: { roleId: activityRoleId },
      });
    }

    // Create ActivityExecutor records for each assignee
    for (const assignee of activity.assignees) {
      let source: 'ROLE_AUTO' | 'MANUAL_ADD' = 'MANUAL_ADD';
      let snapshotRoleId: string | null = null;

      if (!assignee.canLogin) {
        source = 'MANUAL_ADD';
        report.contactNoRole++;
      } else if (assignee.userRoles.length === 0) {
        source = 'MANUAL_ADD';
        report.noRoleUser++;
      } else {
        const hasActivityRole = assignee.userRoles.some(ur => ur.role.id === activityRoleId);
        if (hasActivityRole && activityRoleId) {
          source = 'ROLE_AUTO';
          snapshotRoleId = activityRoleId;
          report.successSingleRole++;
        } else if (assignee.userRoles.length === 1) {
          snapshotRoleId = assignee.userRoles[0].role.id;
          source = 'ROLE_AUTO';
          report.successSingleRole++;
        } else {
          const nonAdminRole = assignee.userRoles.find(ur => ur.role.name !== '系统管理员');
          snapshotRoleId = nonAdminRole ? nonAdminRole.role.id : assignee.userRoles[0].role.id;
          source = 'ROLE_AUTO';
          report.successMultiRole++;
        }
      }

      try {
        await prisma.activityExecutor.create({
          data: {
            activityId: activity.id,
            userId: assignee.id,
            source,
            snapshotRoleId,
            assignedAt: activity.createdAt,
          },
        });
        report.totalExecutorsCreated++;
      } catch (e: any) {
        if (!e.message?.includes('Unique constraint')) {
          report.needsManualReview++;
          report.reviewItems.push({
            activityId: activity.id,
            activityName: activity.name,
            reason: `创建执行人失败: ${e.message}`,
          });
        }
      }
    }
  }

  console.log(`  新建 ActivityExecutor: ${report.totalExecutorsCreated}`);
  console.log(`  - 单角色用户映射: ${report.successSingleRole}`);
  console.log(`  - 多角色用户映射: ${report.successMultiRole}`);
  console.log(`  - 联系人(无角色): ${report.contactNoRole}`);
  console.log(`  - 无角色用户: ${report.noRoleUser}\n`);

  // Step 4: Build RoleMember from migrated data
  console.log('Step 4: 反向构建 RoleMember 全局映射...');
  const pairs = await prisma.activityExecutor.findMany({
    where: { source: 'ROLE_AUTO', snapshotRoleId: { not: null } },
    select: { snapshotRoleId: true, userId: true },
    distinct: ['snapshotRoleId', 'userId'],
  });

  const sortOrder = 0;
  const roleMemberMap = new Map<string, Set<string>>();
  for (const pair of pairs) {
    if (!pair.snapshotRoleId) continue;
    if (!roleMemberMap.has(pair.snapshotRoleId)) {
      roleMemberMap.set(pair.snapshotRoleId, new Set());
    }
    roleMemberMap.get(pair.snapshotRoleId)!.add(pair.userId);
  }

  for (const [roleId, userIds] of roleMemberMap.entries()) {
    let idx = 0;
    for (const userId of userIds) {
      try {
        await prisma.roleMember.create({
          data: {
            roleId,
            userId,
            isActive: true,
            sortOrder: idx++,
          },
        });
        report.totalRoleMembersCreated++;
      } catch {
        await prisma.roleMember.updateMany({
          where: { roleId, userId },
          data: { isActive: true },
        });
      }
    }
  }

  console.log(`  新建 RoleMember: ${report.totalRoleMembersCreated}\n`);

  // Step 5: Output report
  console.log('=== 迁移报告 ===');
  console.log(`迁移时间: ${report.migrationTime}`);
  console.log(`总活动数: ${report.totalActivities}`);
  console.log(`有负责人的活动数: ${report.activitiesWithAssignees}`);
  console.log(`  ├─ 成功映射到单一角色: ${report.successSingleRole}`);
  console.log(`  ├─ 多角色用户(取首个非管理员): ${report.successMultiRole}`);
  console.log(`  ├─ 联系人(无角色): ${report.contactNoRole}`);
  console.log(`  └─ 无角色用户: ${report.noRoleUser}`);
  console.log();
  console.log(`新建 ActivityExecutor 记录: ${report.totalExecutorsCreated}`);
  console.log(`新建 RoleMember 记录: ${report.totalRoleMembersCreated}`);
  console.log();
  if (report.needsManualReview > 0) {
    console.log(`需要人工后续处理的活动: ${report.needsManualReview} 条`);
    console.log(`（详见 _migration_review.csv）`);
  } else {
    console.log('无需要人工处理的活动');
  }

  // Write CSV
  if (report.reviewItems.length > 0) {
    const csvPath = join(__dirname, '..', 'logs', '_migration_review.csv');
    mkdirSync(dirname(csvPath), { recursive: true });
    writeFileSync(csvPath, 'activityId,activityName,reason\n' +
      report.reviewItems.map(r => `${r.activityId},"${r.activityName}","${r.reason}"`).join('\n'));
    console.log(`\n审核 CSV 已写入: ${csvPath}`);
  }

  // Write log
  const logPath = join(__dirname, '..', 'logs', `migration-${Date.now()}.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, JSON.stringify(report, null, 2));
  console.log(`迁移日志已写入: ${logPath}`);

  await prisma.$disconnect();
  console.log('\n=== 迁移完成 ===');
}

migrate().catch((e) => {
  console.error('迁移失败:', e);
  process.exit(1);
});
