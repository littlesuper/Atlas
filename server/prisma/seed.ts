import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库种子数据...');

  // 1. 创建权限
  console.log('创建权限...');
  const resources = ['project', 'activity', 'product', 'weekly_report', 'user', 'role'];
  const actions = ['create', 'read', 'update', 'delete'];

  const permissions = [];

  // 创建精确权限 (5 资源 × 4 操作 = 20)
  for (const resource of resources) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: {
          resource_action: {
            resource,
            action,
          },
        },
        update: {},
        create: {
          resource,
          action,
        },
      });
      permissions.push(permission);
    }
  }

  // 创建全通配权限
  const allPermission = await prisma.permission.upsert({
    where: {
      resource_action: {
        resource: '*',
        action: '*',
      },
    },
    update: {},
    create: {
      resource: '*',
      action: '*',
    },
  });
  permissions.push(allPermission);

  console.log(`已创建 ${permissions.length} 个权限`);

  // 2. 创建角色
  console.log('创建角色...');

  // 系统管理员角色
  const adminRole = await prisma.role.upsert({
    where: { name: '系统管理员' },
    update: {},
    create: {
      name: '系统管理员',
      description: '拥有所有权限',
    },
  });

  // 为系统管理员分配全通配权限
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: adminRole.id,
        permissionId: allPermission.id,
      },
    },
    update: {},
    create: {
      roleId: adminRole.id,
      permissionId: allPermission.id,
    },
  });

  // 项目经理角色
  const projectManagerRole = await prisma.role.upsert({
    where: { name: '项目经理' },
    update: {},
    create: {
      name: '项目经理',
      description: '管理项目和活动',
    },
  });

  // 为项目经理分配权限: project:*, activity:*, weekly_report:*
  const projectManagerPermissions = permissions.filter(
    (p) =>
      (p.resource === 'project' || p.resource === 'activity' || p.resource === 'weekly_report') ||
      (p.resource === 'product' && p.action === 'read') ||
      (p.resource === 'user' && p.action === 'read') ||
      (p.resource === 'role' && p.action === 'read')
  );

  for (const perm of projectManagerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: projectManagerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: projectManagerRole.id,
        permissionId: perm.id,
      },
    });
  }

  // 产品经理角色
  const productManagerRole = await prisma.role.upsert({
    where: { name: '产品经理' },
    update: {},
    create: {
      name: '产品经理',
      description: '管理产品,查看项目',
    },
  });

  // 为产品经理分配权限: product:*, project:read
  const productManagerPermissions = permissions.filter(
    (p) =>
      p.resource === 'product' ||
      (p.resource === 'project' && p.action === 'read') ||
      (p.resource === 'activity' && p.action === 'read') ||
      (p.resource === 'user' && p.action === 'read') ||
      (p.resource === 'role' && p.action === 'read')
  );

  for (const perm of productManagerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: productManagerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: productManagerRole.id,
        permissionId: perm.id,
      },
    });
  }

  // 只读成员角色
  const readOnlyRole = await prisma.role.upsert({
    where: { name: '只读成员' },
    update: {},
    create: {
      name: '只读成员',
      description: '只读查看',
    },
  });

  // 为只读成员分配权限: *:read
  const readOnlyPermissions = permissions.filter((p) => p.action === 'read');

  for (const perm of readOnlyPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: readOnlyRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: readOnlyRole.id,
        permissionId: perm.id,
      },
    });
  }

  console.log('已创建 4 个角色');

  // 3. 创建用户
  console.log('创建用户...');

  // 系统管理员用户
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      realName: '系统管理员',
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  // 项目经理用户
  const zhangsanUser = await prisma.user.upsert({
    where: { username: 'zhangsan' },
    update: {},
    create: {
      username: 'zhangsan',
      email: 'zhangsan@hwsystem.com',
      password: await bcrypt.hash('123456', 10),
      realName: '张三',
      phone: '13800138001',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: zhangsanUser.id,
        roleId: projectManagerRole.id,
      },
    },
    update: {},
    create: {
      userId: zhangsanUser.id,
      roleId: projectManagerRole.id,
    },
  });

  // 产品经理用户
  const lisiUser = await prisma.user.upsert({
    where: { username: 'lisi' },
    update: {},
    create: {
      username: 'lisi',
      email: 'lisi@hwsystem.com',
      password: await bcrypt.hash('123456', 10),
      realName: '李四',
      phone: '13800138002',
      status: 'ACTIVE',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: lisiUser.id,
        roleId: productManagerRole.id,
      },
    },
    update: {},
    create: {
      userId: lisiUser.id,
      roleId: productManagerRole.id,
    },
  });

  console.log('已创建 3 个用户');

  // 4. 创建示例项目
  console.log('创建示例项目...');

  const sampleProject = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: '智能传感器模组 V2.0',
      description: '新一代智能传感器模组开发项目',
      productLine: 'DANDELION',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-06-30'),
      progress: 35,
      managerId: zhangsanUser.id,
    },
  });

  console.log('已创建示例项目');

  // 5. 创建示例活动（先清除旧数据再创建，避免重复）
  console.log('创建示例活动...');

  await prisma.activity.deleteMany({ where: { projectId: sampleProject.id } });

  const activity1 = await prisma.activity.create({
    data: {
      projectId: sampleProject.id,
      name: '需求分析阶段',
      description: '完成市场需求调研和技术可行性分析',
      type: 'PHASE',
      phase: 'EVT',
      status: 'COMPLETED',
      priority: 'HIGH',
      planStartDate: new Date('2026-01-15'),
      planEndDate: new Date('2026-02-15'),
      planDuration: 23,
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-02-15'),
      duration: 23,
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 1,
    },
  });

  await prisma.activity.create({
    data: {
      projectId: sampleProject.id,
      name: '原理图设计',
      description: '完成整体原理图设计',
      type: 'TASK',
      phase: 'EVT',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      planStartDate: new Date('2026-02-16'),
      planEndDate: new Date('2026-03-15'),
      planDuration: 20,
      startDate: new Date('2026-02-16'),
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 2,
      dependencies: [{ id: activity1.id, type: '0' }],
    },
  });

  console.log('已创建示例活动');

  // 6. 创建示例产品
  console.log('创建示例产品...');

  await prisma.product.deleteMany({});
  await prisma.product.create({
    data: {
      name: '智能传感器模组',
      model: 'SNS-T2000',
      revision: 'V2.1',
      category: 'ROUTER',
      description: '三合一智能传感器模组,支持温度、湿度、气压检测',
      status: 'DEVELOPING',
      specifications: {
        '工作电压': '3.3V',
        '工作温度': '-40°C ~ 85°C',
        '接口类型': 'I2C / SPI',
        '封装尺寸': '5mm x 5mm x 1.5mm',
        '温度精度': '±0.1°C',
        '湿度精度': '±2%RH',
        '气压范围': '300~1100 hPa',
      },
      performance: {
        '功耗(典型)': '3.6μA',
        '采样速率': '最高200Hz',
        '响应时间': '<1s',
        'MTBF': '>100,000小时',
      },
      projectId: sampleProject.id,
    },
  });

  console.log('已创建示例产品');

  // ─────────────────────────────────────────────────
  // 项目二：无线网关 GW-X500
  // ─────────────────────────────────────────────────
  console.log('创建项目二：无线网关 GW-X500...');

  const project2 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: '无线网关 GW-X500',
      description: '面向工业场景的高可靠无线网关，支持 4G/WiFi/以太网三路并发，主打蒲公英产品线',
      productLine: 'DANDELION',
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      startDate: new Date('2025-10-01'),
      endDate: new Date('2026-08-31'),
      progress: 55,
      managerId: zhangsanUser.id,
    },
  });

  await prisma.activity.deleteMany({ where: { projectId: project2.id } });

  type AStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  type APriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type AType = 'TASK' | 'MILESTONE' | 'PHASE';

  interface ActivityDef {
    name: string; type: AType; phase: string;
    status: AStatus; priority: APriority;
    planStart: string; planEnd: string; planDur: number;
    start?: string; end?: string; dur?: number;
    assignee: 'z' | 'l'; notes?: string;
  }

  const z = zhangsanUser.id;
  const l = lisiUser.id;

  const p2Activities: ActivityDef[] = [
    // ── EVT 阶段（2025-10-01 ~ 2025-12-20，全部 COMPLETED）──
    { name: 'EVT 阶段', type: 'PHASE', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-01', planEnd: '2025-12-15', planDur: 55, start: '2025-10-01', end: '2025-12-20', dur: 58, assignee: 'z' },
    { name: '需求规格评审', type: 'MILESTONE', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-08', planEnd: '2025-10-10', planDur: 3, start: '2025-10-08', end: '2025-10-10', dur: 3, assignee: 'z' },
    { name: '市场调研与需求收集', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2025-10-01', planEnd: '2025-10-07', planDur: 5, start: '2025-10-01', end: '2025-10-07', dur: 5, assignee: 'l' },
    { name: '竞品分析报告', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2025-10-01', planEnd: '2025-10-08', planDur: 6, start: '2025-10-01', end: '2025-10-08', dur: 6, assignee: 'l', notes: '对比华为、H3C、自研三路方案' },
    { name: '技术可行性评估', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-08', planEnd: '2025-10-15', planDur: 6, start: '2025-10-08', end: '2025-10-15', dur: 6, assignee: 'z' },
    { name: '电源方案设计', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-11', planEnd: '2025-10-20', planDur: 8, start: '2025-10-11', end: '2025-10-20', dur: 8, assignee: 'z', notes: 'DC 9~36V 宽压转 3.3V/1.8V/1.2V 多轨' },
    { name: '主控芯片选型确认', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'CRITICAL', planStart: '2025-10-08', planEnd: '2025-10-18', planDur: 9, start: '2025-10-08', end: '2025-10-18', dur: 9, assignee: 'z', notes: '最终选定 ARM Cortex-A7 1GHz 方案' },
    { name: '射频方案设计', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-18', planEnd: '2025-10-30', planDur: 9, start: '2025-10-18', end: '2025-10-30', dur: 9, assignee: 'z', notes: '4G Cat4 天线选型与射频路径规划' },
    { name: '硬件原理图设计', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-10-11', planEnd: '2025-11-10', planDur: 23, start: '2025-10-11', end: '2025-11-12', dur: 25, assignee: 'z', notes: '三路并发需特别注意电源域隔离' },
    { name: '原理图内部评审', type: 'MILESTONE', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-11-10', planEnd: '2025-11-12', planDur: 3, start: '2025-11-10', end: '2025-11-12', dur: 3, assignee: 'z' },
    { name: 'BOM 清单整理', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2025-11-10', planEnd: '2025-11-14', planDur: 4, start: '2025-11-10', end: '2025-11-14', dur: 4, assignee: 'l' },
    { name: 'PCB Layout', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-11-11', planEnd: '2025-11-28', planDur: 14, start: '2025-11-13', end: '2025-12-01', dur: 15, assignee: 'l' },
    { name: 'PCB DFM 检查', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2025-11-28', planEnd: '2025-11-30', planDur: 3, start: '2025-12-01', end: '2025-12-03', dur: 3, assignee: 'l' },
    { name: 'Gerber 文件输出', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2025-11-30', planEnd: '2025-12-01', planDur: 2, start: '2025-12-03', end: '2025-12-04', dur: 2, assignee: 'l' },
    { name: 'EVT 样机试产', type: 'TASK', phase: 'EVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-12-01', planEnd: '2025-12-15', planDur: 11, start: '2025-12-02', end: '2025-12-20', dur: 15, assignee: 'z' },

    // ── DVT 阶段（2025-12-21 ~ 2026-03-31）──
    { name: 'DVT 阶段', type: 'PHASE', phase: 'DVT', status: 'IN_PROGRESS', priority: 'HIGH', planStart: '2025-12-21', planEnd: '2026-03-31', planDur: 70, start: '2025-12-21', assignee: 'z' },
    { name: 'EVT 测试评审', type: 'MILESTONE', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-12-21', planEnd: '2025-12-23', planDur: 3, start: '2025-12-21', end: '2025-12-23', dur: 3, assignee: 'z' },
    { name: '硬件缺陷清单整理', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-12-22', planEnd: '2025-12-26', planDur: 4, start: '2025-12-22', end: '2025-12-26', dur: 4, assignee: 'z' },
    { name: 'DVT 原理图更新', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-12-26', planEnd: '2026-01-05', planDur: 7, start: '2025-12-26', end: '2026-01-06', dur: 8, assignee: 'z' },
    { name: 'DVT PCB 更新布局', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2026-01-05', planEnd: '2026-01-15', planDur: 8, start: '2026-01-06', end: '2026-01-16', dur: 8, assignee: 'l' },
    { name: 'DVT 样机制作', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'HIGH', planStart: '2026-01-15', planEnd: '2026-02-05', planDur: 16, start: '2026-01-16', assignee: 'z' },
    { name: '4G 模组 AT 指令驱动', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'CRITICAL', planStart: '2025-12-21', planEnd: '2026-01-10', planDur: 14, start: '2025-12-21', end: '2026-01-12', dur: 16, assignee: 'z' },
    { name: '4G 拨号联网功能', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2026-01-10', planEnd: '2026-01-20', planDur: 7, start: '2026-01-12', end: '2026-01-22', dur: 7, assignee: 'z' },
    { name: 'WiFi AP 模式驱动', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2025-12-21', planEnd: '2026-01-08', planDur: 12, start: '2025-12-21', end: '2026-01-10', dur: 14, assignee: 'z' },
    { name: 'WiFi STA 模式驱动', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2026-01-08', planEnd: '2026-01-18', planDur: 8, start: '2026-01-10', end: '2026-01-20', dur: 8, assignee: 'z' },
    { name: 'WiFi AP/STA 双模切换', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'HIGH', planStart: '2026-01-18', planEnd: '2026-02-05', planDur: 13, start: '2026-01-20', assignee: 'z' },
    { name: '以太网驱动开发', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'HIGH', planStart: '2026-01-20', planEnd: '2026-02-10', planDur: 15, start: '2026-01-20', assignee: 'z' },
    { name: '三路并发切换逻辑', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'CRITICAL', planStart: '2026-02-01', planEnd: '2026-02-20', planDur: 14, start: '2026-02-01', assignee: 'z', notes: '4G/WiFi/ETH 优先级自动切换' },
    { name: '内存泄漏修复', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'CRITICAL', planStart: '2026-02-10', planEnd: '2026-02-18', planDur: 6, start: '2026-02-10', assignee: 'z', notes: '4G 驱动缓冲区管理问题' },
    { name: 'OTA 升级框架', type: 'TASK', phase: 'DVT', status: 'IN_PROGRESS', priority: 'HIGH', planStart: '2026-01-25', planEnd: '2026-02-15', planDur: 15, start: '2026-01-25', assignee: 'z' },
    { name: 'OTA 差量升级', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-02-15', planEnd: '2026-02-28', planDur: 10, assignee: 'z' },
    { name: 'Web 管理界面', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-02-20', planEnd: '2026-03-10', planDur: 14, assignee: 'l' },
    { name: 'CLI 配置接口', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-02-20', planEnd: '2026-03-05', planDur: 10, assignee: 'l' },
    { name: 'DHCP 服务器', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2026-01-05', planEnd: '2026-01-12', planDur: 6, start: '2026-01-05', end: '2026-01-12', dur: 6, assignee: 'z' },
    { name: 'DNS 缓存代理', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'MEDIUM', planStart: '2026-01-12', planEnd: '2026-01-16', planDur: 4, start: '2026-01-12', end: '2026-01-16', dur: 4, assignee: 'z' },
    { name: 'NTP 时间同步', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'LOW', planStart: '2026-01-16', planEnd: '2026-01-18', planDur: 3, start: '2026-01-16', end: '2026-01-18', dur: 3, assignee: 'z' },
    { name: '日志系统', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-02-10', planEnd: '2026-02-18', planDur: 6, assignee: 'l' },
    { name: '看门狗机制', type: 'TASK', phase: 'DVT', status: 'COMPLETED', priority: 'HIGH', planStart: '2026-01-18', planEnd: '2026-01-22', planDur: 4, start: '2026-01-18', end: '2026-01-22', dur: 4, assignee: 'z' },
    { name: '安全启动（Secure Boot）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-02-18', planEnd: '2026-03-01', planDur: 8, assignee: 'z' },
    { name: 'VPN 客户端（OpenVPN）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-02-25', planEnd: '2026-03-08', planDur: 8, assignee: 'z' },
    { name: 'VPN 客户端（WireGuard）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-01', planEnd: '2026-03-12', planDur: 8, assignee: 'z' },
    { name: 'SNMP v2c 支持', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-03-05', planEnd: '2026-03-15', planDur: 7, assignee: 'l' },
    { name: '端口转发 / NAT', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-02-20', planEnd: '2026-03-01', planDur: 7, assignee: 'z' },
    { name: 'QoS 流量调度', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-01', planEnd: '2026-03-10', planDur: 7, assignee: 'z' },
    { name: '防火墙规则引擎', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-05', planEnd: '2026-03-18', planDur: 10, assignee: 'z' },
    { name: '动态路由（OSPF）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-03-10', planEnd: '2026-03-20', planDur: 7, assignee: 'z' },
    { name: '系统状态监控', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-01', planEnd: '2026-03-10', planDur: 7, assignee: 'l' },
    { name: '告警推送（邮件/短信）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-03-10', planEnd: '2026-03-18', planDur: 6, assignee: 'l' },
    { name: '设备管理平台对接', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-08', planEnd: '2026-03-20', planDur: 9, assignee: 'z' },
    { name: '功能测试用例编写', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-02-20', planEnd: '2026-03-01', planDur: 7, assignee: 'l' },
    { name: '功能自动化测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-01', planEnd: '2026-03-15', planDur: 11, assignee: 'l' },
    { name: '性能压力测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-05', planEnd: '2026-03-18', planDur: 10, assignee: 'l' },
    { name: '4G/WiFi 兼容性测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-08', planEnd: '2026-03-20', planDur: 9, assignee: 'l' },
    { name: '互通性测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-12', planEnd: '2026-03-22', planDur: 7, assignee: 'l' },
    { name: '长时稳定性测试（72h）', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-10', planEnd: '2026-03-20', planDur: 7, assignee: 'l' },
    { name: '可靠性测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-15', planEnd: '2026-03-28', planDur: 10, assignee: 'l', notes: '高温 85°C / 低温 -40°C / 振动 / ESD' },
    { name: '温升测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-15', planEnd: '2026-03-22', planDur: 6, assignee: 'l' },
    { name: 'EMC 预符合测试', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-18', planEnd: '2026-03-28', planDur: 7, assignee: 'z' },
    { name: 'EMC 整改优化', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-25', planEnd: '2026-03-31', planDur: 5, assignee: 'z' },
    { name: '固件安全漏洞扫描', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-20', planEnd: '2026-03-28', planDur: 6, assignee: 'z' },
    { name: 'DVT 测试报告', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-25', planEnd: '2026-03-30', planDur: 4, assignee: 'l' },
    { name: 'DVT 评审会议', type: 'MILESTONE', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-31', planEnd: '2026-03-31', planDur: 1, assignee: 'z' },
    { name: '硬件 ECN 发布', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-03-28', planEnd: '2026-03-31', planDur: 3, assignee: 'z' },
    { name: '固件版本封版', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-03-28', planEnd: '2026-03-31', planDur: 3, assignee: 'z' },
    { name: '用户手册初稿', type: 'TASK', phase: 'DVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-03-15', planEnd: '2026-03-31', planDur: 12, assignee: 'l' },

    // ── PVT 阶段（2026-04-01 ~ 2026-06-30）──
    { name: 'PVT 阶段', type: 'PHASE', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-04-01', planEnd: '2026-06-30', planDur: 65, assignee: 'z' },
    { name: 'CE 认证送测', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-01', planEnd: '2026-05-15', planDur: 33, assignee: 'z' },
    { name: 'FCC 认证送测', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-01', planEnd: '2026-05-20', planDur: 36, assignee: 'z' },
    { name: 'SRRC 型号核准', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-01', planEnd: '2026-05-30', planDur: 43, assignee: 'z' },
    { name: '3C 认证', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-04-10', planEnd: '2026-05-30', planDur: 36, assignee: 'l' },
    { name: '产品外观设计确认', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-04-01', planEnd: '2026-04-10', planDur: 7, assignee: 'l' },
    { name: '包装设计', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-04-10', planEnd: '2026-04-25', planDur: 11, assignee: 'l' },
    { name: '说明书终稿', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-04-15', planEnd: '2026-04-30', planDur: 11, assignee: 'l' },
    { name: '产品资料归档', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-05-01', planEnd: '2026-05-08', planDur: 6, assignee: 'l' },
    { name: 'PVT 样机制作', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-01', planEnd: '2026-04-20', planDur: 14, assignee: 'z' },
    { name: '装配工艺验证', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-20', planEnd: '2026-05-05', planDur: 11, assignee: 'z' },
    { name: '生产测试夹具开发', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-01', planEnd: '2026-04-25', planDur: 18, assignee: 'z' },
    { name: '生产测试程序开发', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-05', planEnd: '2026-04-28', planDur: 17, assignee: 'z' },
    { name: '产线试产（小批量）', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-05-05', planEnd: '2026-05-20', planDur: 11, assignee: 'z' },
    { name: '良率统计分析', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-05-20', planEnd: '2026-05-28', planDur: 6, assignee: 'l' },
    { name: '工艺参数优化', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-05-25', planEnd: '2026-06-05', planDur: 8, assignee: 'z' },
    { name: '来料检验规范（IQC）', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-15', planEnd: '2026-04-25', planDur: 8, assignee: 'l' },
    { name: '过程检验规范（IPQC）', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-20', planEnd: '2026-04-30', planDur: 8, assignee: 'l' },
    { name: '出货检验规范（OQC）', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-04-25', planEnd: '2026-05-05', planDur: 7, assignee: 'l' },
    { name: '供应商体系审核', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-04-10', planEnd: '2026-04-20', planDur: 7, assignee: 'z' },
    { name: '备货计划制定', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-05-15', planEnd: '2026-05-22', planDur: 5, assignee: 'l' },
    { name: '成本核算确认', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-05-20', planEnd: '2026-05-28', planDur: 6, assignee: 'l' },
    { name: '营销材料准备', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-05-25', planEnd: '2026-06-10', planDur: 12, assignee: 'l' },
    { name: '渠道铺货准备', type: 'TASK', phase: 'PVT', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-06-01', planEnd: '2026-06-15', planDur: 11, assignee: 'l' },
    { name: 'PVT 评审', type: 'MILESTONE', phase: 'PVT', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-06-28', planEnd: '2026-06-30', planDur: 3, assignee: 'z' },

    // ── MP 阶段（2026-07-01 ~ 2026-08-31）──
    { name: 'MP 量产启动', type: 'MILESTONE', phase: 'MP', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-07-01', planEnd: '2026-07-01', planDur: 1, assignee: 'z' },
    { name: '首批量产（2000 台）', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-07-01', planEnd: '2026-07-25', planDur: 18, assignee: 'z' },
    { name: '生产爬坡计划', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-07-20', planEnd: '2026-08-05', planDur: 12, assignee: 'z' },
    { name: '入库验收', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-07-25', planEnd: '2026-08-05', planDur: 8, assignee: 'l' },
    { name: '渠道铺货', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'HIGH', planStart: '2026-08-01', planEnd: '2026-08-20', planDur: 14, assignee: 'l' },
    { name: '售后服务体系建立', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-07-01', planEnd: '2026-07-20', planDur: 14, assignee: 'l' },
    { name: '维修培训', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-07-15', planEnd: '2026-07-25', planDur: 7, assignee: 'l' },
    { name: '固件持续更新机制', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-07-01', planEnd: '2026-08-31', planDur: 43, assignee: 'z' },
    { name: '市场推广活动', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'MEDIUM', planStart: '2026-08-01', planEnd: '2026-08-25', planDur: 18, assignee: 'l' },
    { name: '项目总结报告', type: 'TASK', phase: 'MP', status: 'NOT_STARTED', priority: 'LOW', planStart: '2026-08-25', planEnd: '2026-08-31', planDur: 5, assignee: 'z' },
  ];

  for (let i = 0; i < p2Activities.length; i++) {
    const a = p2Activities[i];
    await prisma.activity.create({
      data: {
        projectId: project2.id,
        name: a.name,
        type: a.type,
        phase: a.phase,
        status: a.status,
        priority: a.priority,
        planStartDate: new Date(a.planStart),
        planEndDate: new Date(a.planEnd),
        planDuration: a.planDur,
        startDate: a.start ? new Date(a.start) : undefined,
        endDate: a.end ? new Date(a.end) : undefined,
        duration: a.dur,
        assignees: { connect: [{ id: a.assignee === 'z' ? z : l }] },
        sortOrder: (i + 1) * 10,
        notes: a.notes,
      },
    });
  }

  console.log(`已为 GW-X500 创建 ${p2Activities.length} 条活动`);

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: '无线网关 GW-X500',
      model: 'GW-X500',
      revision: 'V1.0',
      category: 'GATEWAY',
      status: 'DEVELOPING',
      description: '工业级无线网关，4G+WiFi+以太网三路并发，DIN 导轨安装',
      projectId: project2.id,
      specifications: {
        '处理器': 'ARM Cortex-A7 1GHz',
        '内存': '256MB DDR3',
        '存储': '512MB Flash',
        '无线': '4G Cat4 + WiFi 802.11b/g/n',
        '有线': '2×100M ETH',
        '供电': 'DC 9~36V 宽压',
        '防护等级': 'IP30',
        '工作温度': '-40°C ~ 70°C',
      },
      performance: {
        '4G 峰值下行': '150Mbps',
        'WiFi 吞吐量': '72Mbps',
        '时延(4G)': '<50ms',
        'MTBF': '>80,000小时',
        '启动时间': '<25s',
      },
    },
  });

  console.log('项目二数据创建完成');

  // ─────────────────────────────────────────────────
  // 项目三：远程控制器 RC-Pro
  // ─────────────────────────────────────────────────
  console.log('创建项目三：远程控制器 RC-Pro...');

  const project3 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: '远程控制器 RC-Pro',
      description: '面向向日葵远控场景的专用遥控硬件，低延迟、高帧率，内置向日葵 SDK',
      productLine: 'SUNFLOWER',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-12-31'),
      progress: 8,
      managerId: lisiUser.id,
    },
  });

  await prisma.activity.deleteMany({ where: { projectId: project3.id } });

  const p3a1 = await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: '立项与需求调研',
      type: 'PHASE',
      phase: 'EVT',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      planStartDate: new Date('2026-03-01'),
      planEndDate: new Date('2026-04-15'),
      planDuration: 33,
      startDate: new Date('2026-03-01'),
      assignees: { connect: [{ id: lisiUser.id }] },
      sortOrder: 10,
    },
  });

  const p3a2 = await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: '竞品分析报告',
      type: 'TASK',
      phase: 'EVT',
      status: 'COMPLETED',
      priority: 'MEDIUM',
      planStartDate: new Date('2026-03-01'),
      planEndDate: new Date('2026-03-14'),
      planDuration: 10,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-12'),
      duration: 9,
      assignees: { connect: [{ id: lisiUser.id }] },
      sortOrder: 20,
      notes: '对比 Logitech、Razer、自研方案三个方向',
      dependencies: [{ id: p3a1.id, type: '0' }],
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: '产品需求规格书（PRD）',
      type: 'TASK',
      phase: 'EVT',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      planStartDate: new Date('2026-03-15'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 20,
      startDate: new Date('2026-03-13'),
      assignees: { connect: [{ id: lisiUser.id }] },
      sortOrder: 30,
      dependencies: [{ id: p3a2.id, type: '0' }],
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: 'SDK 集成评估',
      type: 'TASK',
      phase: 'EVT',
      status: 'NOT_STARTED',
      priority: 'HIGH',
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-15'),
      planDuration: 11,
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 40,
      notes: '向日葵远控 SDK v3.x 接口评估与 PoC',
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: 'EVT 硬件设计',
      type: 'PHASE',
      phase: 'EVT',
      status: 'NOT_STARTED',
      priority: 'HIGH',
      planStartDate: new Date('2026-04-16'),
      planEndDate: new Date('2026-07-15'),
      planDuration: 65,
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 50,
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: '主控选型与原理图',
      type: 'TASK',
      phase: 'EVT',
      status: 'NOT_STARTED',
      priority: 'CRITICAL',
      planStartDate: new Date('2026-04-16'),
      planEndDate: new Date('2026-05-20'),
      planDuration: 25,
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 60,
      notes: '候选: RK3566 / MT8183 / 高通 QCM2290',
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: '按键/摇杆/触摸方案确认',
      type: 'TASK',
      phase: 'EVT',
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      planStartDate: new Date('2026-05-01'),
      planEndDate: new Date('2026-05-30'),
      planDuration: 22,
      assignees: { connect: [{ id: lisiUser.id }] },
      sortOrder: 70,
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: 'DVT 阶段',
      type: 'PHASE',
      phase: 'DVT',
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      planStartDate: new Date('2026-07-16'),
      planEndDate: new Date('2026-10-31'),
      planDuration: 77,
      assignees: { connect: [{ id: zhangsanUser.id }] },
      sortOrder: 80,
    },
  });

  await prisma.activity.create({
    data: {
      projectId: project3.id,
      name: 'PVT & MP',
      type: 'PHASE',
      phase: 'PVT',
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      planStartDate: new Date('2026-11-01'),
      planEndDate: new Date('2026-12-31'),
      planDuration: 43,
      assignees: { connect: [{ id: lisiUser.id }] },
      sortOrder: 90,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      name: '远程控制器 RC-Pro',
      model: 'RC-Pro',
      revision: 'EVT-A',
      category: 'REMOTE_CONTROL',
      status: 'DEVELOPING',
      description: '向日葵场景专用远控手柄，内置 SDK，支持 1080P 60fps 低延迟画面接收',
      projectId: project3.id,
      specifications: {
        '主控': 'ARM Cortex-A55 四核 1.8GHz（待定）',
        '显示输出': 'HDMI 2.0 / Type-C DP',
        '无线': 'WiFi 6 + BT 5.2',
        '电池': '5000mAh 可充电锂电池',
        '续航': '≥8小时',
        '按键': '自定义 16 键 + 双摇杆 + 触摸板',
        '重量': '≤350g',
      },
      performance: {
        '画面延迟': '<30ms (局域网)',
        '帧率': '最高 60fps',
        '分辨率': '最高 1920×1080',
        '连接距离': '≥100m (空旷)',
      },
    },
  });

  console.log('项目三数据创建完成');

  // ─────────────────────────────────────────────────
  // 7. 模拟周报数据（近4周：W5-W8 2026）
  // ─────────────────────────────────────────────────
  console.log('创建周报数据...');

  // ISO 周工具
  function isoWeekBounds(year: number, week: number) {
    // 找到该年第一个周四，再回溯到周一（ISO 规则）
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7; // 1=Mon … 7=Sun
    const w1Mon = new Date(jan4);
    w1Mon.setDate(jan4.getDate() - (dayOfWeek - 1));
    const weekStart = new Date(w1Mon);
    weekStart.setDate(w1Mon.getDate() + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  }

  const weeklyData = [
    // ── 项目1：智能传感器模组 V2.0 ──
    {
      projectId: sampleProject.id,
      year: 2026, weekNumber: 5,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-01-31T18:00:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>需求分析阶段正式收尾，输出《需求规格书 v1.2》</li><li>完成传感器选型评审（Bosch BME688 方案通过）</li><li>原理图设计启动，完成电源拓扑初稿</li></ul>',
      nextWeekPlan: '<ul><li>深化原理图设计，完成核心模拟电路部分</li><li>与供应商对接 BME688 样片采购</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 40, DVT: 0, PVT: 0 },
    },
    {
      projectId: sampleProject.id,
      year: 2026, weekNumber: 6,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-07T18:00:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>原理图核心模块完成 60%，数字接口部分（I2C/SPI）已定稿</li><li>BME688 样片已下单，预计 2 周后到货</li><li>与 PCB 厂商沟通叠层方案，确认 4 层板设计</li></ul>',
      nextWeekPlan: '<ul><li>完成原理图剩余 40% 并提交内部评审</li><li>启动 BOM 整理工作</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 55, DVT: 0, PVT: 0 },
    },
    {
      projectId: sampleProject.id,
      year: 2026, weekNumber: 7,
      progressStatus: 'MINOR_ISSUE',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-14T18:00:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>原理图完成并通过内部评审（共修改 3 处）</li><li>BOM 整理完成，待采购审批</li><li>样片到货延迟，供应商反馈推迟一周</li></ul>',
      nextWeekPlan: '<ul><li>启动 PCB Layout，目标完成 50% 布局</li><li>跟进样片到货情况</li><li>准备 EVT 样机试产文件</li></ul>',
      riskWarning: '<p style="color:#ff7d00">⚠ 样片到货延迟约 1 周，若进一步拖延将影响 EVT 试产节点，需持续跟进供应商</p>',
      phaseProgress: { EVT: 65, DVT: 0, PVT: 0 },
    },
    {
      projectId: sampleProject.id,
      year: 2026, weekNumber: 8,
      progressStatus: 'ON_TRACK',
      status: 'DRAFT',
      submittedAt: null,
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>PCB Layout 进行中，已完成布局约 40%</li><li>样片已确认到货日期（2026-02-20）</li></ul>',
      nextWeekPlan: '<ul><li>完成 PCB Layout 并提交 DFM 检查</li><li>样片到货后立即启动焊接与初步调试</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 70, DVT: 0, PVT: 0 },
    },

    // ── 项目2：无线网关 GW-X500 ──
    {
      projectId: project2.id,
      year: 2026, weekNumber: 5,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-01-31T17:30:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>4G 模组 AT 指令驱动框架搭建完成，完成基础拨号联网功能</li><li>WiFi AP 模式调试通过，STA 模式正在联调</li><li>DVT 阶段整体进度 35%</li></ul>',
      nextWeekPlan: '<ul><li>完成 WiFi STA/AP 双模切换逻辑</li><li>启动以太网自协商驱动开发</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 100, DVT: 35, PVT: 0 },
    },
    {
      projectId: project2.id,
      year: 2026, weekNumber: 6,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-07T17:30:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>WiFi 双模切换功能联调完成，稳定性测试通过 72h</li><li>以太网驱动开发完成，自协商 100M 正常</li><li>开始三路并发场景压力测试</li></ul>',
      nextWeekPlan: '<ul><li>完成三路并发压测，目标吞吐量 ≥90Mbps</li><li>启动 OTA 升级功能开发</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 100, DVT: 55, PVT: 0 },
    },
    {
      projectId: project2.id,
      year: 2026, weekNumber: 7,
      progressStatus: 'MAJOR_ISSUE',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-14T17:00:00'),
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>三路并发压测发现内存泄漏，定位到 4G 驱动缓冲区管理问题</li><li>OTA 升级框架完成，差量升级功能开发中</li><li>已启动 kernel 网络子系统 code review</li></ul>',
      nextWeekPlan: '<ul><li>修复内存泄漏 bug，重新执行 72h 稳定性测试</li><li>完成 OTA 差量升级功能</li><li>评估对可靠性测试节点的影响</li></ul>',
      riskWarning: '<p style="color:#f53f3f">🔴 内存泄漏问题导致设备在高负载下 8h 后重启，若本周未修复将推迟可靠性测试计划约 2 周，影响整体 DVT 节点</p>',
      phaseProgress: { EVT: 100, DVT: 65, PVT: 0 },
    },
    {
      projectId: project2.id,
      year: 2026, weekNumber: 8,
      progressStatus: 'ON_TRACK',
      status: 'DRAFT',
      submittedAt: null,
      createdBy: zhangsanUser.id,
      keyProgress: '<ul><li>内存泄漏 bug 已修复并合入主干，复测稳定运行 48h 无重启</li><li>OTA 差量升级功能完成，升级包体积减小 70%</li></ul>',
      nextWeekPlan: '<ul><li>执行完整 72h 稳定性验证</li><li>移交测试组启动可靠性测试</li></ul>',
      riskWarning: '<p style="color:#86909c">内存泄漏已修复，可靠性测试节点预计延迟 1 周（在可接受范围内）</p>',
      phaseProgress: { EVT: 100, DVT: 75, PVT: 0 },
    },

    // ── 项目3：远程控制器 RC-Pro ──
    {
      projectId: project3.id,
      year: 2026, weekNumber: 5,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-01-31T17:00:00'),
      createdBy: lisiUser.id,
      keyProgress: '<ul><li>竞品分析报告定稿并通过评审（覆盖 Logitech、Razer 和自研三方向）</li><li>PRD 初稿完成 50%，核心功能需求已明确</li></ul>',
      nextWeekPlan: '<ul><li>完成 PRD 初稿并组织内部评审</li><li>启动向日葵 SDK v3.x 接口文档研读</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 10, DVT: 0, PVT: 0 },
    },
    {
      projectId: project3.id,
      year: 2026, weekNumber: 6,
      progressStatus: 'ON_TRACK',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-07T17:00:00'),
      createdBy: lisiUser.id,
      keyProgress: '<ul><li>PRD v0.9 完成内部评审，收集到 12 条修改意见</li><li>SDK v3.x 接口文档研读完成，PoC 方案确定</li><li>项目正式从 PLANNING 推进至 IN_PROGRESS</li></ul>',
      nextWeekPlan: '<ul><li>完成 PRD v1.0 修订并提交终审</li><li>启动向日葵 SDK PoC 开发（目标: 1080P 画面接收演示）</li></ul>',
      riskWarning: '<p style="color:#86909c">暂无风险预警</p>',
      phaseProgress: { EVT: 20, DVT: 0, PVT: 0 },
    },
    {
      projectId: project3.id,
      year: 2026, weekNumber: 7,
      progressStatus: 'MINOR_ISSUE',
      status: 'SUBMITTED',
      submittedAt: new Date('2026-02-14T17:00:00'),
      createdBy: lisiUser.id,
      keyProgress: '<ul><li>PRD v1.0 终审通过，进入硬件选型阶段</li><li>SDK PoC 完成画面接收，局域网延迟实测 22ms（目标 &lt;30ms）</li><li>主控选型方案有争议：RK3566 vs MT8183 尚未敲定</li></ul>',
      nextWeekPlan: '<ul><li>主控选型会议（邀请硬件负责人张三）</li><li>继续完善 SDK PoC，增加手柄输入映射验证</li></ul>',
      riskWarning: '<p style="color:#ff7d00">⚠ 主控选型争议导致原理图设计推迟约 1 周，需本周内完成决策</p>',
      phaseProgress: { EVT: 30, DVT: 0, PVT: 0 },
    },
    {
      projectId: project3.id,
      year: 2026, weekNumber: 8,
      progressStatus: 'ON_TRACK',
      status: 'DRAFT',
      submittedAt: null,
      createdBy: lisiUser.id,
      keyProgress: '<ul><li>主控选型会议完成，确定采用 RK3566（生态更成熟，降低固件风险）</li><li>SDK PoC 增加手柄输入映射，端到端延迟 &lt;25ms</li></ul>',
      nextWeekPlan: '<ul><li>启动 RK3566 原理图设计</li><li>输出按键/摇杆/触摸方案评估报告</li></ul>',
      riskWarning: '<p style="color:#86909c">主控已确定，进度追回，后续按计划推进</p>',
      phaseProgress: { EVT: 35, DVT: 0, PVT: 0 },
    },
  ];

  for (const r of weeklyData) {
    const { weekStart, weekEnd } = isoWeekBounds(r.year, r.weekNumber);
    // 检查是否已存在（同项目同周），避免重复插入
    const existing = await prisma.weeklyReport.findFirst({
      where: { projectId: r.projectId, year: r.year, weekNumber: r.weekNumber },
    });
    if (!existing) {
      await prisma.weeklyReport.create({
        data: {
          projectId: r.projectId,
          year: r.year,
          weekNumber: r.weekNumber,
          weekStart,
          weekEnd,
          progressStatus: r.progressStatus as 'ON_TRACK' | 'MINOR_ISSUE' | 'MAJOR_ISSUE',
          status: r.status as 'DRAFT' | 'SUBMITTED' | 'ARCHIVED',
          submittedAt: r.submittedAt,
          createdBy: r.createdBy,
          keyProgress: r.keyProgress,
          nextWeekPlan: r.nextWeekPlan,
          riskWarning: r.riskWarning,
          phaseProgress: r.phaseProgress,
        },
      });
    }
  }

  console.log(`已创建 ${weeklyData.length} 条周报数据`);

  console.log('数据库种子数据初始化完成!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
