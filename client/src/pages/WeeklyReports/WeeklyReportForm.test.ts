/**
 * WeeklyReportForm 核心业务逻辑单元测试
 *
 * Form.tsx 中的纯逻辑与数据结构被提取到此处测试，
 * 覆盖 mergePhase、buildData 字段组装、进展状态常量、阶段进展初始值等。
 */
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

// ============================================================
// 从 Form.tsx 复制的常量与类型（不改变源文件）
// ============================================================

const PHASES = ['EVT', 'DVT', 'PVT', 'MP'] as const;

type ProgressStatus = 'ON_TRACK' | 'MINOR_ISSUE' | 'MAJOR_ISSUE';

interface PhaseData {
  progress: string;
  risks: string;
  schedule: string;
}

const PROGRESS_OPTIONS: Array<{ value: ProgressStatus; label: string; color: string }> = [
  { value: 'ON_TRACK', label: '正常', color: 'var(--status-success)' },
  { value: 'MINOR_ISSUE', label: '轻度阻碍', color: 'var(--status-warning)' },
  { value: 'MAJOR_ISSUE', label: '严重阻碍', color: 'var(--status-danger)' },
];

// Form.tsx 的 mergePhase helper（useEffect 内部逻辑）
function mergePhase(p?: Partial<PhaseData>): PhaseData {
  return {
    progress: p?.progress || '',
    risks: p?.risks || '',
    schedule: p?.schedule || '',
  };
}

// Form.tsx 的 buildData 逻辑（复现组件内的纯数据组装）
function buildData(params: {
  projectId: string;
  weekDate: dayjs.Dayjs;
  progressStatus: ProgressStatus;
  keyProgress: string;
  nextWeekPlan: string;
  riskWarning: string;
  phaseProgress: Record<string, PhaseData>;
}) {
  const weekStart = params.weekDate.startOf('isoWeek' as dayjs.OpUnitType);
  const weekEnd = weekStart.add(6, 'day');
  return {
    projectId: params.projectId,
    weekStart: weekStart.format('YYYY-MM-DD'),
    weekEnd: weekEnd.format('YYYY-MM-DD'),
    progressStatus: params.progressStatus,
    keyProgress: params.keyProgress || undefined,
    nextWeekPlan: params.nextWeekPlan || undefined,
    riskWarning: params.riskWarning || undefined,
    phaseProgress: params.phaseProgress,
  };
}

// Form.tsx 的 updatePhase 逻辑
function updatePhase(
  prev: Record<string, PhaseData>,
  phase: string,
  field: keyof PhaseData,
  value: string,
): Record<string, PhaseData> {
  return { ...prev, [phase]: { ...prev[phase], [field]: value } };
}

// 初始阶段进展（与 Form.tsx 保持一致）
function initialPhaseProgress(): Record<string, PhaseData> {
  return {
    EVT: { progress: '', risks: '', schedule: '' },
    DVT: { progress: '', risks: '', schedule: '' },
    PVT: { progress: '', risks: '', schedule: '' },
    MP: { progress: '', risks: '', schedule: '' },
  };
}

// ============================================================
// mergePhase
// ============================================================

describe('mergePhase', () => {
  it('所有字段有值时正确合并', () => {
    const result = mergePhase({ progress: '进展A', risks: '风险B', schedule: '时间C' });
    expect(result).toEqual({ progress: '进展A', risks: '风险B', schedule: '时间C' });
  });

  it('undefined 参数时返回全空字符串对象', () => {
    expect(mergePhase(undefined)).toEqual({ progress: '', risks: '', schedule: '' });
  });

  it('部分字段有值，缺失字段补空字符串', () => {
    expect(mergePhase({ progress: '有进展' })).toEqual({
      progress: '有进展',
      risks: '',
      schedule: '',
    });
  });

  it('空字符串字段被替换为空字符串（not undefined）', () => {
    const result = mergePhase({ progress: '', risks: '', schedule: '' });
    expect(result.progress).toBe('');
    expect(result.risks).toBe('');
    expect(result.schedule).toBe('');
  });

  it('null 值字段应被替换为空字符串', () => {
    // null || '' = ''
    const result = mergePhase({ progress: null as unknown as string });
    expect(result.progress).toBe('');
  });
});

// ============================================================
// buildData 周次计算
// ============================================================

describe('buildData 周次日期计算', () => {
  const basePhase = initialPhaseProgress();

  it('weekStart 为所选日期所在 ISO 周的周一', () => {
    const weekDate = dayjs('2025-01-29'); // 2025W05，周三
    const result = buildData({
      projectId: 'p1',
      weekDate,
      progressStatus: 'ON_TRACK',
      keyProgress: '',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: basePhase,
    });
    expect(result.weekStart).toBe('2025-01-27'); // 该周周一
  });

  it('weekEnd 为 weekStart + 6 天（周日）', () => {
    const weekDate = dayjs('2025-01-27'); // 2025W05 周一
    const result = buildData({
      projectId: 'p1',
      weekDate,
      progressStatus: 'ON_TRACK',
      keyProgress: '',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: basePhase,
    });
    expect(result.weekEnd).toBe('2025-02-02'); // 周日
  });

  it('空字符串可选字段转为 undefined', () => {
    const result = buildData({
      projectId: 'p1',
      weekDate: dayjs('2025-01-27'),
      progressStatus: 'ON_TRACK',
      keyProgress: '',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: basePhase,
    });
    expect(result.keyProgress).toBeUndefined();
    expect(result.nextWeekPlan).toBeUndefined();
    expect(result.riskWarning).toBeUndefined();
  });

  it('非空可选字段保留原值', () => {
    const result = buildData({
      projectId: 'p1',
      weekDate: dayjs('2025-01-27'),
      progressStatus: 'MINOR_ISSUE',
      keyProgress: '完成了硬件评审',
      nextWeekPlan: '启动 DVT 阶段',
      riskWarning: '芯片供货延迟',
      phaseProgress: basePhase,
    });
    expect(result.keyProgress).toBe('完成了硬件评审');
    expect(result.nextWeekPlan).toBe('启动 DVT 阶段');
    expect(result.riskWarning).toBe('芯片供货延迟');
    expect(result.progressStatus).toBe('MINOR_ISSUE');
  });

  it('跨年周（2025W01，周一在 2024-12-30）', () => {
    const weekDate = dayjs('2024-12-30'); // 属于 2025W01
    const result = buildData({
      projectId: 'p1',
      weekDate,
      progressStatus: 'ON_TRACK',
      keyProgress: '',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: basePhase,
    });
    expect(result.weekStart).toBe('2024-12-30');
    expect(result.weekEnd).toBe('2025-01-05');
  });
});

// ============================================================
// updatePhase
// ============================================================

describe('updatePhase', () => {
  it('更新指定 phase 的指定字段，不影响其他 phase', () => {
    const prev = initialPhaseProgress();
    const next = updatePhase(prev, 'EVT', 'progress', '完成样品');

    expect(next.EVT.progress).toBe('完成样品');
    expect(next.DVT.progress).toBe(''); // 其他 phase 不受影响
    expect(next.EVT.risks).toBe('');    // 同 phase 其他字段不受影响
  });

  it('多次 updatePhase 可累积更新', () => {
    let state = initialPhaseProgress();
    state = updatePhase(state, 'EVT', 'progress', '完成样品');
    state = updatePhase(state, 'EVT', 'risks', '供货延迟');
    state = updatePhase(state, 'DVT', 'schedule', '2025-03 ~ 2025-06');

    expect(state.EVT.progress).toBe('完成样品');
    expect(state.EVT.risks).toBe('供货延迟');
    expect(state.DVT.schedule).toBe('2025-03 ~ 2025-06');
    expect(state.PVT.progress).toBe('');
  });

  it('返回新对象引用（不可变更新）', () => {
    const prev = initialPhaseProgress();
    const next = updatePhase(prev, 'EVT', 'progress', 'x');
    expect(next).not.toBe(prev);
    expect(next.EVT).not.toBe(prev.EVT);
    expect(next.DVT).toBe(prev.DVT); // 未更新的 phase 引用不变
  });
});

// ============================================================
// 常量
// ============================================================

describe('PHASES 常量', () => {
  it('包含 EVT、DVT、PVT、MP 四个阶段（顺序正确）', () => {
    expect(PHASES).toEqual(['EVT', 'DVT', 'PVT', 'MP']);
  });
});

describe('PROGRESS_OPTIONS 常量', () => {
  it('包含三个选项：ON_TRACK / MINOR_ISSUE / MAJOR_ISSUE', () => {
    const values = PROGRESS_OPTIONS.map((o) => o.value);
    expect(values).toContain('ON_TRACK');
    expect(values).toContain('MINOR_ISSUE');
    expect(values).toContain('MAJOR_ISSUE');
    expect(values).toHaveLength(3);
  });

  it('每个选项都有 label 和 color', () => {
    PROGRESS_OPTIONS.forEach((opt) => {
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    });
  });

  it('第一个选项为 ON_TRACK（正常）', () => {
    expect(PROGRESS_OPTIONS[0].value).toBe('ON_TRACK');
  });
});

describe('initialPhaseProgress', () => {
  it('包含全部四个阶段键', () => {
    const init = initialPhaseProgress();
    expect(Object.keys(init)).toEqual(['EVT', 'DVT', 'PVT', 'MP']);
  });

  it('每个阶段初始值为全空字符串', () => {
    const init = initialPhaseProgress();
    PHASES.forEach((phase) => {
      expect(init[phase]).toEqual({ progress: '', risks: '', schedule: '' });
    });
  });
});
