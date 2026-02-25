import React, { useMemo } from 'react';
import { Activity } from '../../../types';
import dayjs from 'dayjs';

const ROW_H = 48;
const BAR_Y_ACT = 15;
const BAR_H_ACT = 14;
const BAR_MID_Y = BAR_Y_ACT + BAR_H_ACT / 2;

// 依赖类型: '0'=FS, '1'=SS, '2'=FF, '3'=SF
const DEP_TYPE_COLOR: Record<string, string> = {
  '0': 'var(--color-primary-6, #3370ff)',   // FS=蓝
  '1': 'var(--status-success, #00b42a)',     // SS=绿
  '2': 'var(--status-warning, #ff7d00)',     // FF=橙
  '3': 'var(--color-purple-6, #722ed1)',     // SF=紫
};

const DEP_TYPE_LABEL: Record<string, string> = {
  '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF',
};

interface GanttArrowsProps {
  activities: Activity[];
  rangeStart: dayjs.Dayjs;
  dayWidth: number;
}

function daysBetween(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  return end.diff(start, 'day');
}

const GanttArrows: React.FC<GanttArrowsProps> = ({ activities, rangeStart, dayWidth }) => {
  const arrows = useMemo(() => {
    // Don't render arrows when zoomed out too far
    if (dayWidth < 4) return [];

    const idToIndex = new Map<string, number>();
    activities.forEach((a, i) => idToIndex.set(a.id, i));

    const result: Array<{
      key: string;
      path: string;
      color: string;
      type: string;
    }> = [];

    activities.forEach((a, targetIdx) => {
      if (!a.dependencies || !Array.isArray(a.dependencies)) return;

      for (const dep of a.dependencies) {
        const sourceIdx = idToIndex.get(dep.id);
        if (sourceIdx === undefined) continue;

        const source = activities[sourceIdx];
        const type = dep.type || '0';
        const color = DEP_TYPE_COLOR[type] || DEP_TYPE_COLOR['0'];

        // Calculate source and target positions
        const sourceStart = source.startDate || source.planStartDate;
        const sourceEnd = source.endDate || source.planEndDate;
        const targetStart = a.startDate || a.planStartDate;
        const targetEnd = a.endDate || a.planEndDate;

        if (!sourceStart && !sourceEnd) continue;
        if (!targetStart && !targetEnd) continue;

        const sourceSx = sourceStart ? daysBetween(rangeStart, dayjs(sourceStart)) * dayWidth : 0;
        const sourceEx = sourceEnd
          ? daysBetween(rangeStart, dayjs(sourceEnd)) * dayWidth + dayWidth
          : sourceSx + dayWidth;

        const targetSx = targetStart ? daysBetween(rangeStart, dayjs(targetStart)) * dayWidth : 0;
        const targetEx = targetEnd
          ? daysBetween(rangeStart, dayjs(targetEnd)) * dayWidth + dayWidth
          : targetSx + dayWidth;

        let fromX: number, toX: number;

        // FS: source end → target start
        // SS: source start → target start
        // FF: source end → target end
        // SF: source start → target end
        switch (type) {
          case '1': // SS
            fromX = sourceSx;
            toX = targetSx;
            break;
          case '2': // FF
            fromX = sourceEx;
            toX = targetEx;
            break;
          case '3': // SF
            fromX = sourceSx;
            toX = targetEx;
            break;
          default: // FS
            fromX = sourceEx;
            toX = targetSx;
            break;
        }

        const fromY = sourceIdx * ROW_H + BAR_MID_Y;
        const toY = targetIdx * ROW_H + BAR_MID_Y;

        // Build elbow path
        const midX = fromX + (toX - fromX) / 2;
        const offset = 8;
        let path: string;

        if (sourceIdx === targetIdx) {
          // Same row - go around
          path = `M${fromX},${fromY} L${fromX + offset},${fromY} L${fromX + offset},${fromY - ROW_H / 2} L${toX - offset},${fromY - ROW_H / 2} L${toX - offset},${toY} L${toX},${toY}`;
        } else if (Math.abs(toX - fromX) > offset * 2) {
          // Enough horizontal space - simple elbow
          path = `M${fromX},${fromY} L${midX},${fromY} L${midX},${toY} L${toX},${toY}`;
        } else {
          // Tight space - go around
          const detourX = Math.min(fromX, toX) - offset;
          path = `M${fromX},${fromY} L${fromX + offset},${fromY} L${fromX + offset},${(fromY + toY) / 2} L${detourX},${(fromY + toY) / 2} L${detourX},${toY} L${toX},${toY}`;
        }

        result.push({
          key: `${dep.id}-${a.id}`,
          path,
          color,
          type,
        });
      }
    });

    return result;
  }, [activities, rangeStart, dayWidth]);

  if (arrows.length === 0) return null;

  const totalHeight = activities.length * ROW_H;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: totalHeight,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <defs>
        {Object.entries(DEP_TYPE_COLOR).map(([type, color]) => (
          <marker
            key={type}
            id={`arrow-${type}`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={color} />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow) => (
        <path
          key={arrow.key}
          d={arrow.path}
          fill="none"
          stroke={arrow.color}
          strokeWidth={1.5}
          markerEnd={`url(#arrow-${arrow.type})`}
          opacity={0.7}
        />
      ))}
    </svg>
  );
};

export { DEP_TYPE_COLOR, DEP_TYPE_LABEL };
export default GanttArrows;
