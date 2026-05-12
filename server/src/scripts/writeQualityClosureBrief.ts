import { buildDefaultQualityClosureBriefDashboard, buildQualityClosureBrief } from '../utils/qualityClosureBrief';

function main(): void {
  const brief = buildQualityClosureBrief({
    dashboard: buildDefaultQualityClosureBriefDashboard(),
  });

  console.log(JSON.stringify(brief, null, 2));
}

main();
