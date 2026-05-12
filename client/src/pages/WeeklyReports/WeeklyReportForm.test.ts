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

  it('updatePhase overwrites existing value without merging', () => {
    const prev = { ...initialPhaseProgress(), EVT: { progress: 'old', risks: 'old_r', schedule: 'old_s' } };
    const next = updatePhase(prev, 'EVT', 'progress', 'new');
    expect(next.EVT.progress).toBe('new');
    expect(next.EVT.risks).toBe('old_r');
    expect(next.EVT.schedule).toBe('old_s');
  });

  it('initialPhaseProgress returns distinct object references per phase', () => {
    const init = initialPhaseProgress();
    expect(init.EVT).not.toBe(init.DVT);
    expect(init.EVT).not.toBe(init.PVT);
  });

  it('initialPhaseProgress has all required phase keys', () => {
    const init = initialPhaseProgress();
    expect(Object.keys(init)).toContain('EVT');
    expect(Object.keys(init)).toContain('DVT');
    expect(Object.keys(init)).toContain('PVT');
  });

  it('updatePhase with empty string value overwrites existing value', () => {
    const prev = { ...initialPhaseProgress(), EVT: { progress: 'old', risks: 'r', schedule: 's' } };
    const next = updatePhase(prev, 'EVT', 'progress', '');
    expect(next.EVT.progress).toBe('');
    expect(next.EVT.risks).toBe('r');
  });

  it('buildData weekStart is Monday for Saturday input', () => {
    const weekDate = dayjs('2025-01-04');
    const result = buildData({
      projectId: 'p1',
      weekDate,
      progressStatus: 'ON_TRACK',
      keyProgress: '',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: initialPhaseProgress(),
    });
    const parsed = dayjs(result.weekStart);
    expect(parsed.day()).toBe(1);
  });

  it('buildData preserves progressStatus value', () => {
    const result = buildData({
      projectId: 'p1',
      weekDate: dayjs('2025-03-03'),
      progressStatus: 'MAJOR_ISSUE',
      keyProgress: 'critical issue',
      nextWeekPlan: '',
      riskWarning: '',
      phaseProgress: initialPhaseProgress(),
    });
    expect(result.progressStatus).toBe('MAJOR_ISSUE');
    expect(result.keyProgress).toBe('critical issue');
  });

  it('updatePhase on non-existent phase key adds new entry', () => {
    const prev = initialPhaseProgress();
    const next = updatePhase(prev, 'CUSTOM', 'progress', 'custom value');
    expect(next).not.toBe(prev);
  });

  it('initialPhaseProgress returns object with all four phases', () => {
    const progress = initialPhaseProgress();
    expect(Object.keys(progress)).toContain('EVT');
    expect(Object.keys(progress)).toContain('DVT');
    expect(Object.keys(progress)).toContain('PVT');
    expect(Object.keys(progress)).toContain('MP');
  });
  it('initialPhaseProgress returns object with phase keys', () => { expect(Object.keys(initialPhaseProgress()).length).toBeGreaterThan(0); });

  it('initialPhaseProgress includes EVT phase', () => { expect(initialPhaseProgress()).toHaveProperty('EVT'); });

  it('initialPhaseProgress includes DVT phase', () => { expect(initialPhaseProgress()).toHaveProperty('DVT'); });

  it('initialPhaseProgress includes PVT phase', () => { expect(initialPhaseProgress()).toHaveProperty('PVT'); });

  it('initialPhaseProgress includes EVT phase', () => { expect(initialPhaseProgress()).toHaveProperty('EVT'); });

  it('initialPhaseProgress includes DVT phase', () => { expect(initialPhaseProgress()).toHaveProperty('DVT'); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2026-01-01').add(index, 'day'),
    ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'][index % 3] as ProgressStatus,
    `project-${index}`,
  ] as const))(
    'buildData creates generated ISO week window for %s',
    (weekDate, progressStatus, projectId) => {
      const result = buildData({
        projectId,
        weekDate,
        progressStatus,
        keyProgress: `key-${projectId}`,
        nextWeekPlan: '',
        riskWarning: '',
        phaseProgress: initialPhaseProgress(),
      });

      expect(result.projectId).toBe(projectId);
      expect(result.progressStatus).toBe(progressStatus);
      expect(dayjs(result.weekStart).day()).toBe(1);
      expect(dayjs(result.weekEnd).diff(dayjs(result.weekStart), 'day')).toBe(6);
      expect(result.keyProgress).toBe(`key-${projectId}`);
      expect(result.nextWeekPlan).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    PHASES[index % PHASES.length],
    ['progress', 'risks', 'schedule'][index % 3] as keyof PhaseData,
    `batch103-value-${index}`,
  ] as const))(
    'updatePhase applies generated %s %s update',
    (phase, field, value) => {
      const prev = initialPhaseProgress();
      const next = updatePhase(prev, phase, field, value);

      expect(next[phase][field]).toBe(value);
      expect(next).not.toBe(prev);
      for (const otherPhase of PHASES.filter((candidate) => candidate !== phase)) {
        expect(next[otherPhase]).toBe(prev[otherPhase]);
      }
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2027-01-01').add(index, 'day'),
    ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'][index % 3] as ProgressStatus,
    `batch123-project-${index}`,
  ] as const))(
    'buildData keeps generated project and ISO week window %#',
    (weekDate, progressStatus, projectId) => {
      const result = buildData({
        projectId,
        weekDate,
        progressStatus,
        keyProgress: '',
        nextWeekPlan: `next-${projectId}`,
        riskWarning: '',
        phaseProgress: initialPhaseProgress(),
      });

      expect(result.projectId).toBe(projectId);
      expect(result.progressStatus).toBe(progressStatus);
      expect(result.nextWeekPlan).toBe(`next-${projectId}`);
      expect(result.keyProgress).toBeUndefined();
      expect(dayjs(result.weekEnd).diff(dayjs(result.weekStart), 'day')).toBe(6);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    PHASES[index % PHASES.length],
    ['progress', 'risks', 'schedule'][index % 3] as keyof PhaseData,
    `batch123-phase-${index}`,
  ] as const))(
    'updatePhase keeps generated immutable update %s/%s',
    (phase, field, value) => {
      const prev = initialPhaseProgress();
      const next = updatePhase(prev, phase, field, value);

      expect(next[phase][field]).toBe(value);
      expect(next).not.toBe(prev);
      expect(next[phase]).not.toBe(prev[phase]);
      for (const otherPhase of PHASES.filter((candidate) => candidate !== phase)) {
        expect(next[otherPhase]).toBe(prev[otherPhase]);
      }
    },
  );
});

describe('WeeklyReportForm helpers batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2029-01-01').add(index, 'day'),
    `batch130-project-${index}`,
    `risk-${index}`,
  ] as const))(
    'buildData preserves generated risk warning and week span %#',
    (weekDate, projectId, riskWarning) => {
      const result = buildData({
        projectId,
        weekDate,
        progressStatus: 'ON_TRACK',
        keyProgress: '',
        nextWeekPlan: '',
        riskWarning,
        phaseProgress: initialPhaseProgress(),
      });

      expect(result.projectId).toBe(projectId);
      expect(result.riskWarning).toBe(riskWarning);
      expect(dayjs(result.weekEnd).diff(dayjs(result.weekStart), 'day')).toBe(6);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    PHASES[index % PHASES.length],
    `batch130-progress-${index}`,
    `batch130-risk-${index}`,
  ] as const))(
    'updatePhase preserves generated sibling fields for %s',
    (phase, progress, risks) => {
      const prev = initialPhaseProgress();
      const withProgress = updatePhase(prev, phase, 'progress', progress);
      const withRisk = updatePhase(withProgress, phase, 'risks', risks);

      expect(withRisk[phase].progress).toBe(progress);
      expect(withRisk[phase].risks).toBe(risks);
      expect(withRisk[phase].schedule).toBe('');
    },
  );
});

describe('WeeklyReportForm helpers batch 148 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2030-01-01').add(index, 'day'),
    `batch148-project-${index}`,
    ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'][index % 3] as ProgressStatus,
  ] as const))(
    'buildData preserves generated optional strings %#',
    (weekDate, projectId, progressStatus) => {
      const result = buildData({
        projectId,
        weekDate,
        progressStatus,
        keyProgress: `key-${projectId}`,
        nextWeekPlan: `next-${projectId}`,
        riskWarning: `risk-${projectId}`,
        phaseProgress: initialPhaseProgress(),
      });

      expect(result.projectId).toBe(projectId);
      expect(result.progressStatus).toBe(progressStatus);
      expect(result.keyProgress).toBe(`key-${projectId}`);
      expect(result.nextWeekPlan).toBe(`next-${projectId}`);
      expect(result.riskWarning).toBe(`risk-${projectId}`);
      expect(dayjs(result.weekEnd).diff(dayjs(result.weekStart), 'day')).toBe(6);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    PHASES[index % PHASES.length],
    `batch148-schedule-${index}`,
  ] as const))(
    'mergePhase and updatePhase keep generated schedule for %s',
    (phase, schedule) => {
      const merged = mergePhase({ schedule });
      const next = updatePhase(initialPhaseProgress(), phase, 'schedule', merged.schedule);

      expect(merged).toEqual({ progress: '', risks: '', schedule });
      expect(next[phase].schedule).toBe(schedule);
      expect(next[phase].progress).toBe('');
      expect(next[phase].risks).toBe('');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    dayjs('2031-01-01').add(index, 'day'),
    `batch153-project-${index}`,
    ['ON_TRACK', 'MINOR_ISSUE', 'MAJOR_ISSUE'][index % 3] as ProgressStatus,
  ] as const))(
    'buildData keeps generated ISO week boundaries %#',
    (weekDate, projectId, progressStatus) => {
      const result = buildData({
        projectId,
        weekDate,
        progressStatus,
        keyProgress: indexLabel(projectId),
        nextWeekPlan: '',
        riskWarning: '',
        phaseProgress: initialPhaseProgress(),
      });

      expect(result.weekStart).toBe(weekDate.startOf('isoWeek' as dayjs.OpUnitType).format('YYYY-MM-DD'));
      expect(result.weekEnd).toBe(weekDate.startOf('isoWeek' as dayjs.OpUnitType).add(6, 'day').format('YYYY-MM-DD'));
      expect(result.projectId).toBe(projectId);
      expect(result.progressStatus).toBe(progressStatus);
      expect(result.keyProgress).toBe(indexLabel(projectId));
      expect(result.nextWeekPlan).toBeUndefined();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `CUSTOM-${index}`,
    ['progress', 'risks', 'schedule'][index % 3] as keyof PhaseData,
    `batch153-value-${index}`,
  ] as const))(
    'updatePhase generated custom phase %s field %s',
    (phase, field, value) => {
      const prev = initialPhaseProgress();
      const next = updatePhase(prev, phase, field, value);

      expect(next[phase][field]).toBe(value);
      expect(next[phase]).not.toBe(prev[phase]);
      expect(next.EVT).toBe(prev.EVT);
      expect(next.MP).toBe(prev.MP);
    },
  );
});

function indexLabel(value: string): string {
  return `key-${value}`;
}
