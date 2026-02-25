import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, DatePicker, Space, Tag, Tooltip } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import { Activity } from '../../../types';
import { ACTIVITY_STATUS_MAP } from '../../../utils/constants';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

// ============ 视图模式配置 ============
type ViewMode = 'day' | 'week' | 'month' | 'quarter' | 'year';

const VIEW_CONFIG: Record<ViewMode, { label: string; dayWidth: number }> = {
  day:     { label: '日',   dayWidth: 36 },
  week:    { label: '周',   dayWidth: 20 },
  month:   { label: '月',   dayWidth: 6  },
  quarter: { label: '季度', dayWidth: 2  },
  year:    { label: '年',   dayWidth: 0.5 },
};

// ============ 颜色配置 ============
function getStatusProgress(status: string): number {
  if (status === 'COMPLETED') return 100;
  if (status === 'IN_PROGRESS') return 50;
  return 0;
}

const STATUS_BAR_COLOR: Record<string, string> = {
  COMPLETED:  '#00b42a',
  IN_PROGRESS: '#4f7cff',
  NOT_STARTED: '#86909c',
  CANCELLED:  '#4e5969',
};

// ============ 日期工具 ============
function daysBetween(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  return end.diff(start, 'day');
}

// 月份分组
function getMonthGroups(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  const groups: Array<{ label: string; days: number }> = [];
  let cur = start.startOf('month');
  while (cur.isBefore(end) || cur.isSame(end, 'month')) {
    const monthEnd = cur.endOf('month');
    const clampedEnd   = monthEnd.isAfter(end) ? end : monthEnd;
    const clampedStart = cur.isBefore(start) ? start : cur;
    const days = clampedEnd.diff(clampedStart, 'day') + 1;
    groups.push({ label: cur.format('YYYY年M月'), days });
    cur = cur.add(1, 'month').startOf('month');
  }
  return groups;
}

// 周分组
function getWeekGroups(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  const groups: Array<{ label: string; days: number }> = [];
  // 对齐到周一
  let cur = start.subtract((start.day() === 0 ? 6 : start.day() - 1), 'day');
  while (cur.isBefore(end)) {
    const weekEnd      = cur.add(6, 'day');
    const clampedStart = cur.isBefore(start) ? start : cur;
    const clampedEnd   = weekEnd.isAfter(end) ? end : weekEnd;
    const days = clampedEnd.diff(clampedStart, 'day') + 1;
    groups.push({ label: cur.format('M/D'), days });
    cur = cur.add(7, 'day');
  }
  return groups;
}

// 季度分组（不依赖 dayjs 插件）
function getQuarterGroups(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  const groups: Array<{ label: string; days: number }> = [];
  const qStartMonth = Math.floor(start.month() / 3) * 3;
  let cur = start.startOf('year').add(qStartMonth, 'month');
  while (cur.isBefore(end) || cur.isSame(end, 'month')) {
    const qNum    = Math.floor(cur.month() / 3) + 1;
    const qEnd    = cur.add(2, 'month').endOf('month');
    const clampedEnd   = qEnd.isAfter(end) ? end : qEnd;
    const clampedStart = cur.isBefore(start) ? start : cur;
    const days = clampedEnd.diff(clampedStart, 'day') + 1;
    groups.push({ label: `${cur.format('YYYY')}年Q${qNum}`, days });
    cur = cur.add(3, 'month');
  }
  return groups;
}

// 年份分组
function getYearGroups(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  const groups: Array<{ label: string; days: number }> = [];
  let cur = start.startOf('year');
  while (cur.isBefore(end) || cur.isSame(end, 'year')) {
    const yEnd    = cur.endOf('year');
    const clampedEnd   = yEnd.isAfter(end) ? end : yEnd;
    const clampedStart = cur.isBefore(start) ? start : cur;
    const days = clampedEnd.diff(clampedStart, 'day') + 1;
    groups.push({ label: cur.format('YYYY年'), days });
    cur = cur.add(1, 'year');
  }
  return groups;
}

// ============ 尺寸常量 ============
const ROW_H       = 48;
const HEADER_H    = 32; // 主行高
const HEADER_TOP  = 18; // 双行头顶部行高
const BAR_Y_PLAN  = 5;
const BAR_H_PLAN  = 5;
const BAR_Y_ACT   = 15;
const BAR_H_ACT   = 14;
const LABEL_COL_W = 220;
const TODAY_COLOR = '#f53f3f';

// 图例数据
const LEGEND_ITEMS = [
  { icon: <div style={{ width: 24, height: 4, border: '1px dashed #86909c' }} />, label: '计划条' },
  { icon: <div style={{ width: 10, height: 10, background: '#4f7cff', borderRadius: 2 }} />, label: '进行中' },
  { icon: <div style={{ width: 10, height: 10, background: '#00b42a', borderRadius: 2 }} />, label: '已完成' },
  { icon: <div style={{ width: 10, height: 10, background: '#86909c', borderRadius: 2 }} />, label: '未开始' },
  { icon: <div style={{ width: 10, height: 10, background: '#ff7d00', transform: 'rotate(45deg)' }} />, label: '里程碑' },
  { icon: <div style={{ width: 2, height: 12, background: TODAY_COLOR }} />, label: '今天', color: TODAY_COLOR },
];

interface GanttProps {
  activities: Activity[];
}

const GanttChart: React.FC<GanttProps> = ({ activities }) => {
  const [viewMode, setViewMode]     = useState<ViewMode>('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [hoveredId, setHoveredId]   = useState<string | null>(null);
  const outerRef        = useRef<HTMLDivElement>(null);
  const bodyRef         = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null); // 普通流表头横向滚动同步
  const fixedScrollRef  = useRef<HTMLDivElement>(null); // 吸顶表头横向滚动同步

  const TABS_H = 0; // 无吸顶 tabs bar，固定表头贴紧视口顶部
  const [headerFixed, setHeaderFixed] = useState(false);
  const [fixedPos, setFixedPos]       = useState({ left: 0, width: 0 });

  // 组件不可见时（切换 Tab）立即收起吸顶表头
  useEffect(() => {
    if (!outerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) setHeaderFixed(false); },
      { threshold: 0 },
    );
    observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, []);

  // 页面/窗口滚动监听：超过阈值时将表头切为 position:fixed
  useEffect(() => {
    const onScroll = () => {
      if (!outerRef.current) return;
      const { top, left, width } = outerRef.current.getBoundingClientRect();
      // 宽度为 0 说明所在 Tab 不可见，隐藏吸顶表头
      if (width === 0) {
        setHeaderFixed(false);
        return;
      }
      if (top < TABS_H) {
        setHeaderFixed(true);
        setFixedPos({ left, width });
      } else {
        setHeaderFixed(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // 右侧横向滚动 → 同步两个表头的 scrollLeft
  const syncHeader = () => {
    const sl = bodyRef.current?.scrollLeft ?? 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = sl;
    if (fixedScrollRef.current)  fixedScrollRef.current.scrollLeft  = sl;
  };

  // 吸顶表头刚挂载时，立即同步一次横向滚动位置
  useEffect(() => {
    if (headerFixed) syncHeader();
  }, [headerFixed]);

  // 自动计算时间范围
  const autoRange = React.useMemo((): [dayjs.Dayjs, dayjs.Dayjs] => {
    const dates: dayjs.Dayjs[] = [];
    activities.forEach((a) => {
      if (a.planStartDate) dates.push(dayjs(a.planStartDate));
      if (a.planEndDate)   dates.push(dayjs(a.planEndDate));
      if (a.startDate)     dates.push(dayjs(a.startDate));
      if (a.endDate)       dates.push(dayjs(a.endDate));
    });
    if (dates.length === 0) return [dayjs().subtract(7, 'day'), dayjs().add(30, 'day')];
    const minDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b));
    const maxDate = dates.reduce((a, b) => (a.isAfter(b) ? a : b));
    return [minDate.subtract(3, 'day'), maxDate.add(3, 'day')];
  }, [activities]);

  const [rangeStart, rangeEnd] = customRange || autoRange;
  const dayWidth    = VIEW_CONFIG[viewMode].dayWidth;
  const totalDays   = daysBetween(rangeStart, rangeEnd) + 1;
  const totalWidth  = totalDays * dayWidth;
  const today       = dayjs();
  const todayX      = daysBetween(rangeStart, today) * dayWidth;
  const isDualHeader = viewMode === 'day' || viewMode === 'week';
  const headerHeight = isDualHeader ? HEADER_TOP + HEADER_H : HEADER_H;

  // 计算活动 bar 位置
  const getBarProps = (a: Activity, type: 'plan' | 'actual') => {
    const startDate = type === 'plan' ? a.planStartDate : a.startDate;
    const endDate   = type === 'plan' ? a.planEndDate   : a.endDate;
    if (!startDate) return null;
    const x   = daysBetween(rangeStart, dayjs(startDate)) * dayWidth;
    const end = endDate ? daysBetween(rangeStart, dayjs(endDate)) * dayWidth + dayWidth : x + dayWidth;
    const w   = Math.max(end - x, dayWidth);
    return { x, w };
  };

  // 通用分组行渲染
  const renderGroupRow = (
    groups: Array<{ label: string; days: number }>,
    h: number,
    fs: number,
    bg?: string,
  ) => (
    <div style={{ display: 'flex', height: h, borderBottom: '1px solid var(--color-border-2)', background: bg }}>
      {groups.map((g, i) => (
        <div
          key={i}
          style={{
            width: g.days * dayWidth,
            minWidth: g.days * dayWidth,
            flexShrink: 0,
            borderRight: '1px solid var(--color-border-2)',
            paddingLeft: 6,
            fontSize: fs,
            color: 'var(--color-text-2)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {g.label}
        </div>
      ))}
    </div>
  );

  // Header 渲染（按视图模式分发）
  const renderHeader = () => {
    switch (viewMode) {
      case 'year':
        return renderGroupRow(getYearGroups(rangeStart, rangeEnd), HEADER_H, 12);

      case 'quarter':
        return renderGroupRow(getQuarterGroups(rangeStart, rangeEnd), HEADER_H, 12);

      case 'month':
        return renderGroupRow(getMonthGroups(rangeStart, rangeEnd), HEADER_H, 12);

      case 'week': {
        const monthGroups = getMonthGroups(rangeStart, rangeEnd);
        const weekGroups  = getWeekGroups(rangeStart, rangeEnd);
        return (
          <>
            {renderGroupRow(monthGroups, HEADER_TOP, 10, 'var(--color-primary-light-1)')}
            {renderGroupRow(weekGroups, HEADER_H, 11)}
          </>
        );
      }

      case 'day': {
        const monthGroups = getMonthGroups(rangeStart, rangeEnd);
        const days: dayjs.Dayjs[] = [];
        for (let i = 0; i < totalDays; i++) days.push(rangeStart.add(i, 'day'));
        return (
          <>
            {renderGroupRow(monthGroups, HEADER_TOP, 10, 'var(--color-primary-light-1)')}
            <div style={{ display: 'flex', height: HEADER_H, borderBottom: '1px solid var(--color-border-2)' }}>
              {days.map((d, i) => {
                const isWeekend = d.day() === 0 || d.day() === 6;
                const isToday   = d.isSame(dayjs(), 'day');
                return (
                  <div
                    key={i}
                    style={{
                      width: dayWidth, minWidth: dayWidth, flexShrink: 0,
                      textAlign: 'center', fontSize: 11,
                      color: isToday ? TODAY_COLOR : isWeekend ? 'var(--color-text-4)' : 'var(--color-text-2)',
                      borderRight: '1px solid var(--color-border-3)',
                      fontWeight: isToday ? 700 : undefined,
                      background: isWeekend ? 'var(--color-fill-1)' : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {d.format('D')}
                  </div>
                );
              })}
            </div>
          </>
        );
      }
    }
  };

  if (activities.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)' }}>
        暂无活动数据，请先创建活动
      </div>
    );
  }

  // 表头区域（工具栏 + 图例 + 时间轴行）渲染辅助函数
  // scrollRef 区分「普通流」和「fixed 复制」两个 DOM 节点各自的横向滚动引用
  // isFixed 区分是否为吸顶表头：吸顶时去掉圆角，避免左上角内容从圆角缝隙透出
  const renderHeaderBlock = (scrollRef: React.RefObject<HTMLDivElement>, isFixed = false) => (
    <>
      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', flexWrap: 'wrap', gap: 8 }}>
        <Space size={4}>
          {(['day', 'week', 'month', 'quarter', 'year'] as ViewMode[]).map((m) => (
            <Button key={m} size="small" type={viewMode === m ? 'primary' : 'secondary'} onClick={() => setViewMode(m)}>
              {VIEW_CONFIG[m].label}
            </Button>
          ))}
        </Space>
        <Space>
          <RangePicker
            size="small"
            style={{ width: 220 }}
            value={customRange ? [customRange[0], customRange[1]] : undefined}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setCustomRange([dayjs(dates[0] as unknown as string), dayjs(dates[1] as unknown as string)]);
              } else {
                setCustomRange(null);
              }
            }}
            placeholder={['开始', '结束']}
          />
          {customRange && <Button size="small" icon={<IconRefresh />} onClick={() => setCustomRange(null)} />}
        </Space>
      </div>
      {/* 图例 */}
      <div style={{ display: 'flex', gap: 12, paddingBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {LEGEND_ITEMS.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: item.color || 'var(--color-text-3)' }}>
            {item.icon}<span>{item.label}</span>
          </div>
        ))}
      </div>
      {/* 时间轴表头行 */}
      <div style={{ display: 'flex', border: '1px solid var(--color-border-2)', borderBottom: 'none', borderRadius: isFixed ? 0 : '6px 6px 0 0', background: 'var(--color-fill-1)' }}>
        <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0, height: headerHeight, borderRight: '1px solid var(--color-border-2)', display: 'flex', alignItems: 'center', paddingLeft: 12, fontWeight: 600, fontSize: 13 }}>
          活动名称
        </div>
        <div ref={scrollRef} style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ width: totalWidth, minWidth: '100%', background: 'var(--color-fill-1)' }}>{renderHeader()}</div>
        </div>
      </div>
    </>
  );

  return (
    <div ref={outerRef}>
      {/* ===== 普通流表头：始终保留空间，未固定时可见 ===== */}
      <div style={{ visibility: headerFixed ? 'hidden' : 'visible', background: 'var(--color-bg-1)' }}>
        {renderHeaderBlock(headerScrollRef)}
      </div>

      {/* ===== 吸顶复制表头：portal 到 body，避开 Tabs transform 上下文 ===== */}
      {headerFixed && createPortal(
        <div style={{
          position: 'fixed',
          top: TABS_H,
          left: fixedPos.left,
          width: fixedPos.width,
          zIndex: 1000,
          background: 'var(--color-bg-1)',
          borderBottom: '1px solid var(--color-border-2)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}>
          {renderHeaderBlock(fixedScrollRef, true)}
        </div>,
        document.body,
      )}

      {/* ===== 活动行区域（自然高度，跟随页面滚动） ===== */}
      <div style={{ display: 'flex', border: '1px solid var(--color-border-2)', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>

        {/* 左侧标签列（横向固定，无独立滚动） */}
        <div style={{ width: LABEL_COL_W, minWidth: LABEL_COL_W, flexShrink: 0, borderRight: '1px solid var(--color-border-2)', background: 'var(--color-bg-1)', position: 'relative', zIndex: 2 }}>
          {activities.map((a, idx) => {
            const statusCfg = ACTIVITY_STATUS_MAP[a.status as keyof typeof ACTIVITY_STATUS_MAP] ?? { label: a.status, color: 'default' };
            return (
              <div
                key={a.id}
                style={{
                  height: ROW_H,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 12, paddingRight: 8,
                  borderBottom: '1px solid var(--color-fill-2)',
                  background: hoveredId === a.id ? 'var(--color-primary-light-1)' : (idx % 2 === 0 ? 'var(--color-bg-1)' : 'var(--color-fill-1)'),
                  fontSize: 12, gap: 6, overflow: 'hidden',
                }}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span style={{ color: 'var(--color-text-3)', fontFamily: 'monospace', fontSize: 11 }}>
                  {String(idx + 1).padStart(3, '0')}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {a.name}
                </span>
                <Tag color={statusCfg.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                  {statusCfg.label}
                </Tag>
              </div>
            );
          })}
        </div>

        {/* 右侧横向滚动区（仅横向，纵向随页面） */}
        <div
          ref={bodyRef}
          onScroll={syncHeader}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'visible' }}
        >
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
            {/* 今天竖线 */}
            {todayX >= 0 && todayX <= totalWidth && (
              <div
                style={{
                  position: 'absolute', left: todayX, top: 0, bottom: 0,
                  width: 2, background: TODAY_COLOR, zIndex: 5, opacity: 0.8,
                }}
              />
            )}

            {/* 任务行 */}
            {activities.map((a, idx) => {
              const planBar     = getBarProps(a, 'plan');
              const actualBar   = getBarProps(a, 'actual');
              const color       = STATUS_BAR_COLOR[a.status] || '#86909c';
              const progress    = getStatusProgress(a.status);
              const isMilestone = a.type === 'MILESTONE';

              return (
                <Tooltip
                  key={a.id}
                  content={
                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                      <div><strong>{a.name}</strong></div>
                      {a.planStartDate && (
                        <div>计划：{dayjs(a.planStartDate).format('MM-DD')} ~ {a.planEndDate ? dayjs(a.planEndDate).format('MM-DD') : '?'} ({a.planDuration || '-'}工作日)</div>
                      )}
                      {a.startDate && (
                        <div>实际：{dayjs(a.startDate).format('MM-DD')} ~ {a.endDate ? dayjs(a.endDate).format('MM-DD') : '进行中'} ({a.duration || '-'}工作日)</div>
                      )}
                      <div>状态：{ACTIVITY_STATUS_MAP[a.status as keyof typeof ACTIVITY_STATUS_MAP]?.label || a.status}</div>
                      {(a.assignees?.length ? <div>负责人：{a.assignees.map((u) => u.realName).join(', ')}</div> : a.assignee && <div>负责人：{a.assignee.realName}</div>)}
                    </div>
                  }
                  position="right"
                >
                  <div
                    style={{
                      height: ROW_H, position: 'relative',
                      borderBottom: '1px solid var(--color-fill-2)',
                      background: hoveredId === a.id ? 'var(--color-primary-light-1)' : (idx % 2 === 0 ? 'var(--color-bg-1)' : 'var(--color-fill-1)'),
                    }}
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* 计划条（虚线） */}
                    {planBar && (
                      <div
                        style={{
                          position: 'absolute',
                          left: planBar.x, top: BAR_Y_PLAN,
                          width: planBar.w, height: BAR_H_PLAN,
                          border: '1px dashed #c2c7d0',
                          background: 'transparent',
                          borderRadius: 2,
                        }}
                      />
                    )}

                    {/* 实际时间条 */}
                    {actualBar && !isMilestone && (
                      <div
                        style={{
                          position: 'absolute',
                          left: actualBar.x, top: BAR_Y_ACT,
                          width: actualBar.w, height: BAR_H_ACT,
                          background: 'var(--color-fill-3)',
                          borderRadius: 3, overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${progress}%`,
                            background: color, borderRadius: 3,
                          }}
                        />
                      </div>
                    )}

                    {/* 里程碑菱形 */}
                    {isMilestone && actualBar && (
                      <div
                        style={{
                          position: 'absolute',
                          left: actualBar.x + actualBar.w / 2 - 7,
                          top: BAR_Y_ACT - 2,
                          width: 14, height: 14,
                          background: '#ff7d00',
                          transform: 'rotate(45deg)',
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
