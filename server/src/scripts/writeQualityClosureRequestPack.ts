import { buildDefaultQualityClosureRequestPack } from '../utils/qualityClosureRequestPack';

function main(): void {
  const pack = buildDefaultQualityClosureRequestPack();

  console.log(JSON.stringify(pack, null, 2));

  if (pack.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
