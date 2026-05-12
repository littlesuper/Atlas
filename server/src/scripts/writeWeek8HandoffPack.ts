import { buildWeek8HandoffPack } from '../utils/week8HandoffPack';

function main(): void {
  const pack = buildWeek8HandoffPack({
    items: [
      {
        topic: '质量回顾会实会确认',
        owner: 'AI 代码守护人',
        dueDate: '2026-05-08',
        status: 'PENDING',
        decisionRequired: '确认 Week 8 action tracker、closure gate 和季度质量目标',
      },
      {
        topic: '分支保护和 PR 审查规则',
        owner: '产品负责人',
        dueDate: '2026-05-10',
        status: 'BLOCKED',
        decisionRequired: '确认仓库管理员执行人并落地 GitHub Settings',
        blocker: '需要仓库管理员权限',
      },
      {
        topic: 'rebase/merge 策略',
        owner: 'release owner',
        dueDate: '2026-05-08',
        status: 'PENDING',
        decisionRequired: '确认 main 落后 61 个提交的收口策略',
      },
    ],
  });

  console.log(JSON.stringify(pack, null, 2));

  if (pack.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
