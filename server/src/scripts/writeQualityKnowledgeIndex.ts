import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildQualityKnowledgeIndex, findUnindexedDocs } from '../utils/qualityKnowledgeIndex';
import { sections, requiredPaths } from '../utils/qualityKnowledgeIndexData';

// 以源码位置（而非 cwd）锚定 repo 根：server/src/scripts -> ../../../
const DOCS_DIR = resolve(__dirname, '../../../atlas-quality-system/docs');
// 索引页自身不计入「待登记」
const INDEX_PAGE = '13-质量知识库导航.md';

function main(): void {
  const index = buildQualityKnowledgeIndex({
    sections,
    requiredPaths,
  });

  console.log(JSON.stringify(index, null, 2));

  // 漂移护栏：磁盘上的质量文档若未登记进索引，直接 BLOCKED（38/39/40 曾因此静默漂移）
  const onDisk = readdirSync(DOCS_DIR).filter((file) => file.endsWith('.md'));
  const unindexed = findUnindexedDocs(onDisk, sections, [INDEX_PAGE]);
  if (unindexed.length > 0) {
    console.error(
      '以下质量文档未登记进知识库索引（请在 src/utils/qualityKnowledgeIndexData.ts 的 sections 补登记）:',
      unindexed,
    );
    process.exit(1);
  }

  if (index.status !== 'READY') {
    process.exit(1);
  }
}

main();
