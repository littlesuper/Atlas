import { buildQualityActionTracker } from '../utils/qualityActionTracker';

function main(): void {
  const tracker = buildQualityActionTracker({
    actions: [
      {
        task: '安排质量回顾会并确认团队 owner',
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        source: 'monthly audit run',
        status: 'OPEN',
      },
      {
        task: '规划 rebase/merge 策略',
        owner: 'release owner',
        dueDate: '2026-05-08',
        source: 'monthly audit run',
        status: 'OPEN',
      },
      {
        task: '确认分支保护和 PR 审查规则',
        owner: '产品负责人',
        dueDate: '2026-05-10',
        source: 'monthly audit run',
        status: 'BLOCKED',
        blocker: '需要仓库管理员权限',
      },
    ],
  });

  console.log(JSON.stringify(tracker, null, 2));

  if (tracker.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
