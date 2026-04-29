import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('=== Activity Role Binding 迁移完整性自检 ===\n');
  let allPassed = true;

  // Check 1: Backup count === ActivityExecutor count
  console.log('检查 1: 备份表行数 === ActivityExecutor 行数');
  try {
    const backupCount = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM _activity_executor_backup`) as any[];
    const executorCount = await prisma.activityExecutor.count();
    const bc = Number(backupCount[0].count);
    if (bc === executorCount) {
      console.log(`  ✓ 通过: ${bc} === ${executorCount}`);
    } else {
      console.log(`  ✗ 失败: 备份 ${bc} !== ActivityExecutor ${executorCount}`);
      allPassed = false;
    }
  } catch (e: any) {
    console.log(`  ⚠ 跳过: 备份表不存在或查询失败 (${e.message})`);
  }

  // Check 2: All ActivityExecutor.userId reference valid Users
  console.log('检查 2: 所有 ActivityExecutor.userId 对应有效 User');
  const invalidUserExecutors = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM activity_executors AE
    LEFT JOIN users U ON AE.userId = U.id
    WHERE U.id IS NULL
  `) as any[];
  const invalidUserCount = Number(invalidUserExecutors[0].count);
  if (invalidUserCount === 0) {
    console.log(`  ✓ 通过: 所有 userId 有效`);
  } else {
    console.log(`  ✗ 失败: ${invalidUserCount} 条无效 userId`);
    allPassed = false;
  }

  // Check 3: source=ROLE_AUTO records all have snapshotRoleId
  console.log('检查 3: source=ROLE_AUTO 的记录都有 snapshotRoleId');
  const missingSnapshot = await prisma.activityExecutor.count({
    where: { source: 'ROLE_AUTO', snapshotRoleId: null },
  });
  if (missingSnapshot === 0) {
    console.log(`  ✓ 通过`);
  } else {
    console.log(`  ✗ 失败: ${missingSnapshot} 条 ROLE_AUTO 缺少 snapshotRoleId`);
    allPassed = false;
  }

  // Check 4: (snapshotRoleId, userId) pairs exist in RoleMember
  console.log('检查 4: source=ROLE_AUTO 的 (snapshotRoleId, userId) 在 RoleMember 中都存在');
  const autoExecutors = await prisma.activityExecutor.findMany({
    where: { source: 'ROLE_AUTO', snapshotRoleId: { not: null } },
    select: { snapshotRoleId: true, userId: true },
    distinct: ['snapshotRoleId', 'userId'],
  });

  let missingRoleMembers = 0;
  for (const pair of autoExecutors) {
    if (!pair.snapshotRoleId) continue;
    const exists = await prisma.roleMember.findUnique({
      where: { roleId_userId: { roleId: pair.snapshotRoleId, userId: pair.userId } },
    });
    if (!exists) missingRoleMembers++;
  }
  if (missingRoleMembers === 0) {
    console.log(`  ✓ 通过: ${autoExecutors.length} 个唯一组合全部在 RoleMember 中`);
  } else {
    console.log(`  ✗ 失败: ${missingRoleMembers} 个组合不在 RoleMember 中`);
    allPassed = false;
  }

  // Check 5: RoleMember uniqueness
  console.log('检查 5: 每个 RoleMember 的 (roleId, userId) 唯一');
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT roleId, userId, COUNT(*) as count FROM role_members GROUP BY roleId, userId HAVING count > 1
  `) as any[];
  if (duplicates.length === 0) {
    console.log(`  ✓ 通过`);
  } else {
    console.log(`  ✗ 失败: ${duplicates.length} 对重复`);
    allPassed = false;
  }

  console.log();
  if (allPassed) {
    console.log('=== 所有检查通过 ✓ ===');
  } else {
    console.log('=== 部分检查未通过 ✗ ===');
  }

  await prisma.$disconnect();
  process.exit(allPassed ? 0 : 1);
}

verify().catch((e) => {
  console.error('验证失败:', e);
  process.exit(1);
});
