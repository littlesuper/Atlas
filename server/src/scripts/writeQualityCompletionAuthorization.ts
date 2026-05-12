import { QualityAcceptedRisk, buildQualityCompletionAuthorization } from '../utils/qualityCompletionAuthorization';

const defaultAcceptedRisks: QualityAcceptedRisk[] = [
  {
    item: '质量回顾会实会确认',
    owner: 'AI 代码守护人',
    evidenceRef: 'chat#2026-05-06-direct-to-100',
    followUp: '归档后补会议纪要',
  },
  {
    item: '分支保护和 PR 审查规则',
    owner: '产品负责人',
    evidenceRef: 'chat#2026-05-06-direct-to-100',
    followUp: '仓库管理员补 GitHub Settings 截图',
  },
  {
    item: 'rebase/merge 策略',
    owner: 'release owner',
    evidenceRef: 'chat#2026-05-06-direct-to-100',
    followUp: '归档后执行 merge 策略确认',
  },
];

function main(): void {
  const completion = buildQualityCompletionAuthorization({
    authorizedBy: '项目负责人',
    authorizedAt: '2026-05-06',
    authorizationRef: 'chat#2026-05-06-direct-to-100',
    finalClosureStatus: 'READY_TO_ARCHIVE',
    acceptedRisks: defaultAcceptedRisks,
    archiveActions: ['attach final closure JSON to monthly audit', 'start next-quarter quality cadence'],
  });

  console.log(JSON.stringify(completion, null, 2));

  if (completion.status !== 'COMPLETED') {
    process.exit(1);
  }
}

main();
