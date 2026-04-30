/**
 * Q1 Pro-V1 项目进度表导入脚本
 * 从 Excel 数据导入活动到已有的 Q1 Pro-V1 项目
 */

const BASE_URL = 'http://localhost:3000/api';
const PROJECT_ID = '5b2826f4-08df-4c61-98dc-53ed26dce6cf';

// ============ 工具函数 ============

function _parseChineseDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();
  const match = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

let TOKEN = '';

async function api(method: string, path: string, body?: any): Promise<any> {
  const opts: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, status: res.status };
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const data = (await res.json()) as { accessToken?: string };
  TOKEN = data.accessToken || '';
  console.log('✓ 登录成功');
}

// ============ 用户数据 ============

// Excel 中出现的所有人员 (realName -> username)
const PEOPLE: Record<string, { username: string; email: string }> = {
  '刘前程': { username: 'liuqiancheng', email: 'liuqiancheng@oray.com' },
  '汤翠仪': { username: 'tangcuiyi', email: 'tangcuiyi@oray.com' },
  '冼国杰': { username: 'xianguojie', email: 'xianguojie@oray.com' },
  '叶鹏飞': { username: 'yepengfei', email: 'yepengfei@oray.com' },
  '罗睿': { username: 'luorui', email: 'luorui@oray.com' },
  '李哲齐': { username: 'lizheqi', email: 'lizheqi@oray.com' },
  '田萌': { username: 'tianmeng', email: 'tianmeng@oray.com' },
  '黄文哲': { username: 'huangwenzhe', email: 'huangwenzhe@oray.com' },
  '莫学舞': { username: 'moxuewu', email: 'moxuewu@oray.com' },
  '陈玥': { username: 'chenyue', email: 'chenyue@oray.com' },
  '成颖欣': { username: 'chengyingxin', email: 'chengyingxin@oray.com' },
  '潘楚坤': { username: 'panchukun', email: 'panchukun@oray.com' },
  '黄龙': { username: 'huanglong', email: 'huanglong@oray.com' },
};

// 人名 -> userId 映射 (运行时填充)
const USER_ID_MAP: Record<string, string> = {};

// 团队成员角色 ID
const TEAM_MEMBER_ROLE_ID = '8cc309be-9410-48dd-872c-8a4a702d2a03'; // 项目经理

function _parseAssignees(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  // 格式: "李哲齐(蓝鳍金枪鱼), 田萌(血红龙)"
  return raw.split(',').map((s) => {
    const name = s.trim().replace(/\(.*?\)/, '').trim();
    return name;
  }).filter(Boolean);
}

async function ensureUsers() {
  // 获取现有用户
  const existing = await api('GET', '/users?pageSize=100');
  const users = existing.data || existing;

  for (const u of users) {
    // 通过 realName 映射
    USER_ID_MAP[u.realName] = u.id;
  }

  console.log(`✓ 现有用户 ${users.length} 人: ${users.map((u: any) => u.realName).join(', ')}`);

  // 创建缺失的用户
  for (const [realName, info] of Object.entries(PEOPLE)) {
    if (USER_ID_MAP[realName]) continue;

    console.log(`  创建用户: ${realName} (${info.username})`);
    const result = await api('POST', '/users', {
      username: info.username,
      email: info.email,
      password: '123456',
      realName,
      roleIds: [TEAM_MEMBER_ROLE_ID],
    });

    if (result.id) {
      USER_ID_MAP[realName] = result.id;
      console.log(`  ✓ 创建成功: ${realName} -> ${result.id}`);
    } else if (result.error) {
      console.log(`  ✗ 创建失败: ${realName} - ${result.error}`);
      // 尝试查找已存在的用户
      const retry = await api('GET', '/users?pageSize=100');
      const retryUsers = retry.data || retry;
      for (const u of retryUsers) {
        if (u.realName === realName || u.username === info.username) {
          USER_ID_MAP[realName] = u.id;
          console.log(`  ✓ 找到已有用户: ${realName} -> ${u.id}`);
        }
      }
    }
  }

  console.log(`✓ 用户准备完毕, 共 ${Object.keys(USER_ID_MAP).length} 人`);
}

// ============ 活动数据 (从 Excel 解析) ============

interface RawActivity {
  phase: string;       // EVT, DVT, PVT, MP
  name: string;        // 任务描述
  assignees: string;   // 原始负责人字符串
  planDuration: number | null;
  planStartDate: string | null;
  planEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  isMilestone: boolean;
  status: string;      // 已完成 or empty
  notes: string;
}

// 按阶段分组并按时间排序的活动数据
const ACTIVITIES: RawActivity[] = [
  // ==================== EVT 阶段 ====================
  { phase: 'EVT', name: '【ID】ID 修改', assignees: '冼国杰', planDuration: 1, planStartDate: '2025-12-26', planEndDate: '2025-12-26', actualStartDate: '2025-12-26', actualEndDate: '2025-12-26', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【ID】ID 可行性评估', assignees: '罗睿, 叶鹏飞', planDuration: 2, planStartDate: '2025-12-29', planEndDate: '2025-12-30', actualStartDate: '2025-12-29', actualEndDate: '2025-12-30', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【ID】ID 设计评审定稿', assignees: '冼国杰', planDuration: 1, planStartDate: '2025-12-30', planEndDate: '2025-12-30', actualStartDate: '2025-12-30', actualEndDate: '2025-12-30', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【硬件】原理图设计', assignees: '李哲齐', planDuration: 9, planStartDate: '2025-12-26', planEndDate: '2026-01-09', actualStartDate: '2025-12-26', actualEndDate: '2026-01-09', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【结构】结构 3D设计', assignees: '叶鹏飞', planDuration: 4, planStartDate: '2026-01-04', planEndDate: '2026-01-07', actualStartDate: '2026-01-04', actualEndDate: '2026-01-07', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【结构】外壳3D打样', assignees: '叶鹏飞', planDuration: 3, planStartDate: '2026-01-08', planEndDate: '2026-01-12', actualStartDate: '2026-01-08', actualEndDate: '2026-01-12', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【硬件】需求变更物料验证', assignees: '李哲齐', planDuration: 3, planStartDate: '2026-01-12', planEndDate: '2026-01-14', actualStartDate: '2026-01-12', actualEndDate: '2026-01-15', isMilestone: false, status: '已完成', notes: '延期 1 天完成' },
  { phase: 'EVT', name: '【硬件】PCB layout', assignees: '李哲齐', planDuration: 7, planStartDate: '2026-01-15', planEndDate: '2026-01-23', actualStartDate: '2026-01-16', actualEndDate: '2026-01-21', isMilestone: false, status: '已完成', notes: '较计划提前 4 天完成' },
  { phase: 'EVT', name: '【硬件】第一版生产资料输出', assignees: '李哲齐', planDuration: 1, planStartDate: '2026-01-26', planEndDate: '2026-01-26', actualStartDate: '2026-01-22', actualEndDate: '2026-01-23', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【BOM】评估物料选型及可采购性', assignees: '刘前程', planDuration: 5, planStartDate: '2026-01-26', planEndDate: '2026-01-30', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '因工厂放假，需要年后才能评估' },
  { phase: 'EVT', name: '【硬件】第一版PCBA打板--到样', assignees: '李哲齐', planDuration: 11, planStartDate: '2026-01-27', planEndDate: '2026-02-10', actualStartDate: '2026-01-22', actualEndDate: '2026-02-06', isMilestone: false, status: '已完成', notes: '嘉立创年前爆单，排队时间比较长' },
  { phase: 'EVT', name: '【结构】完成第一版装配验证', assignees: '叶鹏飞', planDuration: 2, planStartDate: '2026-02-11', planEndDate: '2026-02-12', actualStartDate: '2026-02-09', actualEndDate: '2026-02-09', isMilestone: false, status: '已完成', notes: '' },
  { phase: 'EVT', name: '【硬件】第一版PCBA 验证调试', assignees: '李哲齐', planDuration: 4, planStartDate: '2026-02-11', planEndDate: '2026-02-25', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '含新年假期' },
  { phase: 'EVT', name: '【硬件+软件】第一版PCBA软硬件联调', assignees: '李哲齐, 田萌, 潘楚坤', planDuration: 10, planStartDate: '2026-02-11', planEndDate: '2026-03-04', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '含新年假期' },
  { phase: 'EVT', name: '【结构】第二版结构 3D设计', assignees: '叶鹏飞', planDuration: 5, planStartDate: '2026-02-24', planEndDate: '2026-02-28', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【结构】第二版外壳3D打样', assignees: '叶鹏飞', planDuration: 3, planStartDate: '2026-03-02', planEndDate: '2026-03-04', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【硬件】第二版原理图PCB改板', assignees: '李哲齐', planDuration: 5, planStartDate: '2026-03-05', planEndDate: '2026-03-11', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【硬件】第二版生产资料输出', assignees: '李哲齐', planDuration: 1, planStartDate: '2026-03-12', planEndDate: '2026-03-12', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【商务流程】PCBA 打样商务流程', assignees: '刘前程', planDuration: 5, planStartDate: '2026-03-13', planEndDate: '2026-03-19', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【结构】打结构板验证第二版装配', assignees: '李哲齐', planDuration: 10, planStartDate: '2026-03-13', planEndDate: '2026-03-27', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【硬件】第二版PCB打板---到样', assignees: '李哲齐', planDuration: 22, planStartDate: '2026-03-20', planEndDate: '2026-04-20', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '找工厂打样第二版，调试没问题直接用于 DVT 测试' },
  { phase: 'EVT', name: '【结构】完成第二版装配验证', assignees: '叶鹏飞', planDuration: 2, planStartDate: '2026-03-30', planEndDate: '2026-03-31', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【结构】输出开模图纸', assignees: '叶鹏飞', planDuration: 3, planStartDate: '2026-04-01', planEndDate: '2026-04-03', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },
  { phase: 'EVT', name: '【硬件】第二版PCBA 验证调试', assignees: '李哲齐', planDuration: 3, planStartDate: '2026-04-20', planEndDate: '2026-04-22', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【硬件+软件】第二版PCBA软硬件联调', assignees: '李哲齐, 田萌', planDuration: 5, planStartDate: '2026-04-20', planEndDate: '2026-04-24', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },
  { phase: 'EVT', name: '【测试】EVT 阶段测试', assignees: '李哲齐, 田萌', planDuration: 5, planStartDate: '2026-04-27', planEndDate: '2026-05-06', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'EVT', name: '【验收】EVT 阶段验收', assignees: '黄文哲, 莫学舞', planDuration: 1, planStartDate: '2026-05-07', planEndDate: '2026-05-07', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },

  // ==================== DVT 阶段 ====================
  { phase: 'DVT', name: '【包材】需求沟通', assignees: '陈玥, 成颖欣', planDuration: 4, planStartDate: '2026-03-30', planEndDate: '2026-04-02', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【商务流程】完成开模商务流程', assignees: '刘前程', planDuration: 5, planStartDate: '2026-04-03', planEndDate: '2026-04-09', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】设计', assignees: '陈玥', planDuration: 5, planStartDate: '2026-04-03', planEndDate: '2026-04-09', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】与模厂沟通，完成开模评审', assignees: '叶鹏飞', planDuration: 3, planStartDate: '2026-04-09', planEndDate: '2026-04-13', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】设计稿确认', assignees: '成颖欣, 莫学舞', planDuration: 2, planStartDate: '2026-04-10', planEndDate: '2026-04-13', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】启动开模--30 个自然日', assignees: '刘前程', planDuration: 22, planStartDate: '2026-04-14', planEndDate: '2026-05-14', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】打样---回样', assignees: '刘前程', planDuration: 10, planStartDate: '2026-04-14', planEndDate: '2026-04-28', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '14个自然日' },
  { phase: 'DVT', name: '【包材】样品确认', assignees: '陈玥, 成颖欣, 莫学舞', planDuration: 1, planStartDate: '2026-04-29', planEndDate: '2026-04-29', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】样品修改', assignees: '陈玥', planDuration: 2, planStartDate: '2026-04-30', planEndDate: '2026-05-06', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】打样---回样(二次)', assignees: '刘前程', planDuration: 10, planStartDate: '2026-05-07', planEndDate: '2026-05-21', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【测试】DVT整机测试-硬件', assignees: '李哲齐', planDuration: 15, planStartDate: '2026-05-08', planEndDate: '2026-05-29', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【测试】DVT整机测试-软件', assignees: '田萌', planDuration: 15, planStartDate: '2026-05-08', planEndDate: '2026-05-29', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【测试】DVT整机测试-工厂', assignees: '刘前程', planDuration: 10, planStartDate: '2026-05-08', planEndDate: '2026-05-22', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T0 模具评审', assignees: '叶鹏飞', planDuration: 2, planStartDate: '2026-05-15', planEndDate: '2026-05-18', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【商务流程】试产、量产下单', assignees: '刘前程', planDuration: 7, planStartDate: '2026-05-06', planEndDate: '2026-05-14', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '提前下整机生产订单', notes: '' },
  { phase: 'DVT', name: '【结构】T0 样品生产', assignees: '刘前程', planDuration: 3, planStartDate: '2026-05-19', planEndDate: '2026-05-21', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】样品确认(二次)', assignees: '成颖欣, 莫学舞', planDuration: 2, planStartDate: '2026-05-22', planEndDate: '2026-05-25', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T0 样品试装', assignees: '叶鹏飞', planDuration: 2, planStartDate: '2026-05-22', planEndDate: '2026-05-25', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T1 修模--7 个自然日', assignees: '刘前程', planDuration: 5, planStartDate: '2026-05-26', planEndDate: '2026-06-01', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【包材】生产资料释放', assignees: '陈玥', planDuration: 2, planStartDate: '2026-05-26', planEndDate: '2026-05-27', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【验收】DVT 整机验收', assignees: '黄文哲, 莫学舞', planDuration: 2, planStartDate: '2026-06-01', planEndDate: '2026-06-02', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },
  { phase: 'DVT', name: '【软件】试产固件发布', assignees: '田萌, 成颖欣', planDuration: 2, planStartDate: '2026-06-01', planEndDate: '2026-06-02', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T1 样品生产', assignees: '刘前程', planDuration: 3, planStartDate: '2026-06-02', planEndDate: '2026-06-04', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【BOM】生产BOM释放', assignees: '李哲齐', planDuration: 1, planStartDate: '2026-06-03', planEndDate: '2026-06-03', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【认证】样机提供-启动认证', assignees: '黄龙', planDuration: 22, planStartDate: '2026-06-03', planEndDate: '2026-07-03', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T1 样品试装', assignees: '叶鹏飞', planDuration: 2, planStartDate: '2026-06-05', planEndDate: '2026-06-08', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'DVT', name: '【结构】T1 样品验收', assignees: '叶鹏飞', planDuration: 1, planStartDate: '2026-06-08', planEndDate: '2026-06-08', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },

  // ==================== PVT 阶段 ====================
  { phase: 'PVT', name: '【备料】长周期物料备料', assignees: '汤翠仪, 刘前程', planDuration: 22, planStartDate: '2026-05-15', planEndDate: '2026-06-18', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '初步评估30个自然日' },
  { phase: 'PVT', name: '【备料】短周期物料备料', assignees: '汤翠仪, 刘前程', planDuration: 15, planStartDate: '2026-06-04', planEndDate: '2026-06-18', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '初步评估15个自然日' },
  { phase: 'PVT', name: '【试产】试产物料齐料', assignees: '刘前程', planDuration: 3, planStartDate: '2026-06-19', planEndDate: '2026-06-23', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'PVT', name: '【试产】试产上线-试产样机回样', assignees: '刘前程', planDuration: 3, planStartDate: '2026-06-24', planEndDate: '2026-06-26', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'PVT', name: '【试产】试产样机整机测试', assignees: '李哲齐, 黄龙, 田萌', planDuration: 5, planStartDate: '2026-06-29', planEndDate: '2026-07-03', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'PVT', name: '【软件】量产固件发布', assignees: '田萌, 成颖欣', planDuration: 2, planStartDate: '2026-07-03', planEndDate: '2026-07-06', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'PVT', name: '【验收】试产样机完成验收', assignees: '莫学舞, 黄文哲, 罗睿', planDuration: 1, planStartDate: '2026-07-06', planEndDate: '2026-07-06', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },

  // ==================== MP 阶段 ====================
  { phase: 'MP', name: '【量产】生产通知', assignees: '汤翠仪, 刘前程', planDuration: 1, planStartDate: '2026-07-07', planEndDate: '2026-07-07', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
  { phase: 'MP', name: '【量产】物料齐料', assignees: '刘前程', planDuration: 3, planStartDate: '2026-07-08', planEndDate: '2026-07-10', actualStartDate: null, actualEndDate: null, isMilestone: true, status: '', notes: '' },
  { phase: 'MP', name: '【量产】上线-大货到仓', assignees: '刘前程', planDuration: 5, planStartDate: '2026-07-13', planEndDate: '2026-07-17', actualStartDate: null, actualEndDate: null, isMilestone: false, status: '', notes: '' },
];

// ============ 主流程 ============

async function deleteExistingActivities() {
  // 获取项目现有活动
  const res = await api('GET', `/activities?projectId=${PROJECT_ID}&pageSize=200`);
  const activities = res.data || res || [];
  if (activities.length > 0) {
    console.log(`  删除 ${activities.length} 个现有活动...`);
    for (const a of activities) {
      await api('DELETE', `/activities/${a.id}`);
    }
    console.log('  ✓ 现有活动已清除');
  } else {
    console.log('  ✓ 无现有活动需要清除');
  }
}

async function createActivities() {
  const phases = ['EVT', 'DVT', 'PVT', 'MP'];
  const phaseNames: Record<string, string> = {
    EVT: 'EVT 工程验证阶段',
    DVT: 'DVT 设计验证阶段',
    PVT: 'PVT 生产验证阶段',
    MP: 'MP 量产阶段',
  };

  const phaseIds: Record<string, string> = {};
  let totalCreated = 0;

  for (const phase of phases) {
    const phaseActivities = ACTIVITIES.filter((a) => a.phase === phase);
    if (phaseActivities.length === 0) continue;

    // 计算阶段的起止时间
    const startDates = phaseActivities
      .map((a) => a.planStartDate)
      .filter(Boolean)
      .sort();
    const endDates = phaseActivities
      .map((a) => a.planEndDate)
      .filter(Boolean)
      .sort();

    // 创建阶段父活动
    console.log(`\n▶ 创建阶段: ${phaseNames[phase]} (${phaseActivities.length} 个任务)`);
    const phaseResult = await api('POST', '/activities', {
      projectId: PROJECT_ID,
      name: phaseNames[phase],
      type: 'PHASE',
      phase,
      status: phase === 'EVT' ? 'IN_PROGRESS' : 'NOT_STARTED',
      priority: 'HIGH',
      planStartDate: startDates[0] || null,
      planEndDate: endDates[endDates.length - 1] || null,
      sortOrder: phases.indexOf(phase) * 100,
    });

    if (phaseResult.id) {
      phaseIds[phase] = phaseResult.id;
      console.log(`  ✓ 阶段创建成功: ${phaseResult.id}`);
    } else {
      console.log(`  ✗ 阶段创建失败:`, phaseResult.error || phaseResult);
      continue;
    }

    // 创建阶段内的活动
    for (let i = 0; i < phaseActivities.length; i++) {
      const act = phaseActivities[i];

      // 解析负责人
      const assigneeNames = act.assignees.split(',').map((s) => s.trim()).filter(Boolean);
      const assigneeIds = assigneeNames
        .map((name) => USER_ID_MAP[name])
        .filter(Boolean);

      // 确定状态
      let status = 'NOT_STARTED';
      if (act.status === '已完成') {
        status = 'COMPLETED';
      } else if (act.actualStartDate && !act.actualEndDate) {
        status = 'IN_PROGRESS';
      }

      // 组合备注
      const notesParts: string[] = [];
      if (act.isMilestone) notesParts.push('⭐ 关键节点');
      if (act.notes) notesParts.push(act.notes);

      const body: any = {
        projectId: PROJECT_ID,
        name: act.name,
        type: act.isMilestone ? 'MILESTONE' : 'TASK',
        phase,
        status,
        priority: act.isMilestone ? 'HIGH' : 'MEDIUM',
        planStartDate: act.planStartDate,
        planEndDate: act.planEndDate,
        planDuration: act.planDuration,
        sortOrder: phases.indexOf(phase) * 100 + i + 1,
        notes: notesParts.join(' | ') || undefined,
      };

      if (act.actualStartDate) body.startDate = act.actualStartDate;
      if (act.actualEndDate) body.endDate = act.actualEndDate;
      if (assigneeIds.length > 0) body.assigneeIds = assigneeIds;

      const result = await api('POST', '/activities', body);
      if (result.id) {
        totalCreated++;
        const assigneeStr = assigneeNames.join(', ');
        console.log(`  ✓ [${String(i + 1).padStart(2)}/${phaseActivities.length}] ${act.name} (${assigneeStr}) ${status === 'COMPLETED' ? '✅' : ''}`);
      } else {
        console.log(`  ✗ [${String(i + 1).padStart(2)}/${phaseActivities.length}] ${act.name} 失败:`, result.error || result);
      }
    }
  }

  return totalCreated;
}

async function addProjectMembers() {
  // 将所有相关人员添加为项目协作者
  const memberIds = Object.values(USER_ID_MAP).filter(Boolean);
  console.log(`\n添加 ${memberIds.length} 个项目成员...`);
  for (const userId of memberIds) {
    const _res = await api('POST', `/projects/${PROJECT_ID}/members`, { userId });
    // 忽略已存在的错误
  }
  console.log('✓ 项目成员添加完毕');
}

async function updateProjectDates() {
  // 更新项目起止时间
  const allStartDates = ACTIVITIES.map((a) => a.planStartDate).filter(Boolean).sort();
  const allEndDates = ACTIVITIES.map((a) => a.planEndDate).filter(Boolean).sort();

  if (allStartDates.length > 0 && allEndDates.length > 0) {
    await api('PUT', `/projects/${PROJECT_ID}`, {
      startDate: allStartDates[0],
      endDate: allEndDates[allEndDates.length - 1],
    });
    console.log(`✓ 项目日期更新: ${allStartDates[0]} ~ ${allEndDates[allEndDates.length - 1]}`);
  }
}

// ============ 执行 ============

async function main() {
  console.log('========================================');
  console.log('  Q1 Pro-V1 项目进度表导入');
  console.log('========================================\n');

  // 1. 登录
  await login();

  // 2. 准备用户
  console.log('\n--- 步骤 1: 准备用户 ---');
  await ensureUsers();

  // 3. 清理现有活动
  console.log('\n--- 步骤 2: 清理现有活动 ---');
  await deleteExistingActivities();

  // 4. 创建活动
  console.log('\n--- 步骤 3: 导入活动 ---');
  const count = await createActivities();

  // 5. 添加项目成员
  console.log('\n--- 步骤 4: 添加项目成员 ---');
  await addProjectMembers();

  // 6. 更新项目日期
  console.log('\n--- 步骤 5: 更新项目日期 ---');
  await updateProjectDates();

  console.log('\n========================================');
  console.log(`  导入完成! 共创建 ${count} 个活动`);
  console.log('========================================');
}

main().catch(console.error);
