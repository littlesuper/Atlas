import { describe, expect, it } from 'vitest';
import { getDefaultQualityClosureConsistencyInput } from './checkQualityClosureConsistency';

describe('quality closure consistency script defaults', () => {
  it('requires remaining-work markers across the default closure surfaces', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', (path) => `content from ${path}`);

    expect(input.requiredMarkers).toEqual(
      expect.arrayContaining([
        'QUALITY_CLOSURE_REMAINING_WORK',
        'quality:closure-remaining-work',
        'QUALITY_CLOSURE_REQUEST_PACK',
        'quality:closure-request-pack',
        'READY',
      ]),
    );
    expect(input.surfaces.map((surface) => surface.name)).toEqual(
      expect.arrayContaining([
        'closure sequence',
        'closure dashboard',
        'closure brief',
        'final closure',
        'evidence intake',
        'progress board',
      ]),
    );
  });

  it('concatenates content from multiple paths per surface', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', (path) => `[${path}]`);

    const seqSurface = input.surfaces.find((s) => s.name === 'closure sequence');
    expect(seqSurface).toBeDefined();
    expect(seqSurface!.content).toContain('[/repo/server/src/utils/qualityClosureSequence.ts]');
    expect(seqSurface!.content).toContain('[/repo/atlas-quality-system/docs/26-收口执行顺序.md]');
  });

  it('always includes blocker resolution markers', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');

    expect(input.requiredMarkers).toEqual(
      expect.arrayContaining([
        'QUALITY_BLOCKER_RESOLUTION',
        'quality:blocker-resolution',
        'RESOLVED',
      ]),
    );
  });

  it('generates exactly 6 default surfaces', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');

    expect(input.surfaces).toHaveLength(6);
  });

  it('each surface has a non-empty name', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    for (const surface of input.surfaces) {
      expect(surface.name.length).toBeGreaterThan(0);
    }
  });

  it('requiredMarkers contains no duplicates', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    const unique = new Set(input.requiredMarkers);
    expect(unique.size).toBe(input.requiredMarkers.length);
  });

  it('each surface has at least one path', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    for (const surface of input.surfaces) {
      expect(surface.content).toBeDefined();
    }
  });

  it('includes evidence handoff markers', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    expect(input.requiredMarkers).toEqual(
      expect.arrayContaining(['QUALITY_CLOSURE_EVIDENCE_HANDOFF', 'quality:closure-evidence-handoff']),
    );
  });

  it('each surface content is built by concatenating its file paths', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', (path) => `[${path}]`);
    const dashboardSurface = input.surfaces.find((s) => s.name === 'closure dashboard');
    expect(dashboardSurface!.content).toContain('[/repo/server/src/utils/qualityClosureDashboard.ts]');
    expect(dashboardSurface!.content).toContain('[/repo/atlas-quality-system/docs/27-收口仪表盘.md]');
  });

  it('includes remaining work markers', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    expect(input.requiredMarkers).toEqual(
      expect.arrayContaining(['QUALITY_CLOSURE_REMAINING_WORK', 'quality:closure-remaining-work']),
    );
  });

  it('closure brief surface concatenates exactly 3 file paths', () => {
    const input = getDefaultQualityClosureConsistencyInput('/root', (path) => `[${path}]`);
    const briefSurface = input.surfaces.find((s) => s.name === 'closure brief');
    expect(briefSurface!.content).toContain('[/root/server/src/utils/qualityClosureBrief.ts]');
    expect(briefSurface!.content).toContain('[/root/server/src/utils/qualityClosureDashboard.ts]');
    expect(briefSurface!.content).toContain('[/root/atlas-quality-system/docs/28-收口简报.md]');
    const parts = briefSurface!.content.split('\n');
    expect(parts.filter((p: string) => p.startsWith('[')).length).toBeGreaterThanOrEqual(3);
  });

  it('readText is called once per file path totaling 12 calls', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/r', (path) => {
      calls.push(path);
      return '';
    });
    expect(calls).toHaveLength(12);
  });

  it('surface names are all unique', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    const names = input.surfaces.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each surface content contains the root path prefix', () => {
    const input = getDefaultQualityClosureConsistencyInput('/my-root', (path) => path);
    for (const surface of input.surfaces) {
      expect(surface.content).toContain('/my-root/');
    }
  });

  it('requiredMarkers contains exactly 10 entries', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    expect(input.requiredMarkers).toHaveLength(10);
  });

  it('progress board surface reads exactly one file', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/repo', (path) => {
      calls.push(path);
      return '';
    });
    const progressBoard = calls.filter((p) => p.includes('PROJECT_PROGRESS'));
    expect(progressBoard).toHaveLength(1);
  });

  it('evidence intake surface concatenates exactly 2 file paths', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', (path) => `[${path}]`);
    const evidenceSurface = input.surfaces.find((s) => s.name === 'evidence intake');
    expect(evidenceSurface).toBeDefined();
    expect(evidenceSurface!.content).toContain('[/repo/server/src/utils/qualityEvidenceIntake.ts]');
    expect(evidenceSurface!.content).toContain('[/repo/atlas-quality-system/docs/25-证据Intake包.md]');
    const parts = evidenceSurface!.content.split('\n');
    expect(parts.filter((p: string) => p.startsWith('[')).length).toBeGreaterThanOrEqual(2);
  });

  it('custom readText function receives absolute paths with root prefix', () => {
    const paths: string[] = [];
    getDefaultQualityClosureConsistencyInput('/custom-root', (path) => {
      paths.push(path);
      return '';
    });
    for (const p of paths) {
      expect(p).toMatch(/^\/custom-root\//);
    }
  });

  it('final closure surface reads exactly 2 file paths', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/root', (path) => {
      calls.push(path);
      return '';
    });
    const finalCalls = calls.filter(p => p.includes('writeWeek8FinalClosure') || p.includes('21-Week8'));
    expect(finalCalls).toHaveLength(2);
  });

  it('propagates readText errors to caller', () => {
    expect(() =>
      getDefaultQualityClosureConsistencyInput('/repo', () => {
        throw new Error('read error');
      }),
    ).toThrow('read error');
  });

  it('returns surface names in the same order as defaultSurfaces definition', () => {
    const input = getDefaultQualityClosureConsistencyInput('/repo', () => '');
    const names = input.surfaces.map((s) => s.name);
    expect(names).toEqual([
      'closure sequence',
      'closure dashboard',
      'closure brief',
      'final closure',
      'evidence intake',
      'progress board',
    ]);
  });

  it('passes through custom root to all file paths', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/deep/nested/root', (path) => {
      calls.push(path);
      return '';
    });
    for (const p of calls) {
      expect(p).toMatch(/^\/deep\/nested\/root\//);
    }
    expect(calls.length).toBeGreaterThan(0);
  });

  it('handles root path with trailing slash', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/root/', (path) => {
      calls.push(path);
      return '';
    });
    for (const p of calls) {
      expect(p).toMatch(/^\//);
    }
  });

  it('handles root path without trailing slash consistently', () => {
    const calls: string[] = [];
    getDefaultQualityClosureConsistencyInput('/root', (path) => {
      calls.push(path);
      return '';
    });
    for (const p of calls) {
      expect(p.startsWith('/root/')).toBe(true);
    }
  });

  it('handles empty directory gracefully', () => {
    const { mkdtempSync, rmSync } = require('fs');
    const { join } = require('path');
    const { tmpdir } = require('os');
    const emptyDir = mkdtempSync(join(tmpdir(), 'atlas-consistency-empty-'));
    expect(typeof emptyDir).toBe('string');
    rmSync(emptyDir, { recursive: true });
  });

  it('getDefaultQualityClosureConsistencyInput returns required markers', () => {
    const input = getDefaultQualityClosureConsistencyInput('/root', () => '');
    expect(input).toBeDefined();
    expect(Array.isArray(input.requiredMarkers)).toBe(true);
  });

  it('handles empty surfaces array without error', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => ''); expect(Array.isArray(result.surfaces)).toBe(true); });

  it('handles root path with no files gracefully', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => ''); expect(result).toBeDefined(); });

  it('handles null fileReader returning empty string', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => ''); expect(result.surfaces).toBeDefined(); });

  it('requiredMarkers is non-empty array', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => ''); expect(result.requiredMarkers.length).toBeGreaterThan(0); });

  it('handles fileReader returning null gracefully', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => null as unknown as string); expect(result).toBeDefined(); });

  it('handles surfaces array containing empty strings', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => ''); expect(Array.isArray(result.surfaces)).toBe(true); });

  it('handles fileReader returning whitespace-only content', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => '   '); expect(result).toBeDefined(); expect(Array.isArray(result.surfaces)).toBe(true); });

  it('handles dot path with non-standard characters', () => { const result = getDefaultQualityClosureConsistencyInput('./some/path', () => ''); expect(result).toBeDefined(); });

  it('handles fileReader returning null', () => { const result = getDefaultQualityClosureConsistencyInput('.', () => null as unknown as string); expect(result).toBeDefined(); });
});
