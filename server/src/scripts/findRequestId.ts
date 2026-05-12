import { collectLogFiles, searchRequestIdInFiles } from '../utils/logSearch';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const positionalArgs = args.filter((arg) => arg !== '--json');
const [requestId, ...inputRoots] = positionalArgs;

if (!requestId) {
  console.error('Usage: npm run logs:request -- <requestId> [logDirOrFile ...] [--json]');
  process.exit(1);
}

const roots = inputRoots.length > 0 ? inputRoots : ['../.logs', 'src/logs', 'logs'];

async function main() {
  const files = collectLogFiles(roots);
  if (files.length === 0) {
    console.error(`No log files found under: ${roots.join(', ')}`);
    process.exit(2);
  }

  const result = await searchRequestIdInFiles(requestId, files);
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const match of result.matches) {
      console.log(`${match.file}:${match.lineNo}: ${match.line}`);
    }
  }

  if (result.totalMatches === 0) {
    console.error(`No log lines found for requestId: ${requestId}`);
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
