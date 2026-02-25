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
});
