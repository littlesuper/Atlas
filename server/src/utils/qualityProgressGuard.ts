export type QualityProgressGuard = {
  mode: 'QUALITY_PROGRESS_GUARD';
  status: 'READY' | 'BLOCKED';
  generatedAt: string;
  summary: {
    dateMatched: boolean;
    week8Progress: number;
    requiredEvidence: number;
    matchedEvidence: number;
    requiredChangelog: number;
    matchedChangelog: number;
  };
  gaps: string[];
};

const PLACEHOLDER_TABLE_CELL_VALUES = new Set(['-', 'N/A', 'NA', 'N.A.', 'NONE', 'NOT APPLICABLE', 'NOT AVAILABLE', 'TBD', 'TODO', 'PENDING']);

export function buildQualityProgressGuard(input: {
  content: string;
  requiredDate: string;
  minWeek8Progress: number;
  requiredEvidenceMarkers: string[];
  requiredChangelogMarkers: string[];
  generatedAt?: Date;
}): QualityProgressGuard {
  const inputIsValid = isRecord(input);
  const inputRecord: Record<string, unknown> = inputIsValid ? input : {};
  const rawContent = inputRecord.content;
  const contentIsValid = typeof rawContent === 'string';
  const content = contentIsValid ? stripLeadingBom(rawContent) : '';
  const evidenceSection = extractRequiredSection(content, '## 5. 最近验证证据', '## 6.', {
    duplicated: 'progress board verification evidence section is duplicated',
    missingStart: 'progress board verification evidence section is missing',
    missingEnd: 'progress board verification evidence section boundary is missing',
  });
  const nextExecutionSection = extractRequiredSection(content, '## 6. 下一步执行顺序', '## 7.', {
    duplicated: 'progress board next execution section is duplicated',
    missingStart: 'progress board next execution section is missing',
    missingEnd: 'progress board next execution section boundary is missing',
  });
  const overviewSection = extractRequiredSection(content, '## 1. 总览', '## 2.', {
    duplicated: 'progress board overview section is duplicated',
    missingStart: 'progress board overview section is missing',
    missingEnd: 'progress board overview section boundary is missing',
  });
  const changelogSection = extractRequiredTailSection(content, '## 7. 变更日志', {
    duplicated: 'progress board changelog section is duplicated',
    missingStart: 'progress board changelog section is missing',
  });
  const week8Progress = parseWeek8Progress(overviewSection.content);
  const requiredDate = parseRequiredDate(inputRecord.requiredDate);
  const passingEvidenceContent = extractPassingEvidenceContent(evidenceSection.content, requiredDate.error ? undefined : requiredDate.value);
  const progressBoardDate = parseProgressBoardDate(overviewSection.content, requiredDate.value);
  const dateMatched = !requiredDate.error && progressBoardDate.matched;
  const evidenceMarkers = normalizeMarkerList(
    inputRecord.requiredEvidenceMarkers,
    'verification evidence markers are invalid',
    'verification evidence marker is invalid',
  );
  const changelogMarkers = normalizeMarkerList(
    inputRecord.requiredChangelogMarkers,
    'changelog markers are invalid',
    'changelog marker is invalid',
  );
  const generatedAt = normalizeGeneratedAt(inputRecord.generatedAt);
  const matchedEvidence = evidenceMarkers.markers.filter((marker) => passingEvidenceContent.includes(marker)).length;
  const matchingChangelogContent = extractDatedTableRowContent(changelogSection.content, requiredDate.error ? undefined : requiredDate.value);
  const matchedChangelog = changelogMarkers.markers.filter((marker) => matchingChangelogContent.includes(marker)).length;
  const gaps = [
    ...buildInputGaps(inputIsValid),
    ...buildGeneratedAtGaps(generatedAt.errors),
    ...buildContentGaps(contentIsValid),
    ...buildSectionGaps(overviewSection.error),
    ...buildSectionGaps(evidenceSection.error),
    ...buildSectionGaps(nextExecutionSection.error),
    ...buildSectionGaps(changelogSection.error),
    ...buildDateGaps(dateMatched, requiredDate, progressBoardDate),
    ...buildProgressGaps(week8Progress, inputRecord.minWeek8Progress),
    ...buildMarkerListGaps(evidenceMarkers.errors),
    ...buildMarkerListGaps(changelogMarkers.errors),
    ...buildMissingMarkerGaps('verification evidence marker', evidenceMarkers.markers, passingEvidenceContent),
    ...buildMissingMarkerGaps('changelog marker', changelogMarkers.markers, matchingChangelogContent),
  ];

  return {
    mode: 'QUALITY_PROGRESS_GUARD',
    status: gaps.length > 0 ? 'BLOCKED' : 'READY',
    generatedAt: generatedAt.value.toISOString(),
    summary: {
      dateMatched,
      week8Progress: week8Progress.value,
      requiredEvidence: evidenceMarkers.markers.length,
      matchedEvidence,
      requiredChangelog: changelogMarkers.markers.length,
      matchedChangelog,
    },
    gaps,
  };
}

function stripLeadingBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

function extractPassingEvidenceContent(content: string, requiredDate?: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => isPassingEvidenceRow(parseMarkdownTableCells(line), requiredDate))
    .join('\n');
}

function isPassingEvidenceRow(cells: string[], requiredDate?: string): boolean {
  const date = cells[0] ?? '';
  const dateMatched = requiredDate === undefined || date === requiredDate;
  return (
    cells.length >= 4 &&
    hasMeaningfulTableCell(cells[1]) &&
    hasMeaningfulTableCell(cells[3]) &&
    hasInlineCodeCommandCell(cells[1]) &&
    dateMatched &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    isRealDate(date) &&
    cells[2]?.toUpperCase() === 'PASS'
  );
}

function hasInlineCodeCommandCell(value: string): boolean {
  const inlineCodeMatch = /^`+([\s\S]+?)`+(?:\s|$)/.exec(value);

  return Boolean(inlineCodeMatch && hasMeaningfulTableCell(inlineCodeMatch[1]?.trim()));
}

function hasMeaningfulTableCell(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !isPlaceholderTableCell(value);
}

function isPlaceholderTableCell(value: string): boolean {
  const normalized = unwrapInlineCodeCell(value).trim().toUpperCase();

  return PLACEHOLDER_TABLE_CELL_VALUES.has(normalized);
}

function unwrapInlineCodeCell(value: string): string {
  const inlineCodeMatch = /^`+([\s\S]*?)`+$/.exec(value);

  return inlineCodeMatch ? inlineCodeMatch[1] : value;
}

function extractDatedTableRowContent(content: string, requiredDate?: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => isDatedTableRow(parseMarkdownTableCells(line), requiredDate))
    .join('\n');
}

function isDatedTableRow(cells: string[], requiredDate?: string): boolean {
  const date = cells[0] ?? '';
  const dateMatched = requiredDate === undefined || date === requiredDate;
  return cells.length >= 3 && hasMeaningfulTableCell(cells[1]) && hasMeaningfulTableCell(cells[2]) && dateMatched && /^\d{4}-\d{2}-\d{2}$/.test(date) && isRealDate(date);
}

function parseMarkdownTableCells(line: string): string[] {
  if (!line.includes('|')) {
    return [];
  }

  const cells: string[] = [];
  let cell = '';
  let inlineCodeFenceLength = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '`') {
      let fenceLength = 1;
      while (line[index + fenceLength] === '`') {
        fenceLength += 1;
      }

      if (inlineCodeFenceLength === 0) {
        inlineCodeFenceLength = fenceLength;
      } else if (inlineCodeFenceLength === fenceLength) {
        inlineCodeFenceLength = 0;
      }

      cell += line.slice(index, index + fenceLength);
      index += fenceLength - 1;
      continue;
    }

    if (char === '|' && inlineCodeFenceLength === 0 && line[index - 1] !== '\\') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  if (cells[0] === '') {
    cells.shift();
  }
  if (cells[cells.length - 1] === '') {
    cells.pop();
  }

  return cells;
}

function extractRequiredSection(
  content: string,
  startMarker: string,
  endMarker: string,
  errors: { duplicated: string; missingStart: string; missingEnd: string },
): { content: string; error?: string } {
  const startIndex = findHeadingIndex(content, startMarker);

  if (startIndex === -1) {
    return { content: '', error: errors.missingStart };
  }

  const searchStart = startIndex + startMarker.length;
  const endIndex = findHeadingIndex(content, endMarker, searchStart);
  const nextStartIndex = findHeadingIndex(content, startMarker, searchStart);

  if (endIndex === -1) {
    return {
      content: content.slice(startIndex),
      error: nextStartIndex === -1 ? errors.missingEnd : errors.duplicated,
    };
  }

  return {
    content: content.slice(startIndex, endIndex),
    error: nextStartIndex === -1 ? undefined : errors.duplicated,
  };
}

function extractRequiredTailSection(
  content: string,
  startMarker: string,
  errors: { duplicated: string; missingStart: string },
): { content: string; error?: string } {
  const startIndex = findHeadingIndex(content, startMarker);

  if (startIndex === -1) {
    return { content: '', error: errors.missingStart };
  }

  const nextIndex = findHeadingIndex(content, startMarker, startIndex + startMarker.length);

  return {
    content: content.slice(startIndex),
    error: nextIndex === -1 ? undefined : errors.duplicated,
  };
}

function findHeadingIndex(content: string, marker: string, fromIndex = 0): number {
  let fenceMarker: { marker: string; length: number } | undefined;
  let lineStart = 0;

  while (lineStart <= content.length) {
    const lineEndIndex = content.indexOf('\n', lineStart);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, '');

    if (lineStart >= fromIndex && !fenceMarker && isHeadingLine(line, marker)) {
      return lineStart;
    }

    const nextFenceMarker = fenceMarker ? parseFenceClosingMarker(line) : parseFenceOpeningMarker(line);
    if (nextFenceMarker) {
      if (!fenceMarker) {
        fenceMarker = nextFenceMarker;
      } else if (nextFenceMarker.marker === fenceMarker.marker && nextFenceMarker.length >= fenceMarker.length) {
        fenceMarker = undefined;
      }
    }

    if (lineEndIndex === -1) {
      break;
    }

    lineStart = lineEndIndex + 1;
  }

  return -1;
}

function parseFenceOpeningMarker(line: string): { marker: string; length: number } | undefined {
  const fence = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);

  if (!fence) {
    return undefined;
  }

  if (fence[2][0] === '`' && fence[3].includes('`')) {
    return undefined;
  }

  return { marker: fence[2][0], length: fence[2].length };
}

function parseFenceClosingMarker(line: string): { marker: string; length: number } | undefined {
  const fence = line.match(/^( {0,3})(`{3,}|~{3,})[ \t]*$/);

  if (!fence) {
    return undefined;
  }

  return { marker: fence[2][0], length: fence[2].length };
}

function isHeadingLine(line: string, marker: string): boolean {
  const normalizedLine = stripLeadingBom(line);
  const heading = normalizedLine.match(/^ {0,3}(.*)$/);
  const headingText = heading ? heading[1] : normalizedLine;

  if (/\d+\.$/.test(marker)) {
    return headingText.startsWith(marker) && /^\s/.test(headingText.slice(marker.length));
  }

  return headingText.startsWith(marker) && isExactHeadingSuffix(headingText.slice(marker.length));
}

function isExactHeadingSuffix(suffix: string): boolean {
  return suffix.trim() === '' || /^\s+#+\s*$/.test(suffix);
}

function buildSectionGaps(error?: string): string[] {
  return error ? [error] : [];
}

function buildInputGaps(inputIsValid: boolean): string[] {
  return inputIsValid ? [] : ['progress board input is invalid'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildGeneratedAtGaps(errors: string[]): string[] {
  return errors;
}

function normalizeGeneratedAt(value: unknown): { value: Date; errors: string[] } {
  if (value === undefined) {
    return { value: new Date(), errors: [] };
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return { value: new Date(), errors: ['progress board generatedAt is invalid'] };
  }

  return { value, errors: [] };
}

function buildContentGaps(contentIsValid: boolean): string[] {
  return contentIsValid ? [] : ['progress board content is invalid'];
}

function parseProgressBoardDate(content: string, requiredDate: string): { matched: boolean; error?: string; errors?: string[] } {
  const dateLines = [...content.matchAll(/^\uFEFF? {0,3}\*\*当前日期\*\*：(.*?)\s*$/gm)];
  const dateValues = dateLines.map((line) => line[1].trim());
  const matched = dateValues.some((value) => value === requiredDate);

  if (dateLines.length === 0) {
    return { matched, error: 'progress board date line is missing' };
  }

  if (dateLines.length > 1) {
    return {
      matched,
      errors: ['progress board date line is duplicated', ...uniqueList(dateValues.flatMap((value) => buildProgressBoardDateValueGaps(value)))],
    };
  }

  const valueGaps = buildProgressBoardDateValueGaps(dateValues[0]);
  if (valueGaps.length > 0) {
    return { matched, error: valueGaps[0] };
  }

  return { matched };
}

function buildProgressBoardDateValueGaps(value: string): string[] {
  if (!value) {
    return ['progress board date value is missing'];
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return [`progress board date format is invalid: ${value}`];
  }

  if (!isRealDate(value)) {
    return [`progress board date value is invalid: ${value}`];
  }

  return [];
}

function parseWeek8Progress(content: string): { found: boolean; value: number; error?: string; errors?: string[] } {
  const progressLines = [...content.matchAll(/^\uFEFF? {0,3}Week 8\b.*$/gm)];

  if (progressLines.length > 1) {
    const values = progressLines.map((line) => parseWeek8ProgressLine(line[0]));
    const lineGaps = uniqueList(values.flatMap((value) => (value.error ? [value.error] : buildProgressValueGaps(value.value))));
    return {
      found: true,
      value: values[0].value,
      errors: ['Week 8 progress line is duplicated', ...lineGaps],
    };
  }

  if (progressLines.length === 1) {
    return { found: true, ...parseWeek8ProgressLine(progressLines[0][0]) };
  }

  return { found: false, value: 0 };
}

function parseWeek8ProgressLine(line: string): { value: number; error?: string } {
  const value = line.match(/^\uFEFF? {0,3}Week 8\s+\[([^\]]*)\]\s+(-?\d+(?:\.\d+)?)%(?:\s|$)/);

  if (!value) {
    return { value: 0, error: 'Week 8 progress value is missing' };
  }

  if (!value[1]) {
    return { value: Number(value[2]), error: 'Week 8 progress bar is missing' };
  }

  if (value[2].includes('.')) {
    return { value: Number(value[2]), error: `Week 8 progress value is invalid: ${value[2]}` };
  }

  if (/^-?0\d+/.test(value[2])) {
    return { value: Number(value[2]), error: `Week 8 progress value is invalid: ${value[2]}` };
  }

  if (!/^[#-]+$/.test(value[1])) {
    return { value: Number(value[2]), error: 'Week 8 progress bar is invalid' };
  }

  if (value[1].length !== 20) {
    return { value: Number(value[2]), error: `Week 8 progress bar length is invalid: ${value[1].length}` };
  }

  return { value: Number(value[2]) };
}

function parseRequiredDate(value: unknown): { value: string; error?: string } {
  if (typeof value !== 'string') {
    return { value: '', error: 'progress board required date is invalid' };
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return { value: '', error: 'progress board required date is blank' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `progress board required date format is invalid: ${normalizedValue}`,
    };
  }

  if (!isRealDate(normalizedValue)) {
    return {
      value: normalizedValue,
      error: `progress board required date value is invalid: ${normalizedValue}`,
    };
  }

  return { value: normalizedValue };
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) === false;
}

function buildDateGaps(
  dateMatched: boolean,
  requiredDate: { value: string; error?: string },
  progressBoardDate: { error?: string; errors?: string[] },
): string[] {
  const dateGaps = [
    ...(requiredDate.error ? [requiredDate.error] : []),
    ...(progressBoardDate.errors ?? (progressBoardDate.error ? [progressBoardDate.error] : [])),
  ];

  if (dateGaps.length > 0) {
    return dateGaps;
  }

  if (!requiredDate.value) {
    return ['progress board required date is blank'];
  }

  return dateMatched ? [] : [`progress board date is not updated: ${requiredDate.value}`];
}

function buildProgressGaps(
  progress: { found: boolean; value: number; error?: string; errors?: string[] },
  requiredProgress: unknown,
): string[] {
  const requiredProgressIsValid =
    typeof requiredProgress === 'number' &&
    Number.isInteger(requiredProgress) &&
    requiredProgress >= 0 &&
    requiredProgress <= 100;
  const requiredProgressGaps = requiredProgressIsValid
    ? []
    : [`Week 8 required progress threshold is invalid: ${formatRequiredProgressGapValue(requiredProgress)}`];

  if (!progress.found) {
    return ['Week 8 progress line is missing', ...requiredProgressGaps];
  }

  if (progress.errors && progress.errors.length > 0) {
    return [...progress.errors, ...requiredProgressGaps];
  }

  if ('error' in progress && progress.error) {
    return [progress.error, ...requiredProgressGaps];
  }

  const progressValueGaps = buildProgressValueGaps(progress.value);
  if (progressValueGaps.length > 0) {
    return [...progressValueGaps, ...requiredProgressGaps];
  }

  if (requiredProgressGaps.length > 0) {
    return requiredProgressGaps;
  }

  const requiredProgressValue = requiredProgress as number;
  return progress.value >= requiredProgressValue ? [] : [`Week 8 progress is below required threshold: ${progress.value} < ${requiredProgressValue}`];
}

function buildProgressValueGaps(value: number): string[] {
  return !Number.isInteger(value) || value < 0 || value > 100 ? [`Week 8 progress value is invalid: ${value}`] : [];
}

function formatRequiredProgressGapValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : 'non-number';
}

function buildMissingMarkerGaps(label: string, markers: string[], section: string): string[] {
  return markers
    .filter((marker) => !section.includes(marker))
    .map((marker) => `${label} is missing: ${marker}`);
}

function buildMarkerListGaps(errors: string[]): string[] {
  return errors;
}

function normalizeMarkerList(values: unknown, invalidListError: string, invalidItemError: string): { markers: string[]; errors: string[] } {
  if (!Array.isArray(values)) {
    return { markers: [], errors: [invalidListError] };
  }

  const normalizedValues: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') {
      errors.push(invalidItemError);
      continue;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return { markers: normalizedValues, errors: uniqueList(errors) };
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values)];
}
