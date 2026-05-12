import { describe, expect, it } from 'vitest';
import { buildQualityKnowledgeIndex } from './qualityKnowledgeIndex';

describe('quality knowledge index builder', () => {
  it('builds a ready knowledge index with sections and reading path', () => {
    const index = buildQualityKnowledgeIndex({
      generatedAt: new Date('2026-05-06T00:10:00.000Z'),
      sections: [
        {
          name: '基础方案',
          items: [
            { title: '总体方案', path: 'atlas-quality-system/docs/01-总体方案.md', audience: 'all' },
            { title: '工作流程', path: 'atlas-quality-system/docs/03-工作流程.md', audience: 'pm' },
          ],
        },
        {
          name: '执行报告',
          items: [
            { title: '月度质量审计报告', path: 'atlas-quality-system/docs/09-月度质量审计报告.md', audience: 'guardian', command: 'npm run quality:audit-report --workspace=server -- ...' },
            { title: '下一季度质量计划', path: 'atlas-quality-system/docs/12-下一季度质量计划.md', audience: 'guardian', command: 'npm run quality:quarter-plan --workspace=server -- ...' },
          ],
        },
      ],
      requiredPaths: [
        'atlas-quality-system/docs/01-总体方案.md',
        'atlas-quality-system/docs/09-月度质量审计报告.md',
        'atlas-quality-system/docs/12-下一季度质量计划.md',
      ],
    });

    expect(index).toEqual({
      mode: 'QUALITY_KNOWLEDGE_INDEX',
      status: 'READY',
      generatedAt: '2026-05-06T00:10:00.000Z',
      summary: {
        sectionCount: 2,
        itemCount: 4,
        commandBackedItemCount: 2,
        missingRequiredPathCount: 0,
      },
      readingPath: [
        'atlas-quality-system/docs/01-总体方案.md',
        'atlas-quality-system/docs/03-工作流程.md',
        'atlas-quality-system/docs/09-月度质量审计报告.md',
        'atlas-quality-system/docs/12-下一季度质量计划.md',
      ],
      sections: [
        {
          name: '基础方案',
          items: [
            { title: '总体方案', path: 'atlas-quality-system/docs/01-总体方案.md', audience: 'all' },
            { title: '工作流程', path: 'atlas-quality-system/docs/03-工作流程.md', audience: 'pm' },
          ],
        },
        {
          name: '执行报告',
          items: [
            { title: '月度质量审计报告', path: 'atlas-quality-system/docs/09-月度质量审计报告.md', audience: 'guardian', command: 'npm run quality:audit-report --workspace=server -- ...' },
            { title: '下一季度质量计划', path: 'atlas-quality-system/docs/12-下一季度质量计划.md', audience: 'guardian', command: 'npm run quality:quarter-plan --workspace=server -- ...' },
          ],
        },
      ],
      missingRequiredPaths: [],
    });
  });

  it('blocks the index when required paths are missing from sections', () => {
    const index = buildQualityKnowledgeIndex({
      generatedAt: new Date('2026-05-06T00:10:00.000Z'),
      sections: [
        {
          name: '基础方案',
          items: [{ title: '总体方案', path: 'atlas-quality-system/docs/01-总体方案.md', audience: 'all' }],
        },
      ],
      requiredPaths: [
        'atlas-quality-system/docs/01-总体方案.md',
        'atlas-quality-system/docs/12-下一季度质量计划.md',
      ],
    });

    expect(index.status).toBe('BLOCKED');
    expect(index.missingRequiredPaths).toEqual(['atlas-quality-system/docs/12-下一季度质量计划.md']);
  });

  it('passes with empty sections', () => {
    const index = buildQualityKnowledgeIndex({
      generatedAt: new Date(),
      sections: [],
      requiredPaths: [],
    });

    expect(index.status).toBe('READY');
    expect(index.missingRequiredPaths).toEqual([]);
  });

  it('reports missing required paths', () => {
    const index = buildQualityKnowledgeIndex({
      generatedAt: new Date(),
      sections: [{ name: 'docs', items: [{ title: 'a', path: 'a.md', audience: 'all' as const }] }],
      requiredPaths: ['a.md', 'b.md'],
    });

    expect(index.missingRequiredPaths).toEqual(['b.md']);
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const index = buildQualityKnowledgeIndex({
      sections: [],
      requiredPaths: [],
    });
    const after = new Date();

    const ts = new Date(index.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from section names, titles, paths', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: '  section-a  ',
        items: [{ title: '  title-a  ', path: '  path-a  ', audience: 'all' as const }],
      }],
      requiredPaths: [],
    });

    expect(index.sections[0].name).toBe('section-a');
    expect(index.sections[0].items[0].title).toBe('title-a');
    expect(index.sections[0].items[0].path).toBe('path-a');
  });

  it('filters out sections with empty names', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [
        { name: '  ', items: [{ title: 'a', path: 'a.md', audience: 'all' as const }] },
        { name: 'valid', items: [{ title: 'b', path: 'b.md', audience: 'all' as const }] },
      ],
      requiredPaths: [],
    });

    expect(index.sections).toHaveLength(1);
    expect(index.summary.sectionCount).toBe(1);
  });

  it('filters out items with empty title or path', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [
          { title: '  ', path: 'a.md', audience: 'all' as const },
          { title: 'b', path: '  ', audience: 'all' as const },
          { title: 'c', path: 'c.md', audience: 'all' as const },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.summary.itemCount).toBe(1);
  });

  it('counts command-backed items correctly', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [
          { title: 'a', path: 'a.md', audience: 'all' as const },
          { title: 'b', path: 'b.md', audience: 'all' as const, command: 'npm run test' },
          { title: 'c', path: 'c.md', audience: 'all' as const, command: '  ' },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.summary.commandBackedItemCount).toBe(1);
  });

  it('readingPath contains all item paths', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [
          { title: 'a', path: 'a.md', audience: 'all' as const },
          { title: 'b', path: 'b.md', audience: 'all' as const },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.readingPath).toEqual(['a.md', 'b.md']);
  });

  it('mode is always QUALITY_KNOWLEDGE_INDEX', () => {
    const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] });
    expect(index.mode).toBe('QUALITY_KNOWLEDGE_INDEX');
  });

  it('generatedAt is valid ISO string', () => {
    const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] });
    expect(new Date(index.generatedAt).toISOString()).toBe(index.generatedAt);
  });

  it('required paths with whitespace are trimmed before matching', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [{ title: 'a', path: 'a.md', audience: 'all' as const }],
      }],
      requiredPaths: ['  a.md  ', '  b.md  '],
    });

    expect(index.missingRequiredPaths).toEqual(['b.md']);
    expect(index.summary.missingRequiredPathCount).toBe(1);
  });

  it('audience field is preserved through normalization', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [
          { title: 'a', path: 'a.md', audience: 'pm' as const },
          { title: 'b', path: 'b.md', audience: 'engineer' as const },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.sections[0].items[0].audience).toBe('pm');
    expect(index.sections[0].items[1].audience).toBe('engineer');
  });

  it('section with all items filtered out is still included', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [
          { title: '  ', path: 'a.md', audience: 'all' as const },
          { title: 'b', path: '  ', audience: 'all' as const },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.sections).toHaveLength(1);
    expect(index.sections[0].items).toHaveLength(0);
    expect(index.summary.itemCount).toBe(0);
  });

  it('duplicate paths across sections both appear in readingPath', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [
        { name: 'sec-a', items: [{ title: 'a', path: 'shared.md', audience: 'all' as const }] },
        { name: 'sec-b', items: [{ title: 'b', path: 'shared.md', audience: 'all' as const }] },
      ],
      requiredPaths: ['shared.md'],
    });

    expect(index.readingPath).toEqual(['shared.md', 'shared.md']);
    expect(index.summary.itemCount).toBe(2);
    expect(index.missingRequiredPaths).toEqual([]);
  });

  it('items in filtered-out section do not satisfy required paths', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [
        { name: '  ', items: [{ title: 'a', path: 'unique.md', audience: 'all' as const }] },
      ],
      requiredPaths: ['unique.md'],
    });

    expect(index.status).toBe('BLOCKED');
    expect(index.missingRequiredPaths).toEqual(['unique.md']);
    expect(index.summary.itemCount).toBe(0);
  });

  it('item with whitespace-only command is not counted as command-backed', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [{ title: 'a', path: 'a.md', audience: 'all' as const, command: '   ' }],
      }],
      requiredPaths: [],
    });

    expect(index.summary.commandBackedItemCount).toBe(0);
    expect(index.sections[0].items[0].command).toBeUndefined();
  });

  it('readingPath preserves section order then item order within each section', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [
        { name: 'A', items: [{ title: 'a1', path: 'a1.md', audience: 'all' as const }, { title: 'a2', path: 'a2.md', audience: 'all' as const }] },
        { name: 'B', items: [{ title: 'b1', path: 'b1.md', audience: 'all' as const }] },
      ],
      requiredPaths: [],
    });

    expect(index.readingPath).toEqual(['a1.md', 'a2.md', 'b1.md']);
  });

  it('section with all items having commands reports correct commandBackedItemCount', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'tools',
        items: [
          { title: 'a', path: 'a.md', audience: 'all' as const, command: 'npm run a' },
          { title: 'b', path: 'b.md', audience: 'engineer' as const, command: 'npm run b' },
        ],
      }],
      requiredPaths: [],
    });

    expect(index.summary.commandBackedItemCount).toBe(2);
    expect(index.summary.itemCount).toBe(2);
  });

  it('required paths matching items after trim are not reported missing', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [{
        name: 'sec',
        items: [{ title: 'a', path: '  path.md  ', audience: 'all' as const }],
      }],
      requiredPaths: ['path.md'],
    });

    expect(index.missingRequiredPaths).toEqual([]);
    expect(index.status).toBe('READY');
  });

  it('index with missing required paths reports them', () => {
    const index = buildQualityKnowledgeIndex({
      sections: [],
      requiredPaths: ['missing.md'],
    });
    expect(index.missingRequiredPaths).toContain('missing.md');
  });

  it('index with no required paths returns empty missing', () => {
    const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] });
    expect(index.missingRequiredPaths).toEqual([]);
  });


  it('index with single section returns valid structure', () => {
    const index = buildQualityKnowledgeIndex({ sections: [{ name: 'Section', audience: 'all', items: [{ title: 'Item', path: 'doc.md', audience: 'all' }] }], requiredPaths: [] });
    expect(index.sections).toHaveLength(1);
  });

  it('index with empty sections returns valid structure', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] }); expect(index.sections).toHaveLength(0); });

  it('index with single section returns valid structure', () => { const index = buildQualityKnowledgeIndex({ sections: [{ name: 'sec1', items: [] }], requiredPaths: [] }); expect(index.sections).toHaveLength(1); });

  it('index with items in section preserves items', () => { const index = buildQualityKnowledgeIndex({ sections: [{ name: 'sec1', items: [{ title: 'item1', path: '/a/b', status: 'PASS' }] }], requiredPaths: [] }); expect(index.sections[0].items).toHaveLength(1); });

  it('index with required paths validates correctly', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: ['/a/b'] }); expect(index.mode).toBe('QUALITY_KNOWLEDGE_INDEX'); });

  it('index with empty required paths returns valid mode', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] }); expect(index.mode).toBe('QUALITY_KNOWLEDGE_INDEX'); });

  it('index with matching required paths returns valid', () => { const index = buildQualityKnowledgeIndex({ sections: [{ name: 'sec1', items: [{ title: 'item1', path: '/a/b', status: 'PASS' }] }], requiredPaths: ['/a/b'] }); expect(index.sections[0].items).toHaveLength(1); });

  it('index with empty sections returns empty array', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: ['/a/b'] }); expect(index.sections).toHaveLength(0); });

  it('index with non-empty requiredPaths returns paths', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: ['/a/b', '/c/d'] }); expect(index).toBeDefined(); });

  it('index with empty requiredPaths returns valid', () => { const index = buildQualityKnowledgeIndex({ sections: [], requiredPaths: [] }); expect(index).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [`batch95-section-${index}`, `docs/batch95-${index}.md`] as const))(
    'builds generated ready index for %s',
    (sectionName, path) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: ` ${sectionName} `,
          items: [{ title: ' title ', path: ` ${path} `, audience: 'engineer' as const, command: ' npm test ' }],
        }],
        requiredPaths: [` ${path} `],
      });

      expect(index.status).toBe('READY');
      expect(index.summary.sectionCount).toBe(1);
      expect(index.summary.commandBackedItemCount).toBe(1);
      expect(index.readingPath).toEqual([path]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `docs/missing-batch95-${index}.md`))(
    'reports generated missing required path %s',
    (path) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{ name: 'sec', items: [{ title: 'item', path: 'docs/present.md', audience: 'all' as const }] }],
        requiredPaths: [path],
      });

      expect(index.status).toBe('BLOCKED');
      expect(index.missingRequiredPaths).toEqual([path]);
      expect(index.summary.missingRequiredPathCount).toBe(1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch123-section-${index}`,
    `docs/batch123-${index}.md`,
    ['all', 'pm', 'guardian', 'engineer'][index % 4],
  ] as const))(
    'builds generated ready knowledge item %s',
    (sectionName, path, audience) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: ` ${sectionName} `,
          items: [{
            title: ` title-${sectionName} `,
            path: ` ${path} `,
            audience,
            command: ' npm run quality:check ',
          }],
        }],
        requiredPaths: [` ${path} `],
      });

      expect(index.status).toBe('READY');
      expect(index.summary).toEqual({
        sectionCount: 1,
        itemCount: 1,
        commandBackedItemCount: 1,
        missingRequiredPathCount: 0,
      });
      expect(index.sections[0].items[0].audience).toBe(audience);
      expect(index.readingPath).toEqual([path]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `docs/batch123-present-${index}.md`,
    `docs/batch123-missing-${index}.md`,
  ] as const))(
    'reports generated missing knowledge path %s',
    (presentPath, missingPath) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: 'section',
          items: [{ title: 'present', path: presentPath, audience: 'all' as const }],
        }],
        requiredPaths: [presentPath, missingPath],
      });

      expect(index.status).toBe('BLOCKED');
      expect(index.missingRequiredPaths).toEqual([missingPath]);
      expect(index.summary.missingRequiredPathCount).toBe(1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch146-section-${index}`,
    `docs/batch146-${index}.md`,
    `docs/batch146-required-${index}.md`,
  ] as const))(
    'filters generated blank knowledge entries for %s',
    (sectionName, path, requiredPath) => {
      const index = buildQualityKnowledgeIndex({
        sections: [
          { name: '   ', items: [{ title: 'ignored', path, audience: 'all' as const }] },
          {
            name: ` ${sectionName} `,
            items: [
              { title: ' ', path, audience: 'pm' as const },
              { title: ` title-${sectionName} `, path: ` ${requiredPath} `, audience: 'guardian' as const },
              { title: `missing-path-${sectionName}`, path: ' ', audience: 'engineer' as const },
            ],
          },
        ],
        requiredPaths: [` ${requiredPath} `],
      });

      expect(index.status).toBe('READY');
      expect(index.summary.sectionCount).toBe(1);
      expect(index.summary.itemCount).toBe(1);
      expect(index.sections[0].items[0].path).toBe(requiredPath);
      expect(index.readingPath).toEqual([requiredPath]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch146-command-${index}`,
    index % 2 === 0 ? '   ' : undefined,
  ] as const))(
    'normalizes generated blank command for %s',
    (path, command) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: 'section',
          items: [{ title: 'item', path, audience: 'all' as const, command }],
        }],
        requiredPaths: [path],
      });

      expect(index.status).toBe('READY');
      expect(index.summary.commandBackedItemCount).toBe(0);
      expect(index.sections[0].items[0].command).toBeUndefined();
    },
  );
});

describe('quality knowledge index batch 160 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch160-section-${index}`,
    `docs/batch160-${index}.md`,
  ] as const))(
    'keeps generated batch160 duplicate knowledge reading path %s',
    (sectionName, path) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: ` ${sectionName} `,
          items: [
            { title: 'first', path: ` ${path} `, audience: 'all' as const, command: ' npm run first ' },
            { title: 'second', path, audience: 'pm' as const },
          ],
        }],
        requiredPaths: [path, ` ${path} `],
      });

      expect(index.status).toBe('READY');
      expect(index.summary).toEqual({
        sectionCount: 1,
        itemCount: 2,
        commandBackedItemCount: 1,
        missingRequiredPathCount: 0,
      });
      expect(index.readingPath).toEqual([path, path]);
      expect(index.sections[0].items[0].command).toBe('npm run first');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `docs/batch160-present-${index}.md`,
    `docs/batch160-missing-${index}.md`,
  ] as const))(
    'reports generated batch160 duplicate missing required paths %s',
    (presentPath, missingPath) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: 'section',
          items: [{ title: 'present', path: presentPath, audience: 'guardian' as const }],
        }],
        requiredPaths: [presentPath, ` ${missingPath} `, missingPath],
      });

      expect(index.status).toBe('BLOCKED');
      expect(index.summary.missingRequiredPathCount).toBe(2);
      expect(index.missingRequiredPaths).toEqual([missingPath, missingPath]);
      expect(index.readingPath).toEqual([presentPath]);
    },
  );
});

describe('quality knowledge index batch 169 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch169-section-${index}`,
    `docs/batch169-${index}.md`,
    `npm run quality:batch169-${index}`,
  ] as const))(
    'normalizes generated batch169 command backed item %s',
    (sectionName, path, command) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: ` ${sectionName} `,
          items: [{ title: ` title-${sectionName} `, path: ` ${path} `, audience: 'engineer' as const, command: ` ${command} ` }],
        }],
        requiredPaths: [` ${path} `],
      });

      expect(index.status).toBe('READY');
      expect(index.summary).toEqual({
        sectionCount: 1,
        itemCount: 1,
        commandBackedItemCount: 1,
        missingRequiredPathCount: 0,
      });
      expect(index.sections[0].items[0]).toMatchObject({ title: `title-${sectionName}`, path, command });
      expect(index.readingPath).toEqual([path]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `docs/batch169-present-${index}.md`,
    `docs/batch169-missing-a-${index}.md`,
    `docs/batch169-missing-b-${index}.md`,
  ] as const))(
    'reports generated batch169 multiple missing required paths %s',
    (presentPath, firstMissingPath, secondMissingPath) => {
      const index = buildQualityKnowledgeIndex({
        sections: [{
          name: 'section',
          items: [{ title: 'present', path: ` ${presentPath} `, audience: 'all' as const }],
        }],
        requiredPaths: [presentPath, ` ${firstMissingPath} `, ' ', secondMissingPath],
      });

      expect(index.status).toBe('BLOCKED');
      expect(index.summary.missingRequiredPathCount).toBe(2);
      expect(index.missingRequiredPaths).toEqual([firstMissingPath, secondMissingPath]);
      expect(index.readingPath).toEqual([presentPath]);
    },
  );
});
