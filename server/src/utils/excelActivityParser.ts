import ExcelJS from 'exceljs';

export interface ParsedDependency {
  seq: number;
  type: '0' | '1' | '2' | '3'; // FS / SS / FF / SF
  lag: number;
}

export interface ParsedActivity {
  seq?: number;
  name: string;
  type?: 'TASK' | 'MILESTONE' | 'PHASE';
  phase?: string;
  assigneeNames: string[];
  roleName?: string;
  planDuration?: number;
  planStartDate?: Date;
  planEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  status?: string;
  notes?: string;
  predecessors?: ParsedDependency[];
}

// 列识别关键词映射（顺序敏感：先匹配更具体的关键字）
const COLUMN_KEYWORDS: Array<[string, string[]]> = [
  ['seq', ['序号', 'ID', 'id']],
  ['predecessor', ['前置依赖', '前置', 'predecessor']],
  ['name', ['任务描述', '活动名称', '任务名称']],
  ['type', ['类型', 'type']],
  ['phase', ['阶段', 'phase']],
  ['role', ['角色', '角色名称', 'Role']],
  ['assignee', ['负责人', 'assignee']],
  ['duration', ['计划工期', '工期', 'duration']],
  ['planStart', ['计划开始', '开始时间', '开始日期']],
  ['planEnd', ['计划结束', '结束时间', '完成时间', '完成日期']],
  ['actualStart', ['实际开始']],
  ['actualEnd', ['实际结束', '实际完成']],
  ['status', ['任务状态', '状态', 'status']],
  ['notes', ['备注', 'notes']],
];

// 阶段映射：从 "1EVT阶段" / "3PVT阶段" 提取阶段名
function parsePhase(raw: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^\d*(EVT|DVT|PVT|MP)/i);
  return m ? m[1].toUpperCase() : raw.trim() || undefined;
}

// 类型映射：任务/里程碑/阶段 → enum
function parseType(raw: string): ParsedActivity['type'] | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/里程碑|milestone/i.test(s)) return 'MILESTONE';
  if (/^阶段$|phase/i.test(s)) return 'PHASE';
  if (/任务|task/i.test(s)) return 'TASK';
  if (/^(TASK|MILESTONE|PHASE)$/.test(s)) return s as ParsedActivity['type'];
  return undefined;
}

// 负责人解析："张三(Nick), 李四(Nick2)" → ["张三", "李四"]
function parseAssignees(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([^(（]+)/);
      return m ? m[1].trim() : s.trim();
    })
    .filter(Boolean);
}

// 状态映射
function parseStatus(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/完成/.test(s) && !/未完成/.test(s)) return 'COMPLETED'; // 「未完成」含子串「完成」但语义相反，须排除
  if (/进行中|进行/.test(s)) return 'IN_PROGRESS';
  if (/未开始|未启动/.test(s)) return 'NOT_STARTED';
  if (/暂停|挂起/.test(s)) return 'ON_HOLD';
  if (/已取消|取消/.test(s)) return 'CANCELLED';
  return undefined;
}

// 前置依赖解析："003FS+2, 005SS-1, 002" → ParsedDependency[]
function parsePredecessors(raw: string): ParsedDependency[] {
  if (!raw) return [];
  const typeMap: Record<string, '0' | '1' | '2' | '3'> = { FS: '0', SS: '1', FF: '2', SF: '3' };
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token): ParsedDependency | null => {
      const m = token.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i);
      if (!m) return null;
      const seq = parseInt(m[1], 10);
      if (!seq) return null;
      const type = typeMap[(m[2] || 'FS').toUpperCase()] || '0';
      const lag = m[3] ? parseInt(m[3], 10) : 0;
      return { seq, type, lag };
    })
    .filter((d): d is ParsedDependency => d !== null);
}

type WorkbookCellValue = ExcelJS.CellValue | undefined;

function isLegacyXls(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

function normalizeCellValue(value: WorkbookCellValue): unknown {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }

    if ('result' in value) {
      return normalizeCellValue(value.result as WorkbookCellValue);
    }

    if ('formula' in value && typeof value.formula === 'string') {
      return `=${value.formula}`;
    }
  }

  return String(value);
}

// Excel serial number → Date
function excelDateToJS(value: unknown): Date | undefined {
  if (value == null || value === '') return undefined;

  // 已经是 Date
  if (value instanceof Date) return value;

  // 数字 (Excel serial number)
  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const wholeDays = Math.floor(value);
    const fraction = value - wholeDays;
    const date = new Date(excelEpoch + wholeDays * 86400000 + Math.round(fraction * 86400000));
    if (!isNaN(date.getTime())) return date;
    return undefined;
  }

  // 字符串日期
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return undefined;
    // "2026年2月2日" → Date (UTC)
    const zhMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (zhMatch) {
      return new Date(Date.UTC(parseInt(zhMatch[1]), parseInt(zhMatch[2]) - 1, parseInt(zhMatch[3])));
    }
    // "YYYY-MM-DD" → UTC
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])));
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  return undefined;
}

/**
 * 自动识别表头行并映射列索引
 */
function detectColumns(sheet: ExcelJS.Worksheet): { headerRow: number; colMap: Record<string, number> } {
  const colMap: Record<string, number> = {};
  const maxRow = Math.max(sheet.rowCount, 1);
  const maxColumn = Math.max(sheet.columnCount, 1);

  // 扫描前 10 行找表头
  for (let r = 1; r <= Math.min(10, maxRow); r++) {
    let matchCount = 0;

    for (let c = 1; c <= maxColumn; c++) {
      const value = normalizeCellValue(sheet.getRow(r).getCell(c).value);
      if (!value) continue;
      const text = String(value).trim();

      for (const [field, keywords] of COLUMN_KEYWORDS) {
        if (colMap[field] !== undefined) continue; // already found
        for (const kw of keywords) {
          if (text.includes(kw)) {
            colMap[field] = c;
            matchCount++;
            break;
          }
        }
      }
    }

    // 至少匹配到 name 列就认为是表头行
    if (colMap['name'] !== undefined && matchCount >= 2) {
      return { headerRow: r, colMap };
    }

    // 如果匹配不够，重置再试下一行
    if (matchCount < 2) {
      Object.keys(colMap).forEach((k) => delete colMap[k]);
    }
  }

  // Fallback: 如果只匹配到 name，也返回
  if (colMap['name'] !== undefined) {
    return { headerRow: 1, colMap };
  }

  throw new Error('无法识别 Excel 表头，请确保包含"任务描述"或"活动名称"列');
}

/**
 * 解析 Excel 文件 buffer，返回活动列表
 */
export async function parseExcelActivities(buffer: Buffer): Promise<ParsedActivity[]> {
  if (isLegacyXls(buffer)) {
    throw new Error('为降低 Excel 解析安全风险，请将 .xls 文件另存为 .xlsx 后再导入');
  }

  const wb = new ExcelJS.Workbook();
  const workbookBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(workbookBuffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Excel 文件中没有工作表');
  const { headerRow, colMap } = detectColumns(sheet);
  const activities: ParsedActivity[] = [];

  const getCell = (r: number, c: number | undefined): unknown => {
    if (c === undefined) return undefined;
    return normalizeCellValue(sheet.getRow(r).getCell(c).value);
  };

  let fallbackSeq = 1;
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const name = getCell(r, colMap['name']);
    if (!name || String(name).trim() === '') continue; // 跳过空行

    const seqRaw = getCell(r, colMap['seq']);
    const seqNum = seqRaw != null && seqRaw !== ''
      ? parseInt(String(seqRaw).trim(), 10)
      : NaN;

    const activity: ParsedActivity = {
      seq: !isNaN(seqNum) && seqNum > 0 ? seqNum : fallbackSeq,
      name: String(name).trim(),
      type: parseType(String(getCell(r, colMap['type']) ?? '')),
      phase: parsePhase(String(getCell(r, colMap['phase']) ?? '')),
      assigneeNames: parseAssignees(String(getCell(r, colMap['assignee']) ?? '')),
      roleName: (() => { const v = getCell(r, colMap['role']); return v != null && String(v).trim() !== '' ? String(v).trim() : undefined; })(),
      planDuration: (() => {
        const v = getCell(r, colMap['duration']);
        if (v == null || v === '') return undefined;
        const n = Number(v);
        return isNaN(n) ? undefined : n;
      })(),
      planStartDate: excelDateToJS(getCell(r, colMap['planStart'])),
      planEndDate: excelDateToJS(getCell(r, colMap['planEnd'])),
      actualStartDate: excelDateToJS(getCell(r, colMap['actualStart'])),
      actualEndDate: excelDateToJS(getCell(r, colMap['actualEnd'])),
      status: parseStatus(String(getCell(r, colMap['status']) ?? '')),
      notes: (() => {
        const v = getCell(r, colMap['notes']);
        return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
      })(),
      predecessors: parsePredecessors(String(getCell(r, colMap['predecessor']) ?? '')),
    };

    fallbackSeq++;
    activities.push(activity);
  }

  return activities;
}
