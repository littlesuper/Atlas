import { buildDefaultWeek8ClosureGate } from '../utils/week8ClosureGate';

function main(): void {
  const gate = buildDefaultWeek8ClosureGate();

  console.log(JSON.stringify(gate, null, 2));

  if (gate.status === 'BLOCKED') {
    process.exit(1);
  }
}

main();
