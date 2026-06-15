import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { KnowledgeIndexSection, buildQualityKnowledgeIndex, findUnindexedDocs } from './qualityKnowledgeIndex';
import { sections, requiredPaths } from './qualityKnowledgeIndexData';

// server/src/utils -> ../../../ = repo 根
const DOCS_DIR = resolve(__dirname, '../../../atlas-quality-system/docs');
const INDEX_PAGE = '13-质量知识库导航.md';

describe('质量知识库索引漂移护栏', () => {
  it('atlas-quality-system/docs 下每个 *.md 都已登记进预置索引（索引页自身除外）', () => {
    const onDisk = readdirSync(DOCS_DIR).filter((file) => file.endsWith('.md'));
    const unindexed = findUnindexedDocs(onDisk, sections, [INDEX_PAGE]);
    // 若失败：把列出的文件登记进 qualityKnowledgeIndexData.ts 的 sections
    expect(unindexed).toEqual([]);
  });

  it('预置索引构建为 READY（requiredPaths 全部命中 knownPaths）', () => {
    const index = buildQualityKnowledgeIndex({
      sections,
      requiredPaths,
      generatedAt: new Date('2026-06-15T00:00:00.000Z'),
    });
    expect(index.status).toBe('READY');
    expect(index.summary.missingRequiredPathCount).toBe(0);
  });
});

describe('findUnindexedDocs', () => {
  const fixtureSections: KnowledgeIndexSection[] = [
    {
      name: 'x',
      items: [
        { title: 'a', path: 'atlas-quality-system/docs/01-a.md', audience: 'all' },
        { title: 'b', path: 'atlas-quality-system/docs/02-b.md', audience: 'all' },
      ],
    },
  ];

  it('返回磁盘有、索引无的文件名', () => {
    expect(findUnindexedDocs(['01-a.md', '02-b.md', '03-c.md'], fixtureSections)).toEqual(['03-c.md']);
  });

  it('排除名单内的文件不算漏登记', () => {
    expect(findUnindexedDocs(['03-c.md'], fixtureSections, ['03-c.md'])).toEqual([]);
  });

  it('全部已登记时返回空数组', () => {
    expect(findUnindexedDocs(['01-a.md', '02-b.md'], fixtureSections)).toEqual([]);
  });
});
