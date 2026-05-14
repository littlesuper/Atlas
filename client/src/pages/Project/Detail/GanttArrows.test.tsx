import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import GanttArrows, { DEP_TYPE_COLOR } from './GanttArrows';
import { Activity } from '../../../types';
import dayjs from 'dayjs';

// Helper: minimal activity with dates
function makeActivity(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    projectId: 'p1',
    name: 'Activity',
    type: 'TASK',
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    sortOrder: 0,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  } as Activity;
}

const rangeStart = dayjs('2025-03-01');

describe('GanttArrows', () => {
  it('returns null when activities have no dependencies', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({ id: 'a2', planStartDate: '2025-03-10', planEndDate: '2025-03-14' }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('returns null when dayWidth < 4', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={3} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders FS (type=0) arrow with correct color', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const path = svg!.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['0']);
    expect(path!.getAttribute('marker-end')).toBe('url(#arrow-0)');
  });

  it('renders SS (type=1) arrow with correct color', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '1' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['1']);
  });

  it('renders FF (type=2) arrow with correct color', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '2' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['2']);
  });

  it('renders SF (type=3) arrow with correct color', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '3' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['3']);
  });

  it('renders multiple arrows for multiple dependencies', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({ id: 'a2', planStartDate: '2025-03-05', planEndDate: '2025-03-12' }),
      makeActivity({
        id: 'a3',
        planStartDate: '2025-03-15',
        planEndDate: '2025-03-20',
        dependencies: [
          { id: 'a1', type: '0' },
          { id: 'a2', type: '1' },
        ],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const arrows = container.querySelectorAll('path[stroke]');
    expect(arrows.length).toBe(2);
  });

  it('renders marker defs for all 4 dependency types', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const defs = container.querySelector('defs');
    expect(defs).not.toBeNull();
    expect(defs!.querySelectorAll('marker').length).toBe(4);
    expect(container.querySelector('#arrow-0')).not.toBeNull();
    expect(container.querySelector('#arrow-1')).not.toBeNull();
    expect(container.querySelector('#arrow-2')).not.toBeNull();
    expect(container.querySelector('#arrow-3')).not.toBeNull();
  });

  it('skips arrow when source has no dates', () => {
    const activities = [
      makeActivity({ id: 'a1' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('skips arrow when target has no dates', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({ id: 'a2', dependencies: [{ id: 'a1', type: '0' }] }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('skips arrow when dependency references non-existent activity', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'nonexistent', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('uses actual dates when plan dates are absent', () => {
    const activities = [
      makeActivity({ id: 'a1', startDate: '2025-03-03', endDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        startDate: '2025-03-10',
        endDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path[stroke]').length).toBe(1);
  });

  it('renders arrow with default FS type when dep type is empty', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['0']);
  });

  it('returns null for empty activities array', () => {
    const { container } = render(
      <GanttArrows activities={[]} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders same-row path when activity depends on itself', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        planStartDate: '2025-03-03',
        planEndDate: '2025-03-07',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toContain('M');
  });

  it('falls back to FS color for unknown dependency type', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '9' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR['0']);
  });

  it('renders arrow when source has only planStartDate but no planEndDate', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path[stroke]').length).toBe(1);
  });

  it('renders tight-space detour path when activities overlap', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-05', planEndDate: '2025-03-06' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-04',
        planEndDate: '2025-03-05',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toContain('M');
  });

  it('skips arrow when dependencies array is empty', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders arrows when dayWidth is exactly 4 (boundary)', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={4} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path[stroke]').length).toBe(1);
  });

  it('renders arrow when target has only actual dates not plan dates', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        startDate: '2025-03-10',
        endDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path[stroke]').length).toBe(1);
  });

  it('renders no arrows for empty activities', () => {
    const { container } = render(
      <GanttArrows activities={[]} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders SVG for activities with FS dependency', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders no arrow when source activity has only startDate without endDate', () => {
    const activities = [
      makeActivity({ id: 'a1', startDate: '2025-03-03' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-10',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders arrow for SS dependency between same-row activities', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({
        id: 'a2',
        planStartDate: '2025-03-03',
        planEndDate: '2025-03-14',
        dependencies: [{ id: 'a1', type: '1' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelectorAll('path[stroke]').length).toBe(1);
  });

  it('renders null SVG when dependency references non-existent activity', () => {
    const activities = [
      makeActivity({
        id: 'a1',
        planStartDate: '2025-03-03',
        planEndDate: '2025-03-07',
        dependencies: [{ id: 'nonexistent', type: '0' }],
      }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders null SVG when activities have no dates', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: null, planEndDate: null, dependencies: [{ id: 'a2', type: '0' }] }),
      makeActivity({ id: 'a2', planStartDate: null, planEndDate: null }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders SVG when activities have valid overlapping dates', () => {
    const activities = [
      makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
      makeActivity({ id: 'a2', planStartDate: '2025-03-05', planEndDate: '2025-03-10', dependencies: [{ id: 'a1', type: '0' }] }),
    ];
    const { container } = render(
      <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('GanttArrows renders without crash for empty activities', () => { const activities: { id: string; startDate?: string; duration?: number; dependencies?: { id: string; type: string }[] }[] = []; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={30} />); expect(container).toBeTruthy(); });

  it('GanttArrows renders SVG element for activities with dependencies', () => { const activities = [{ id: 'a1', startDate: '2026-01-01', duration: 5, dependencies: [] }, { id: 'a2', startDate: '2026-01-06', duration: 3, dependencies: [{ id: 'a1', type: '0' }] }]; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />); expect(container.querySelector('svg')).toBeTruthy(); });

  it('GanttArrows renders without crash for single activity', () => { const activities = [{ id: 'a1', startDate: '2026-01-01', duration: 5, dependencies: [] }]; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />); expect(container).toBeTruthy(); });

  it('GanttArrows renders without crash for empty activities', () => { const activities: { id: string; startDate?: string; duration?: number; dependencies?: { id: string; type: string }[] }[] = []; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />); expect(container).toBeTruthy(); });

  it('GanttArrows renders with dependencies between activities', () => { const activities = [{ id: 'a1', startDate: '2026-01-01', duration: 5, dependencies: [] }, { id: 'a2', startDate: '2026-01-06', duration: 3, dependencies: [{ id: 'a1', type: '0' }] }]; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />); expect(container).toBeTruthy(); });

  it('GanttArrows renders with no dependencies', () => { const activities = [{ id: 'a1', startDate: '2026-01-01', duration: 5, dependencies: [] }]; const rangeStart = dayjs('2026-01-01'); const { container } = render(<GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={20} />); expect(container).toBeTruthy(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    ['0', '1', '2', '3'][index % 4],
    4 + (index % 20),
    `dep-${index}`,
  ] as const))(
    'renders generated dependency type %s at dayWidth %s',
    (type, dayWidth, suffix) => {
      const activities = [
        makeActivity({ id: `a1-${suffix}`, planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
        makeActivity({
          id: `a2-${suffix}`,
          planStartDate: '2025-03-10',
          planEndDate: '2025-03-14',
          dependencies: [{ id: `a1-${suffix}`, type }],
        }),
      ];
      const { container } = render(
        <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={dayWidth} />,
      );
      const path = container.querySelector('path[stroke]');

      expect(path).not.toBeNull();
      expect(path!.getAttribute('stroke')).toBe(DEP_TYPE_COLOR[type]);
      expect(path!.getAttribute('marker-end')).toBe(`url(#arrow-${type})`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missing-${index}`,
    3 - (index % 4),
  ] as const))(
    'skips generated invalid dependency or zoomed out case %s',
    (missingId, dayWidth) => {
      const activities = [
        makeActivity({ id: 'a1', planStartDate: '2025-03-03', planEndDate: '2025-03-07' }),
        makeActivity({
          id: 'a2',
          planStartDate: '2025-03-10',
          planEndDate: '2025-03-14',
          dependencies: [{ id: missingId, type: '0' }],
        }),
      ];
      const { container } = render(
        <GanttArrows activities={activities} rangeStart={rangeStart} dayWidth={dayWidth} />,
      );

      expect(container.querySelector('svg')).toBeNull();
    },
  );
});
