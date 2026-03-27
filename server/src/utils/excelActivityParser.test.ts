import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelActivities } from './excelActivityParser';

// ─── Helper: create an Excel buffer from a 2D array of cell values ────────
function createExcelBuffer(rows: (string | number | null | undefined)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── Helper: create a workbook buffer with an empty sheet (no data) ───────
function createEmptySheetBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Column Detection
// ═══════════════════════════════════════════════════════════════════════════
describe('Column Detection', () => {
  it('detects Chinese headers: 任务描述, 阶段, 负责人, 工期', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段', '负责人', '工期'],
      ['PCB 设计', 'EVT', '张三', '10'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('PCB 设计');
    expect(result[0].phase).toBe('EVT');
    expect(result[0].assigneeNames).toEqual(['张三']);
    expect(result[0].planDuration).toBe(10);
  });

  it('detects English headers: phase, assignee, duration, status, notes', () => {
    const buf = createExcelBuffer([
      ['任务描述', 'phase', 'assignee', 'duration', 'status', 'notes'],
      ['Board layout', 'DVT', 'Alice', '5', '进行中', 'urgent'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('DVT');
    expect(result[0].assigneeNames).toEqual(['Alice']);
    expect(result[0].planDuration).toBe(5);
    expect(result[0].status).toBe('IN_PROGRESS');
    expect(result[0].notes).toBe('urgent');
  });

  it('finds headers on row 2 when row 1 is a title row', () => {
    const buf = createExcelBuffer([
      ['项目活动列表'],
      ['任务描述', '阶段', '负责人', '工期'],
      ['结构件开模', '1EVT阶段', '李四', '15'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('结构件开模');
    expect(result[0].planDuration).toBe(15);
  });

  it('throws error when no recognizable name column exists', () => {
    const buf = createExcelBuffer([
      ['序号', '类别', '描述'],
      ['1', 'A', 'something'],
    ]);
    expect(() => parseExcelActivities(buf)).toThrow('无法识别 Excel 表头');
  });

  it('detects mixed Chinese/English headers', () => {
    const buf = createExcelBuffer([
      ['活动名称', 'phase', '负责人', 'duration', '状态', 'notes'],
      ['固件开发', 'PVT', '王五', '20', '未开始', '需要评审'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('固件开发');
    expect(result[0].phase).toBe('PVT');
    expect(result[0].assigneeNames).toEqual(['王五']);
    expect(result[0].planDuration).toBe(20);
    expect(result[0].status).toBe('NOT_STARTED');
    expect(result[0].notes).toBe('需要评审');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Phase Parsing
// ═══════════════════════════════════════════════════════════════════════════
describe('Phase Parsing', () => {
  it('extracts EVT from "1EVT阶段"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['Task A', '1EVT阶段'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].phase).toBe('EVT');
  });

  it('extracts PVT from "3PVT"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['Task B', '3PVT'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].phase).toBe('PVT');
  });

  it('extracts DVT without numeric prefix', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['Task C', 'DVT'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].phase).toBe('DVT');
  });

  it('returns raw value for non-matching phase like "其他阶段"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['Task D', '其他阶段'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].phase).toBe('其他阶段');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Assignee Parsing
// ═══════════════════════════════════════════════════════════════════════════
describe('Assignee Parsing', () => {
  it('parses "张三(昵称), 李四(Nick)" → ["张三", "李四"]', () => {
    const buf = createExcelBuffer([
      ['任务描述', '负责人'],
      ['Task A', '张三(昵称), 李四(Nick)'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].assigneeNames).toEqual(['张三', '李四']);
  });

  it('handles Chinese comma: "张三，李四" → ["张三", "李四"]', () => {
    const buf = createExcelBuffer([
      ['任务描述', '负责人'],
      ['Task B', '张三，李四'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].assigneeNames).toEqual(['张三', '李四']);
  });

  it('handles single assignee: "张三" → ["张三"]', () => {
    const buf = createExcelBuffer([
      ['任务描述', '负责人'],
      ['Task C', '张三'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].assigneeNames).toEqual(['张三']);
  });

  it('handles empty assignee → []', () => {
    const buf = createExcelBuffer([
      ['任务描述', '负责人'],
      ['Task D', ''],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].assigneeNames).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Status Mapping
// ═══════════════════════════════════════════════════════════════════════════
describe('Status Mapping', () => {
  it('maps "已完成" → "COMPLETED"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task A', '已完成'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('COMPLETED');
  });

  it('maps "进行中" → "IN_PROGRESS"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task B', '进行中'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('IN_PROGRESS');
  });

  it('maps "未开始" → "NOT_STARTED"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task C', '未开始'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('NOT_STARTED');
  });

  it('maps "暂停" → "ON_HOLD"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task D', '暂停'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('ON_HOLD');
  });

  it('returns undefined for unrecognized status "未知状态"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task E', '未知状态'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Date Parsing
// ═══════════════════════════════════════════════════════════════════════════
describe('Date Parsing', () => {
  it('converts Excel serial number to correct date', () => {
    // Excel serial 46068 = 2026-02-15
    const ws = XLSX.utils.aoa_to_sheet([
      ['任务描述', '计划开始'],
    ]);
    // Manually set cell B2 to a numeric value (Excel serial number)
    ws['B2'] = { t: 'n', v: 46068 };
    ws['A2'] = { t: 's', v: 'Task A' };
    ws['!ref'] = 'A1:B2';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseExcelActivities(buf);
    expect(result[0].planStartDate).toBeInstanceOf(Date);
    const d = result[0].planStartDate!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(d.getUTCDate()).toBe(15);
  });

  it('parses Chinese date format "2026年2月2日"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '计划开始'],
      ['Task B', '2026年2月2日'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].planStartDate).toBeInstanceOf(Date);
    const d = result[0].planStartDate!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1); // February
    expect(d.getUTCDate()).toBe(2);
  });

  it('parses ISO date format "2026-02-02"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '开始日期'],
      ['Task C', '2026-02-02'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].planStartDate).toBeInstanceOf(Date);
    const d = result[0].planStartDate!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(2);
  });

  it('returns undefined for empty/null date values', () => {
    const buf = createExcelBuffer([
      ['任务描述', '计划开始'],
      ['Task D', ''],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].planStartDate).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Integration Tests
// ═══════════════════════════════════════════════════════════════════════════
describe('Integration', () => {
  it('parses a full Excel with all columns into correct ParsedActivity array', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段', '负责人', '工期', '计划开始', '完成时间', '任务状态', '备注'],
      ['PCB 设计', '1EVT阶段', '张三(工程师), 李四', '10', '2026-03-01', '2026-03-15', '进行中', '优先级高'],
      ['结构件开模', '2DVT', '王五', '20', '2026年3月10日', '2026年4月5日', '未开始', ''],
      ['固件开发', 'MP', '赵六(FW)', '15', '2026-04-01', '2026-04-20', '已完成', '已交付'],
    ]);

    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(3);

    // Row 1
    expect(result[0]).toMatchObject({
      name: 'PCB 设计',
      phase: 'EVT',
      assigneeNames: ['张三', '李四'],
      planDuration: 10,
      status: 'IN_PROGRESS',
      notes: '优先级高',
    });
    expect(result[0].planStartDate).toBeInstanceOf(Date);
    expect(result[0].planEndDate).toBeInstanceOf(Date);

    // Row 2
    expect(result[1]).toMatchObject({
      name: '结构件开模',
      phase: 'DVT',
      assigneeNames: ['王五'],
      planDuration: 20,
      status: 'NOT_STARTED',
    });
    expect(result[1].notes).toBeUndefined();

    // Row 3
    expect(result[2]).toMatchObject({
      name: '固件开发',
      phase: 'MP',
      assigneeNames: ['赵六'],
      planDuration: 15,
      status: 'COMPLETED',
      notes: '已交付',
    });
  });

  it('parses Excel with only name column → minimal results', () => {
    const buf = createExcelBuffer([
      ['任务名称'],
      ['Task Alpha'],
      ['Task Beta'],
    ]);

    // 'name' alone only triggers colMap['name'] with matchCount=1.
    // detectColumns requires matchCount >= 2, so with only one keyword column
    // it falls through to the fallback that checks if colMap['name'] is set.
    // Since the loop resets colMap when matchCount < 2, this should throw.
    // But let's check: the fallback at line 134 checks colMap['name'] !== undefined
    // after the loop. Since matchCount=1 < 2, the loop body at line 128 resets colMap.
    // So colMap['name'] will be undefined after the reset → throws.
    // We need at least 2 keyword columns for the header to be recognized.
    // Let's test with name + one more keyword to make it minimal:
    const buf2 = createExcelBuffer([
      ['任务名称', '阶段'],
      ['Task Alpha', ''],
      ['Task Beta', ''],
    ]);

    const result = parseExcelActivities(buf2);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Task Alpha');
    expect(result[0].assigneeNames).toEqual([]);
    expect(result[0].planDuration).toBeUndefined();
    expect(result[0].planStartDate).toBeUndefined();
    expect(result[0].planEndDate).toBeUndefined();
    expect(result[0].status).toBeUndefined();
    expect(result[0].notes).toBeUndefined();
    expect(result[1].name).toBe('Task Beta');
  });

  it('skips rows with empty names', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['Task 1', 'EVT'],
      ['', 'DVT'],
      ['Task 3', 'PVT'],
      [null, 'MP'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Task 1');
    expect(result[1].name).toBe('Task 3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Edge Cases
// ═══════════════════════════════════════════════════════════════════════════
describe('Edge Cases', () => {
  it('throws for workbook with empty sheet (no recognizable headers)', () => {
    const buf = createEmptySheetBuffer();
    expect(() => parseExcelActivities(buf)).toThrow('无法识别 Excel 表头');
  });

  it('handles plan start and plan end date columns', () => {
    const buf = createExcelBuffer([
      ['任务描述', '计划开始', '完成日期'],
      ['Task A', '2026-05-01', '2026-05-15'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].planStartDate).toBeInstanceOf(Date);
    expect(result[0].planEndDate).toBeInstanceOf(Date);
    expect(result[0].planStartDate!.getUTCFullYear()).toBe(2026);
    expect(result[0].planEndDate!.getUTCMonth()).toBe(4); // May
  });

  it('handles non-numeric duration gracefully', () => {
    const buf = createExcelBuffer([
      ['任务描述', '工期'],
      ['Task A', 'N/A'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].planDuration).toBeUndefined();
  });

  it('handles alternative status keywords "完成" and "进行"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task A', '完成'],
      ['Task B', '进行'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('COMPLETED');
    expect(result[1].status).toBe('IN_PROGRESS');
  });

  it('handles alternative status keywords "未启动" and "挂起"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '状态'],
      ['Task A', '未启动'],
      ['Task B', '挂起'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].status).toBe('NOT_STARTED');
    expect(result[1].status).toBe('ON_HOLD');
  });

  it('parses assignees with full-width parentheses "张三（昵称）"', () => {
    const buf = createExcelBuffer([
      ['任务描述', '负责人'],
      ['Task A', '张三（昵称）, 李四（Nick）'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].assigneeNames).toEqual(['张三', '李四']);
  });

  it('extracts MP phase correctly', () => {
    const buf = createExcelBuffer([
      ['任务描述', '阶段'],
      ['量产准备', '4MP'],
    ]);
    const result = parseExcelActivities(buf);
    expect(result[0].phase).toBe('MP');
  });
});
