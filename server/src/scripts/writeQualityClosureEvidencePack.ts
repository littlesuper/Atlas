import { QualityClosureEvidenceRequirementInput, buildQualityClosureEvidencePack } from '../utils/qualityClosureEvidencePack';

const defaultRequirements: QualityClosureEvidenceRequirementInput[] = [
  {
    topic: '质量回顾会实会确认',
    owner: 'AI 代码守护人',
    dueDate: '2026-05-08',
    decisionTemplate: '确认 Week 8 action tracker 和季度目标',
    evidenceRefTemplate: 'quality-review-minutes#2026-05-08',
  },
  {
    topic: '分支保护和 PR 审查规则',
    owner: '产品负责人',
    dueDate: '2026-05-10',
    decisionTemplate: '确认 GitHub Settings 已落地',
    evidenceRefTemplate: 'github-settings#branch-protection',
  },
  {
    topic: 'rebase/merge 策略',
    owner: 'release owner',
    dueDate: '2026-05-08',
    decisionTemplate: '确认 main 落后提交的收口策略',
    evidenceRefTemplate: 'release-notes#merge-plan',
  },
];

function main(): void {
  const pack = buildQualityClosureEvidencePack({
    requirements: defaultRequirements,
  });

  console.log(JSON.stringify(pack, null, 2));

  if (pack.status !== 'READY') {
    process.exit(1);
  }
}

main();
