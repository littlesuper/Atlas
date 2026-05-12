import { Week8FinalClosureArtifact, buildWeek8FinalClosure } from '../utils/week8FinalClosure';

const defaultArtifacts: Week8FinalClosureArtifact[] = [
  {
    name: 'knowledge index',
    mode: 'QUALITY_KNOWLEDGE_INDEX',
    status: 'READY',
    evidenceRef: 'npm run quality:knowledge-index --workspace=server',
  },
  {
    name: 'blocker resolution',
    mode: 'QUALITY_BLOCKER_RESOLUTION',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:blocker-resolution --workspace=server',
  },
  {
    name: 'closure consistency',
    mode: 'QUALITY_CLOSURE_CONSISTENCY',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:closure-consistency --workspace=server',
  },
  {
    name: 'closure evidence handoff',
    mode: 'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:closure-evidence-handoff --workspace=server',
  },
  {
    name: 'closure remaining work',
    mode: 'QUALITY_CLOSURE_REMAINING_WORK',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:closure-remaining-work --workspace=server',
  },
  {
    name: 'closure request pack',
    mode: 'QUALITY_CLOSURE_REQUEST_PACK',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:closure-request-pack --workspace=server',
  },
  {
    name: 'team confirmations',
    mode: 'TEAM_CONFIRMATION_REGISTER',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:team-confirmations --workspace=server -- --confirm ...',
  },
  {
    name: 'handoff confirmation',
    mode: 'WEEK8_HANDOFF_PACK',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:handoff-confirm --workspace=server -- --confirm ...',
  },
  {
    name: 'closure gate',
    mode: 'WEEK8_CLOSURE_GATE',
    status: 'ACTION_REQUIRED',
    evidenceRef: 'npm run quality:closure-gate --workspace=server',
  },
];

function parseArgs(args: string[]): {
  artifacts: Week8FinalClosureArtifact[];
  archiveActions: string[];
} {
  const artifacts: Week8FinalClosureArtifact[] = [];
  const archiveActions: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--artifact') {
      artifacts.push(parseArtifact(requireValue(arg, value)));
      index += 1;
      continue;
    }

    if (arg === '--archive-action') {
      archiveActions.push(requireValue(arg, value));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    artifacts: artifacts.length > 0 ? artifacts : defaultArtifacts,
    archiveActions: archiveActions.length > 0 ? archiveActions : [
      'attach final closure JSON to monthly audit',
      'start next-quarter quality cadence',
    ],
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseArtifact(value: string): Week8FinalClosureArtifact {
  const [name, mode, status, evidenceRef] = value.split('|').map((item) => item.trim());

  if (!name || !mode || !status || !evidenceRef) {
    throw new Error('--artifact must use "name|mode|status|evidenceRef" format.');
  }

  return { name, mode, status, evidenceRef };
}

function main(): void {
  const input = parseArgs(process.argv.slice(2));
  const closure = buildWeek8FinalClosure(input);

  console.log(JSON.stringify(closure, null, 2));

  if (closure.status !== 'READY_TO_ARCHIVE') {
    process.exit(1);
  }
}

main();
