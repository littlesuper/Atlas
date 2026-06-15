import { KnowledgeIndexSection, buildQualityKnowledgeIndex } from '../utils/qualityKnowledgeIndex';

const sections: KnowledgeIndexSection[] = [
  {
    name: '基础方案',
    items: [
      { title: '总体方案', path: 'atlas-quality-system/docs/01-总体方案.md', audience: 'all' },
      { title: '六维测试详解', path: 'atlas-quality-system/docs/02-六维测试详解.md', audience: 'guardian' },
      { title: '工作流程', path: 'atlas-quality-system/docs/03-工作流程.md', audience: 'pm' },
      { title: '工具链选型', path: 'atlas-quality-system/docs/04-工具链选型.md', audience: 'engineer' },
      { title: 'FAQ 与故障处理', path: 'atlas-quality-system/docs/05-FAQ与故障处理.md', audience: 'all' },
    ],
  },
  {
    name: '工程执行',
    items: [
      { title: '测试覆盖矩阵', path: 'atlas-quality-system/docs/06-测试覆盖矩阵.md', audience: 'engineer' },
      { title: '可观测性与告警矩阵', path: 'atlas-quality-system/docs/07-可观测性与告警矩阵.md', audience: 'engineer', command: 'npm run alerts:check --workspace=server' },
      { title: '发布与应急 Runbook', path: 'atlas-quality-system/docs/08-发布与应急Runbook.md', audience: 'guardian', command: 'npm run release:precheck --workspace=server -- ...' },
    ],
  },
  {
    name: 'Week 8 体系巩固',
    items: [
      { title: '月度审计输入包', path: 'atlas-quality-system/docs/14-月度审计输入包.md', audience: 'guardian', command: 'npm run quality:audit-input-pack --workspace=server -- --month 2026-05' },
      { title: '月度审计执行记录', path: 'atlas-quality-system/docs/15-月度审计执行记录.md', audience: 'guardian', command: 'npm run quality:audit-run --workspace=server -- --month 2026-05' },
      { title: '质量行动项跟踪', path: 'atlas-quality-system/docs/16-质量行动项跟踪.md', audience: 'guardian', command: 'npm run quality:action-tracker --workspace=server' },
      { title: '阻塞项接受记录', path: 'atlas-quality-system/docs/29-阻塞项接受记录.md', audience: 'guardian', command: 'npm run quality:blocker-acceptance --workspace=server -- --accept "..."' },
      { title: '阻塞项解决判断', path: 'atlas-quality-system/docs/30-阻塞项解决判断.md', audience: 'guardian', command: 'npm run quality:blocker-resolution --workspace=server' },
      { title: '质量阻塞项登记', path: 'atlas-quality-system/docs/23-质量阻塞项登记.md', audience: 'guardian', command: 'npm run quality:blocker-register --workspace=server' },
      { title: 'Owner 分派包', path: 'atlas-quality-system/docs/24-Owner分派包.md', audience: 'guardian', command: 'npm run quality:owner-assignments --workspace=server' },
      { title: '证据 Intake 包', path: 'atlas-quality-system/docs/25-证据Intake包.md', audience: 'guardian', command: 'npm run quality:evidence-intake --workspace=server -- --confirm "..."' },
      { title: '收口执行顺序', path: 'atlas-quality-system/docs/26-收口执行顺序.md', audience: 'guardian', command: 'npm run quality:closure-sequence --workspace=server' },
      { title: '收口仪表盘', path: 'atlas-quality-system/docs/27-收口仪表盘.md', audience: 'guardian', command: 'npm run quality:closure-dashboard --workspace=server' },
      { title: '收口简报', path: 'atlas-quality-system/docs/28-收口简报.md', audience: 'guardian', command: 'npm run quality:closure-brief --workspace=server' },
      { title: '收口一致性门禁', path: 'atlas-quality-system/docs/31-收口一致性门禁.md', audience: 'guardian', command: 'npm run quality:closure-consistency --workspace=server' },
      { title: '收口证据包', path: 'atlas-quality-system/docs/32-收口证据包.md', audience: 'guardian', command: 'npm run quality:closure-evidence-pack --workspace=server' },
      { title: '收口证据交接门禁', path: 'atlas-quality-system/docs/33-收口证据交接门禁.md', audience: 'guardian', command: 'npm run quality:closure-evidence-handoff --workspace=server' },
      { title: '收口剩余工作清单', path: 'atlas-quality-system/docs/34-收口剩余工作清单.md', audience: 'guardian', command: 'npm run quality:closure-remaining-work --workspace=server' },
      { title: '收口请求包', path: 'atlas-quality-system/docs/35-收口请求包.md', audience: 'guardian', command: 'npm run quality:closure-request-pack --workspace=server' },
      { title: '100% 完成授权记录', path: 'atlas-quality-system/docs/36-100完成授权记录.md', audience: 'guardian', command: 'npm run quality:completion-authorization --workspace=server' },
      { title: '100% 后补证跟踪', path: 'atlas-quality-system/docs/37-100后补证跟踪.md', audience: 'guardian', command: 'npm run quality:post-completion-followup --workspace=server' },
      { title: 'Week 8 收口门禁', path: 'atlas-quality-system/docs/17-Week8收口门禁.md', audience: 'guardian', command: 'npm run quality:closure-gate --workspace=server' },
      { title: 'Week 8 团队交接包', path: 'atlas-quality-system/docs/18-Week8团队交接包.md', audience: 'guardian', command: 'npm run quality:handoff-pack --workspace=server' },
      { title: 'Week 8 确认回填', path: 'atlas-quality-system/docs/19-Week8确认回填.md', audience: 'guardian', command: 'npm run quality:handoff-confirm --workspace=server -- --confirm "..."' },
      { title: '团队确认登记', path: 'atlas-quality-system/docs/20-团队确认登记.md', audience: 'guardian', command: 'npm run quality:team-confirmations --workspace=server -- --confirm "..."' },
      { title: 'Week 8 最终收口包', path: 'atlas-quality-system/docs/21-Week8最终收口包.md', audience: 'guardian', command: 'npm run quality:final-closure --workspace=server -- --artifact "..."' },
      { title: '进度看板自检', path: 'atlas-quality-system/docs/22-进度看板自检.md', audience: 'guardian', command: 'npm run quality:progress-guard --workspace=server' },
      { title: '月度质量审计报告', path: 'atlas-quality-system/docs/09-月度质量审计报告.md', audience: 'guardian', command: 'npm run quality:audit-report --workspace=server -- ...' },
      { title: '前七周质量复盘', path: 'atlas-quality-system/docs/10-前七周质量复盘.md', audience: 'guardian', command: 'npm run quality:retro-report --workspace=server -- ...' },
      { title: '质量回顾会材料包', path: 'atlas-quality-system/docs/11-质量回顾会材料包.md', audience: 'guardian', command: 'npm run quality:review-pack --workspace=server -- ...' },
      { title: '下一季度质量计划', path: 'atlas-quality-system/docs/12-下一季度质量计划.md', audience: 'guardian', command: 'npm run quality:quarter-plan --workspace=server -- ...' },
    ],
  },
  {
    name: '检查清单',
    items: [
      { title: '每日开发检查清单', path: 'atlas-quality-system/checklists/每日开发检查清单.md', audience: 'pm' },
      { title: '提交代码前检查清单', path: 'atlas-quality-system/checklists/提交代码前检查清单.md', audience: 'engineer' },
      { title: '上线前检查清单', path: 'atlas-quality-system/checklists/上线前检查清单.md', audience: 'guardian' },
      { title: '生产事故应急清单', path: 'atlas-quality-system/checklists/生产事故应急清单.md', audience: 'guardian' },
      { title: '月度质量审计清单', path: 'atlas-quality-system/checklists/月度质量审计清单.md', audience: 'guardian' },
    ],
  },
  {
    name: '交接与持续执行',
    items: [
      { title: 'GLM 继续执行交接', path: 'atlas-quality-system/docs/38-GLM继续执行交接.md', audience: 'guardian' },
      { title: '进度看板自检故障速查', path: 'atlas-quality-system/docs/39-进度看板自检故障速查.md', audience: 'guardian', command: 'npm run quality:progress-guard --workspace=server' },
      { title: 'P2 团队执行包', path: 'atlas-quality-system/docs/40-P2团队执行包.md', audience: 'pm' },
    ],
  },
];

const requiredPaths = [
  'atlas-quality-system/docs/01-总体方案.md',
  'atlas-quality-system/docs/06-测试覆盖矩阵.md',
  'atlas-quality-system/docs/08-发布与应急Runbook.md',
  'atlas-quality-system/docs/09-月度质量审计报告.md',
  'atlas-quality-system/docs/10-前七周质量复盘.md',
  'atlas-quality-system/docs/11-质量回顾会材料包.md',
  'atlas-quality-system/docs/12-下一季度质量计划.md',
  'atlas-quality-system/docs/14-月度审计输入包.md',
  'atlas-quality-system/docs/15-月度审计执行记录.md',
  'atlas-quality-system/docs/16-质量行动项跟踪.md',
  'atlas-quality-system/docs/29-阻塞项接受记录.md',
  'atlas-quality-system/docs/30-阻塞项解决判断.md',
  'atlas-quality-system/docs/23-质量阻塞项登记.md',
  'atlas-quality-system/docs/24-Owner分派包.md',
  'atlas-quality-system/docs/25-证据Intake包.md',
  'atlas-quality-system/docs/26-收口执行顺序.md',
  'atlas-quality-system/docs/27-收口仪表盘.md',
  'atlas-quality-system/docs/28-收口简报.md',
  'atlas-quality-system/docs/31-收口一致性门禁.md',
  'atlas-quality-system/docs/32-收口证据包.md',
  'atlas-quality-system/docs/33-收口证据交接门禁.md',
  'atlas-quality-system/docs/34-收口剩余工作清单.md',
  'atlas-quality-system/docs/35-收口请求包.md',
  'atlas-quality-system/docs/36-100完成授权记录.md',
  'atlas-quality-system/docs/37-100后补证跟踪.md',
  'atlas-quality-system/docs/17-Week8收口门禁.md',
  'atlas-quality-system/docs/18-Week8团队交接包.md',
  'atlas-quality-system/docs/19-Week8确认回填.md',
  'atlas-quality-system/docs/20-团队确认登记.md',
  'atlas-quality-system/docs/21-Week8最终收口包.md',
  'atlas-quality-system/docs/22-进度看板自检.md',
  'atlas-quality-system/checklists/月度质量审计清单.md',
];

function main(): void {
  const index = buildQualityKnowledgeIndex({
    sections,
    requiredPaths,
  });

  console.log(JSON.stringify(index, null, 2));

  if (index.status !== 'READY') {
    process.exit(1);
  }
}

main();
