import { QualityClosureDashboardCheck, buildDefaultQualityClosureDashboard, buildQualityClosureDashboard } from '../utils/qualityClosureDashboard';

function parseArgs(args: string[]): QualityClosureDashboardCheck[] {
  const checks: QualityClosureDashboardCheck[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg !== '--check') {
      throw new Error(`Unknown argument: ${arg}`);
    }

    checks.push(parseCheck(requireValue(arg, value)));
    index += 1;
  }

  return checks;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseCheck(value: string): QualityClosureDashboardCheck {
  const [name, mode, command, status, expectedStatus, nextAction] = value.split('|').map((part) => part.trim());

  if (!name || !mode || !command || !status || !expectedStatus || !nextAction) {
    throw new Error('--check must use "name|mode|command|status|expectedStatus|nextAction" format.');
  }

  return {
    name,
    mode,
    command,
    status,
    expectedStatus,
    nextAction,
  };
}

function main(): void {
  const checks = parseArgs(process.argv.slice(2));
  const dashboard = checks.length > 0
    ? buildQualityClosureDashboard({ checks })
    : buildDefaultQualityClosureDashboard();

  console.log(JSON.stringify(dashboard, null, 2));
}

main();
