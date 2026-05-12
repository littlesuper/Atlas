import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { buildQualityClosureConsistency, QualityClosureConsistencySurfaceInput } from '../utils/qualityClosureConsistency';

const requiredMarkers = [
  'QUALITY_BLOCKER_RESOLUTION',
  'quality:blocker-resolution',
  'RESOLVED',
  'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
  'quality:closure-evidence-handoff',
  'QUALITY_CLOSURE_REMAINING_WORK',
  'quality:closure-remaining-work',
  'QUALITY_CLOSURE_REQUEST_PACK',
  'quality:closure-request-pack',
  'READY',
];

const defaultSurfaces = [
  {
    name: 'closure sequence',
    paths: ['server/src/utils/qualityClosureSequence.ts', 'atlas-quality-system/docs/26-收口执行顺序.md'],
  },
  {
    name: 'closure dashboard',
    paths: ['server/src/utils/qualityClosureDashboard.ts', 'atlas-quality-system/docs/27-收口仪表盘.md'],
  },
  {
    name: 'closure brief',
    paths: [
      'server/src/utils/qualityClosureBrief.ts',
      'server/src/utils/qualityClosureDashboard.ts',
      'atlas-quality-system/docs/28-收口简报.md',
    ],
  },
  {
    name: 'final closure',
    paths: ['server/src/scripts/writeWeek8FinalClosure.ts', 'atlas-quality-system/docs/21-Week8最终收口包.md'],
  },
  {
    name: 'evidence intake',
    paths: ['server/src/utils/qualityEvidenceIntake.ts', 'atlas-quality-system/docs/25-证据Intake包.md'],
  },
  {
    name: 'progress board',
    paths: ['atlas-quality-system/PROJECT_PROGRESS.md'],
  },
];

export function getDefaultQualityClosureConsistencyInput(
  root: string,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): {
  requiredMarkers: string[];
  surfaces: QualityClosureConsistencySurfaceInput[];
} {
  return {
    requiredMarkers,
    surfaces: defaultSurfaces.map((surface) => ({
      name: surface.name,
      content: surface.paths.map((path) => readText(join(root, path))).join('\n'),
    })),
  };
}

function main(): void {
  const root = repoRootFromCwd(process.cwd());
  const consistency = buildQualityClosureConsistency({
    ...getDefaultQualityClosureConsistencyInput(root),
  });

  console.log(JSON.stringify(consistency, null, 2));

  if (consistency.status !== 'READY') {
    process.exit(1);
  }
}

function repoRootFromCwd(cwd: string): string {
  return basename(cwd) === 'server' ? dirname(cwd) : cwd;
}

if (require.main === module) {
  main();
}
