import { buildDefaultQualityClosureRemainingWork } from '../utils/qualityClosureRemainingWork';

function main(): void {
  const remaining = buildDefaultQualityClosureRemainingWork();

  console.log(JSON.stringify(remaining, null, 2));

  if (remaining.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
