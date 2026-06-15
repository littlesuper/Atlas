export type KnowledgeAudience = 'all' | 'pm' | 'guardian' | 'engineer';

export type KnowledgeIndexItem = {
  title: string;
  path: string;
  audience: KnowledgeAudience;
  command?: string;
};

export type KnowledgeIndexSection = {
  name: string;
  items: KnowledgeIndexItem[];
};

export type QualityKnowledgeIndex = {
  mode: 'QUALITY_KNOWLEDGE_INDEX';
  status: 'READY' | 'BLOCKED';
  generatedAt: string;
  summary: {
    sectionCount: number;
    itemCount: number;
    commandBackedItemCount: number;
    missingRequiredPathCount: number;
  };
  readingPath: string[];
  sections: KnowledgeIndexSection[];
  missingRequiredPaths: string[];
};

export function buildQualityKnowledgeIndex(input: {
  sections: KnowledgeIndexSection[];
  requiredPaths: string[];
  generatedAt?: Date;
}): QualityKnowledgeIndex {
  const sections = input.sections.map(normalizeSection).filter((section) => section.name.length > 0);
  const items = sections.flatMap((section) => section.items);
  const knownPaths = new Set(items.map((item) => item.path));
  const missingRequiredPaths = normalizeList(input.requiredPaths).filter((path) => !knownPaths.has(path));

  return {
    mode: 'QUALITY_KNOWLEDGE_INDEX',
    status: missingRequiredPaths.length > 0 ? 'BLOCKED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      sectionCount: sections.length,
      itemCount: items.length,
      commandBackedItemCount: items.filter((item) => Boolean(item.command)).length,
      missingRequiredPathCount: missingRequiredPaths.length,
    },
    readingPath: items.map((item) => item.path),
    sections,
    missingRequiredPaths,
  };
}

function normalizeSection(section: KnowledgeIndexSection): KnowledgeIndexSection {
  return {
    name: section.name.trim(),
    items: section.items.map(normalizeItem).filter((item) => item.title.length > 0 && item.path.length > 0),
  };
}

function normalizeItem(item: KnowledgeIndexItem): KnowledgeIndexItem {
  return {
    title: item.title.trim(),
    path: item.path.trim(),
    audience: item.audience,
    command: item.command?.trim() || undefined,
  };
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

/**
 * 漂移护栏：返回「磁盘上存在、但未登记进索引 sections」的文档文件名。
 * 用于在测试/脚本里断言每个 atlas-quality-system/docs/*.md 都已纳入知识库索引
 * （38/39/40 曾因漏登记而静默漂移）。excludeBasenames 用于排除索引页自身。
 */
export function findUnindexedDocs(
  diskDocBasenames: string[],
  sections: KnowledgeIndexSection[],
  excludeBasenames: string[] = [],
): string[] {
  const indexed = new Set(
    sections.flatMap((section) => section.items.map((item) => lastPathSegment(item.path))),
  );
  const exclude = new Set(excludeBasenames);
  return diskDocBasenames.filter((name) => !exclude.has(name) && !indexed.has(name));
}

function lastPathSegment(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}
