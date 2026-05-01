#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SUMMARY_PATH = 'server/coverage/coverage-summary.json';

const CORE_MODULES = [
  {
    rank: 1,
    name: 'Auth and token lifecycle',
    files: ['server/src/routes/auth.ts', 'server/src/middleware/auth.ts'],
  },
  {
    rank: 2,
    name: 'RBAC, users, roles, role binding',
    files: [
      'server/src/routes/users.ts',
      'server/src/routes/roles.ts',
      'server/src/routes/roleMembers.ts',
      'server/src/utils/roleMembershipResolver.ts',
    ],
  },
  {
    rank: 3,
    name: 'Project lifecycle and snapshots',
    files: ['server/src/routes/projects.ts'],
  },
  {
    rank: 4,
    name: 'Activities, scheduling, workdays',
    files: [
      'server/src/routes/activities.ts',
      'server/src/utils/workday.ts',
      'server/src/utils/dependencyScheduler.ts',
      'server/src/utils/dependencyValidator.ts',
      'server/src/utils/criticalPath.ts',
    ],
  },
  {
    rank: 5,
    name: 'Activity Excel import parser',
    files: ['server/src/utils/excelActivityParser.ts'],
  },
  {
    rank: 6,
    name: 'Products and uploads',
    files: ['server/src/routes/products.ts', 'server/src/routes/uploads.ts'],
  },
  {
    rank: 7,
    name: 'Risk, AI fallback, risk items',
    files: [
      'server/src/routes/risk.ts',
      'server/src/routes/riskItems.ts',
      'server/src/utils/riskEngine.ts',
      'server/src/utils/aiClient.ts',
      'server/src/utils/circuitBreaker.ts',
    ],
  },
  {
    rank: 8,
    name: 'Weekly reports and sanitization',
    files: ['server/src/routes/weeklyReports.ts', 'server/src/utils/sanitize.ts'],
  },
  {
    rank: 9,
    name: 'Check items, comments, notifications',
    files: [
      'server/src/routes/checkItems.ts',
      'server/src/routes/activityComments.ts',
      'server/src/routes/notifications.ts',
    ],
  },
  {
    rank: 10,
    name: 'Security baseline and audit logs',
    files: [
      'server/src/routes/auditLogs.ts',
      'server/src/routes/uploads.ts',
      'server/src/middleware/permission.ts',
      'server/src/middleware/validate.ts',
    ],
  },
];

const METRICS = ['statements', 'branches', 'functions', 'lines'];

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function readCoverageSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(
      `Coverage summary not found: ${summaryPath}. Run "npm run test:coverage --workspace=server" first.`,
    );
  }

  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function findCoverageEntry(summary, relativeFile) {
  const normalizedFile = normalizePath(relativeFile);
  const match = Object.entries(summary).find(([key]) => normalizePath(key).endsWith(normalizedFile));
  return match?.[1] ?? null;
}

function sumCoverage(entries) {
  const totals = Object.fromEntries(
    METRICS.map((metric) => [metric, { total: 0, covered: 0, pct: 100 }]),
  );

  for (const entry of entries) {
    for (const metric of METRICS) {
      totals[metric].total += entry[metric].total;
      totals[metric].covered += entry[metric].covered;
    }
  }

  for (const metric of METRICS) {
    const { total, covered } = totals[metric];
    totals[metric].pct = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
  }

  return totals;
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function pad(value, width) {
  return String(value).padEnd(width, ' ');
}

function printTable(rows) {
  const widths = [4, 38, 5, 9, 9, 9, 9];
  const headers = ['Rank', 'Core module', 'Files', 'Stmts', 'Branch', 'Funcs', 'Lines'];
  const separator = widths.map((width) => '-'.repeat(width)).join('  ');

  console.log(headers.map((header, index) => pad(header, widths[index])).join('  '));
  console.log(separator);

  for (const row of rows) {
    console.log(
      [
        pad(row.rank, widths[0]),
        pad(row.name.slice(0, widths[1]), widths[1]),
        pad(row.files, widths[2]),
        pad(formatPct(row.coverage.statements.pct), widths[3]),
        pad(formatPct(row.coverage.branches.pct), widths[4]),
        pad(formatPct(row.coverage.functions.pct), widths[5]),
        pad(formatPct(row.coverage.lines.pct), widths[6]),
      ].join('  '),
    );
  }
}

const summary = readCoverageSummary(SUMMARY_PATH);
const missingFiles = [];
const rows = CORE_MODULES.map((module) => {
  const entries = [];

  for (const file of module.files) {
    const coverageEntry = findCoverageEntry(summary, file);
    if (coverageEntry) {
      entries.push(coverageEntry);
    } else {
      missingFiles.push(file);
    }
  }

  return {
    ...module,
    files: entries.length,
    coverage: sumCoverage(entries),
  };
});

const uniqueFiles = [...new Set(CORE_MODULES.flatMap((module) => module.files))];
const overallEntries = uniqueFiles
  .map((file) => findCoverageEntry(summary, file))
  .filter((entry) => entry !== null);
const overall = sumCoverage(overallEntries);

console.log('Atlas core module coverage report');
console.log(`Coverage summary: ${SUMMARY_PATH}`);
console.log(`Scope: ${overallEntries.length}/${uniqueFiles.length} unique backend core files`);
console.log('');
printTable(rows);
console.log('');
console.log(
  `Overall unique core files: statements ${formatPct(overall.statements.pct)}, branches ${formatPct(
    overall.branches.pct,
  )}, functions ${formatPct(overall.functions.pct)}, lines ${formatPct(overall.lines.pct)}`,
);
console.log('Mode: advisory report only. No threshold is enforced by this script.');

if (missingFiles.length > 0) {
  console.log('');
  console.log('Files missing from coverage summary:');
  for (const file of missingFiles) {
    console.log(`- ${file}`);
  }
}
