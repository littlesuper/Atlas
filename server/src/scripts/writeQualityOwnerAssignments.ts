import { QualityBlocker } from '../utils/qualityBlockerRegister';
import { buildQualityOwnerAssignmentPack } from '../utils/qualityOwnerAssignmentPack';

const defaultBlockers: QualityBlocker[] = [
  {
    item: '质量回顾会实会确认',
    owner: 'AI 代码守护人',
    impact: 'Week 8 action tracker、季度目标和 owner 无法最终确认',
    nextAction: '安排质量回顾会或取得书面确认',
    evidenceRequired: 'quality-review-minutes#2026-05-08',
    severity: 'HIGH',
    status: 'OPEN',
  },
  {
    item: '分支保护和 PR 审查规则',
    owner: '产品负责人',
    impact: 'Week 1/3 流程约束无法在远端仓库生效',
    nextAction: '由仓库管理员落地 GitHub Settings 并截图归档',
    evidenceRequired: 'github-settings#branch-protection',
    severity: 'HIGH',
    status: 'OPEN',
  },
  {
    item: 'rebase/merge 策略',
    owner: 'release owner',
    impact: 'main 落后远端 61 个提交，当前改动收口合并风险高',
    nextAction: '确认 rebase 或 merge 策略并记录到 release notes',
    evidenceRequired: 'release-notes#merge-plan',
    severity: 'MEDIUM',
    status: 'OPEN',
  },
];

function parseArgs(args: string[]): QualityBlocker[] {
  const blockers: QualityBlocker[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg !== '--blocker') {
      throw new Error(`Unknown argument: ${arg}`);
    }

    blockers.push(parseBlocker(requireValue(arg, value)));
    index += 1;
  }

  return blockers.length > 0 ? blockers : defaultBlockers;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseBlocker(value: string): QualityBlocker {
  const [item, owner, impact, nextAction, evidenceRequired, severity, status] = value.split('|').map((part) => part.trim());

  if (!item || !owner || !impact || !nextAction || !evidenceRequired || !severity || !status) {
    throw new Error('--blocker must use "item|owner|impact|nextAction|evidenceRequired|severity|status" format.');
  }

  if (!isSeverity(severity)) {
    throw new Error('--blocker severity must be HIGH, MEDIUM or LOW.');
  }

  if (!isStatus(status)) {
    throw new Error('--blocker status must be OPEN or CLEARED.');
  }

  return {
    item,
    owner,
    impact,
    nextAction,
    evidenceRequired,
    severity,
    status,
  };
}

function isSeverity(value: string): value is QualityBlocker['severity'] {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

function isStatus(value: string): value is QualityBlocker['status'] {
  return value === 'OPEN' || value === 'CLEARED';
}

function main(): void {
  const pack = buildQualityOwnerAssignmentPack({
    blockers: parseArgs(process.argv.slice(2)),
  });

  console.log(JSON.stringify(pack, null, 2));
}

main();
