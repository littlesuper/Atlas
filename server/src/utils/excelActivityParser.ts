import { readSheet } from 'read-excel-file/node';

type ExcelCellValue = string | number | boolean | Date | null;
type ExcelRow = ExcelCellValue[];

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
  if (/已完成|完成/.test(s)) return 'COMPLETED';
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

// Excel serial number → Date
function excelDateToJS(value: unknown): Date | undefined {
  if (value == null || value === '') return undefined;

  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569);
    return new Date(utcDays * 86400 * 1000);
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return undefined;
    const zhMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (zhMatch) {
      return new Date(Date.UTC(parseInt(zhMatch[1]), parseInt(zhMatch[2]) - 1, parseInt(zhMatch[3])));
    }
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])));
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  return undefined;
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/**
 * 自动识别表头行并映射列索引
 */
function detectColumns(rows: ExcelRow[]): { headerRow: number; colMap: Record<string, number> } {
  let fallback: { headerRow: number; colMap: Record<string, number> } | null = null;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    const colMap: Record<string, number> = {};
    let matchCount = 0;

    for (let c = 0; c < row.length; c++) {
      const text = cellToText(row[c]);
      if (!text) continue;
      const lowerText = text.toLowerCase();

      for (const [field, keywords] of COLUMN_KEYWORDS) {
        if (colMap[field] !== undefined) continue;
        if (keywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
          colMap[field] = c;
          matchCount++;
          break;
        }
      }
    }

    if (colMap['name'] !== undefined) {
      if (matchCount >= 2) {
        return { headerRow: r, colMap };
      }
      fallback = fallback ?? { headerRow: r, colMap };
    }
  }

  if (fallback) return fallback;

  throw new Error('无法识别 Excel 表头，请确保包含"任务描述"或"活动名称"列');
}

/**
 * 解析 Excel 文件 buffer，返回活动列表
 */
export async function parseExcelActivities(buffer: Buffer): Promise<ParsedActivity[]> {
  const rows = (await readSheet(buffer, 1)) as ExcelRow[];
  const { headerRow, colMap } = detectColumns(rows);
  const activities: ParsedActivity[] = [];

  const getCell = (r: number, c: number | undefined): unknown => {
    if (c === undefined) return undefined;
    return rows[r]?.[c];
  };

  let fallbackSeq = 1;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const name = getCell(r, colMap['name']);
    if (!name || cellToText(name) === '') continue; // 跳过空行

    const seqRaw = getCell(r, colMap['seq']);
    const seqNum = seqRaw != null && seqRaw !== '' ? parseInt(String(seqRaw).trim(), 10) : NaN;

    const roleValue = getCell(r, colMap['role']);
    const durationValue = getCell(r, colMap['duration']);
    const notesValue = getCell(r, colMap['notes']);
    const durationNumber = Number(durationValue);

    const activity: ParsedActivity = {
      seq: !isNaN(seqNum) && seqNum > 0 ? seqNum : fallbackSeq,
      name: cellToText(name),
      type: parseType(cellToText(getCell(r, colMap['type']))),
      phase: parsePhase(cellToText(getCell(r, colMap['phase']))),
      assigneeNames: parseAssignees(cellToText(getCell(r, colMap['assignee']))),
      roleName: roleValue != null && cellToText(roleValue) !== '' ? cellToText(roleValue) : undefined,
      planDuration: durationValue == null || durationValue === '' || isNaN(durationNumber) ? undefined : durationNumber,
      planStartDate: excelDateToJS(getCell(r, colMap['planStart'])),
      planEndDate: excelDateToJS(getCell(r, colMap['planEnd'])),
      actualStartDate: excelDateToJS(getCell(r, colMap['actualStart'])),
      actualEndDate: excelDateToJS(getCell(r, colMap['actualEnd'])),
      status: parseStatus(cellToText(getCell(r, colMap['status']))),
      notes: notesValue != null && cellToText(notesValue) !== '' ? cellToText(notesValue) : undefined,
      predecessors: parsePredecessors(cellToText(getCell(r, colMap['predecessor']))),
    };

    fallbackSeq++;
    activities.push(activity);
  }

  return activities;
}
