import { buildMonthlyAuditInputPack } from '../utils/monthlyAuditInputPack';
import { buildMonthlyAuditRun } from '../utils/monthlyAuditRun';

function parseMonth(args: string[]): string {
  const index = args.indexOf('--month');
  if (index === -1) {
    return '2026-05';
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Missing value for --month');
  }

  return value;
}

function main(): void {
  const month = parseMonth(process.argv.slice(2));
  const inputPack = buildMonthlyAuditInputPack({
    month,
    requiredEvidence: ['lint', 'server typecheck', 'high audit', 'knowledge index'],
    evidence: [
      { id: 'lint', command: 'npm run lint', status: 'PASS', note: 'ESLint 0 errors / 0 warnings' },
      { id: 'server typecheck', command: 'npm run typecheck --workspace=server -- --pretty false', status: 'PASS' },
      { id: 'high audit', command: 'npm audit --audit-level=high', status: 'PASS', note: 'high/critical = 0; moderate risk registered' },
      { id: 'knowledge index', command: 'npm run quality:knowledge-index --workspace=server', status: 'PASS', note: '18 knowledge items; 7 command-backed items' },
    ],
    risks: [
      { title: 'main 落后远端 61 个提交', severity: 'HIGH', owner: 'release owner' },
      { title: '团队侧流程未确认', severity: 'MEDIUM', owner: 'AI 代码守护人' },
      { title: 'exceljs -> uuid moderate transitive vulnerability', severity: 'LOW', owner: 'dependency owner' },
    ],
    actionItems: [
      { task: '安排质量回顾会并确认团队 owner', owner: 'AI 代码守护人', dueDate: '2026-05-08' },
      { task: '规划 rebase/merge 策略', owner: 'release owner', dueDate: '2026-05-08' },
      { task: '确认分支保护和 PR 审查规则', owner: '产品负责人', dueDate: '2026-05-10' },
    ],
  });
  const run = buildMonthlyAuditRun({
    inputPack,
    overallProgress: 99,
    currentFocus: 'Week 8 体系巩固',
    completedWeeks: ['Week 2', 'Week 4', 'Week 5', 'Week 7'],
  });

  console.log(JSON.stringify(run, null, 2));

  if (run.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
