import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Select,
  Tag,
  Tooltip,
  Empty,
  DatePicker,
  Space,
  Modal,
  Message,
  Tabs,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconRight,
  IconEdit,
  IconSend,
  IconDelete,
} from '@arco-design/web-react/icon';
import MainLayout from '../../layouts/MainLayout';
import { weeklyReportsApi } from '../../api';
import { WeeklyReport, ReportAttachment } from '../../types';
import { useReportPermission } from '../../hooks/useReportPermission';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import { PRODUCT_LINE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const PROGRESS_ICON: Record<string, string> = {
  ON_TRACK: '✓',
  MINOR_ISSUE: '⚠️',
  MAJOR_ISSUE: '✕',
};
const PROGRESS_TOOLTIP: Record<string, string> = {
  ON_TRACK: '顺利进行',
  MINOR_ISSUE: '轻度阻碍',
  MAJOR_ISSUE: '严重阻碍',
};
const PROGRESS_COLOR: Record<string, string> = {
  ON_TRACK: 'var(--status-success)',
  MINOR_ISSUE: 'var(--status-warning)',
  MAJOR_ISSUE: 'var(--status-danger)',
};

/** 计算 ISO 周的日期范围 */
const getWeekRange = (year: number, weekNumber: number) => {
  const d = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);
  return `${d.format('MM-DD')} ~ ${d.add(6, 'day').format('MM-DD')}`;
};

interface WeekGroup {
  key: string;
  year: number;
  weekNumber: number;
  label: string;
  reports: WeeklyReport[];
}

const WeeklyReportsSummary: React.FC = () => {
  const navigate = useNavigate();
  const { canEdit: canEditReport, canDelete } = useReportPermission();

  const [activeTab, setActiveTab] = useState<string>('submitted');
  const [currentWeek, setCurrentWeek] = useState<dayjs.Dayjs | null>(null);
  const [productLine, setProductLine] = useState<string>('');
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [drafts, setDrafts] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);

  const weekStart = currentWeek?.startOf('isoWeek' as dayjs.OpUnitType);
  const weekEnd = weekStart?.add(6, 'day');
  const year = currentWeek?.year();
  const weekNumber = currentWeek?.isoWeek();

  const loadReports = async () => {
    setLoading(true);
    try {
      if (currentWeek && year !== undefined && weekNumber !== undefined) {
        const params = productLine ? { productLine } : undefined;
        const res = await weeklyReportsApi.getByWeek(year, weekNumber, params);
        // getByWeek 不区分 status，手动过滤掉 DRAFT
        const data = (res.data || []) as WeeklyReport[];
        setReports(data.filter((r) => r.status !== 'DRAFT'));
      } else {
        const params: Record<string, unknown> = { pageSize: 100 };
        if (productLine) params.productLine = productLine;
        const res = await weeklyReportsApi.list(params as Parameters<typeof weeklyReportsApi.list>[0]);
        setReports(res.data?.data || []);
      }
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDrafts = async () => {
    setDraftsLoading(true);
    try {
      const res = await weeklyReportsApi.getDrafts();
      setDrafts(res.data || []);
    } catch {
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [year, weekNumber, productLine]);

  useEffect(() => {
    if (activeTab === 'drafts') {
      loadDrafts();
    }
  }, [activeTab]);

  const handleSubmit = (report: WeeklyReport) => {
    Modal.confirm({
      title: '提交周报',
      content: `确定要提交第${report.weekNumber}周周报吗？提交后不可撤回。`,
      onOk: async () => {
        try {
          await weeklyReportsApi.submit(report.id);
          Message.success('周报提交成功');
          if (activeTab === 'drafts') loadDrafts();
          loadReports();
        } catch {
          Message.error('提交失败');
        }
      },
    });
  };

  const handleDelete = (report: WeeklyReport) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除第${report.weekNumber}周周报吗？`,
      onOk: async () => {
        try {
          await weeklyReportsApi.delete(report.id);
          Message.success('删除成功');
          if (activeTab === 'drafts') loadDrafts();
          else loadReports();
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  // ===== 按周次分组逻辑 =====
  const weekGroups = useMemo<WeekGroup[]>(() => {
    const map = new Map<string, WeeklyReport[]>();
    for (const r of reports) {
      const key = `${r.year}-${r.weekNumber}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const groups: WeekGroup[] = [];
    for (const [key, groupReports] of map) {
      const [y, w] = key.split('-').map(Number);
      groupReports.sort((a, b) => (a.project?.name || '').localeCompare(b.project?.name || ''));
      groups.push({
        key,
        year: y,
        weekNumber: w,
        label: `${y} 年第 ${w} 周 · ${getWeekRange(y, w)}`,
        reports: groupReports,
      });
    }
    groups.sort((a, b) => a.year !== b.year ? b.year - a.year : b.weekNumber - a.weekNumber);
    return groups;
  }, [reports]);

  // ===== 已提交周报的表格列 =====
  const submittedColumns = [
    {
      title: '项目名称',
      dataIndex: 'project.name',
      width: 200,
      sorter: (a: WeeklyReport, b: WeeklyReport) => {
        const nameA = a.project?.name || '';
        const nameB = b.project?.name || '';
        return nameA.localeCompare(nameB);
      },
      render: (_: unknown, record: WeeklyReport) => (
        <a
          style={{ color: 'rgb(var(--primary-6))', fontWeight: 500, cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${record.projectId}?tab=weekly`)}
        >
          {record.project?.name || '-'}
        </a>
      ),
    },
    {
      title: '产品线',
      width: 120,
      render: (_: unknown, record: WeeklyReport) => {
        const pl = record.project?.productLine || '';
        const cfg = PRODUCT_LINE_MAP[pl as keyof typeof PRODUCT_LINE_MAP] ?? { label: pl || '-', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '状态',
      width: 80,
      sorter: (a: WeeklyReport, b: WeeklyReport) => a.progressStatus.localeCompare(b.progressStatus),
      render: (_: unknown, record: WeeklyReport) => {
        const icon = PROGRESS_ICON[record.progressStatus] || '?';
        const color = PROGRESS_COLOR[record.progressStatus] || 'var(--status-not-started)';
        const tip = PROGRESS_TOOLTIP[record.progressStatus] || record.progressStatus;
        return (
          <Tooltip content={tip}>
            <span style={{ color, fontWeight: 700, fontSize: 16, cursor: 'default' }}>{icon}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '变更概述',
      width: 180,
      render: (_: unknown, record: WeeklyReport) => (
        <SafeHtml
          className="html-content"
          style={{ maxHeight: 80, overflow: 'hidden', fontSize: 13, color: 'var(--color-text-2)' }}
          html={record.changeOverview || '<span style="color:var(--color-text-4)">-</span>'}
        />
      ),
    },
    {
      title: '需求研判',
      width: 180,
      render: (_: unknown, record: WeeklyReport) => (
        <SafeHtml
          className="html-content"
          style={{ maxHeight: 80, overflow: 'hidden', fontSize: 13, color: 'var(--color-text-2)' }}
          html={record.demandAnalysis || '<span style="color:var(--color-text-4)">-</span>'}
        />
      ),
    },
    {
      title: '本周重要进展',
      render: (_: unknown, record: WeeklyReport) => {
        const sectionAtts = ((record.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'keyProgress');
        return (
          <div>
            <SafeHtml
              className="html-content"
              style={{ maxHeight: 80, overflow: 'hidden', fontSize: 13, color: 'var(--color-text-2)' }}
              html={record.keyProgress || '<span style="color:var(--color-text-4)">暂无</span>'}
            />
            {sectionAtts.length > 0 && (
              <AttachmentList attachments={sectionAtts} section="keyProgress" readOnly />
            )}
          </div>
        );
      },
    },
    {
      title: '下周工作计划',
      render: (_: unknown, record: WeeklyReport) => {
        const sectionAtts = ((record.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'nextWeekPlan');
        return (
          <div>
            <SafeHtml
              className="html-content"
              style={{ maxHeight: 80, overflow: 'hidden', fontSize: 13, color: 'var(--color-text-2)' }}
              html={record.nextWeekPlan || '<span style="color:var(--color-text-4)">暂无</span>'}
            />
            {sectionAtts.length > 0 && (
              <AttachmentList attachments={sectionAtts} section="nextWeekPlan" readOnly />
            )}
          </div>
        );
      },
    },
    {
      title: '风险预警',
      width: 200,
      render: (_: unknown, record: WeeklyReport) => {
        const sectionAtts = ((record.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'riskWarning');
        return (
          <div>
            <SafeHtml
              className="html-content"
              style={{ maxHeight: 80, overflow: 'hidden', fontSize: 13 }}
              html={record.riskWarning || '<span style="color:var(--status-success)">无</span>'}
            />
            {sectionAtts.length > 0 && (
              <AttachmentList attachments={sectionAtts} section="riskWarning" readOnly />
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: WeeklyReport) => {
        if (!canEditReport(record)) return null;
        return (
          <Space>
            <Tooltip content="编辑">
              <Button type="text" icon={<IconEdit />} size="small"
                onClick={() => navigate(`/weekly-reports/${record.id}/edit`)} />
            </Tooltip>
            {canDelete(record) && (
              <Tooltip content="删除">
                <Button type="text" status="danger" icon={<IconDelete />} size="small"
                  onClick={() => handleDelete(record)} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  // ===== 草稿箱表格列 =====
  const draftColumns = [
    {
      title: '项目名称',
      dataIndex: 'project.name',
      width: 200,
      render: (_: unknown, record: WeeklyReport) => (
        <a
          style={{ color: 'rgb(var(--primary-6))', fontWeight: 500, cursor: 'pointer' }}
          onClick={() => navigate(`/projects/${record.projectId}?tab=weekly`)}
        >
          {record.project?.name || '-'}
        </a>
      ),
    },
    {
      title: '周次',
      width: 140,
      render: (_: unknown, record: WeeklyReport) => (
        <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          {record.year}年第{record.weekNumber}周
        </span>
      ),
    },
    {
      title: '产品线',
      width: 120,
      render: (_: unknown, record: WeeklyReport) => {
        const pl = record.project?.productLine || '';
        const cfg = PRODUCT_LINE_MAP[pl as keyof typeof PRODUCT_LINE_MAP] ?? { label: pl || '-', color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '更新时间',
      width: 160,
      sorter: (a: WeeklyReport, b: WeeklyReport) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      render: (_: unknown, record: WeeklyReport) => (
        <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
          {dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, record: WeeklyReport) => (
        <Space>
          <Tooltip content="编辑">
            <Button type="text" icon={<IconEdit />} size="small"
              onClick={() => navigate(`/weekly-reports/${record.id}/edit`)} />
          </Tooltip>
          <Tooltip content="提交">
            <Button type="text" icon={<IconSend />} size="small"
              onClick={() => handleSubmit(record)} />
          </Tooltip>
          {canDelete(record) && (
            <Tooltip content="删除">
              <Button type="text" status="danger" icon={<IconDelete />} size="small"
                onClick={() => handleDelete(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <MainLayout>
      <div>
        {/* 标题和操作栏 */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap' }}>项目周报汇总</h2>

            {activeTab === 'submitted' && (
              <Space>
                {/* 周次选择器 */}
                <div style={{ background: 'var(--subtle-bg)', borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tooltip content="上一周">
                    <Button
                      type="text"
                      size="small"
                      icon={<IconLeft />}
                      style={{ height: 28 }}
                      onClick={() =>
                        setCurrentWeek((d) => (d ? d.subtract(1, 'week') : dayjs().subtract(1, 'week')))
                      }
                    />
                  </Tooltip>
                  <DatePicker.WeekPicker
                    value={currentWeek || undefined}
                    onChange={(_dateStr, date) =>
                      setCurrentWeek(
                        date
                          ? (date as unknown as dayjs.Dayjs).startOf('isoWeek' as dayjs.OpUnitType)
                          : null
                      )
                    }
                    style={{ width: 140 }}
                    size="small"
                    format="YYYY-wo"
                    allowClear
                    placeholder="全部周次"
                  />
                  <Tooltip content="下一周">
                    <Button
                      type="text"
                      size="small"
                      icon={<IconRight />}
                      style={{ height: 28 }}
                      onClick={() =>
                        setCurrentWeek((d) => (d ? d.add(1, 'week') : dayjs().add(1, 'week')))
                      }
                    />
                  </Tooltip>
                </div>

                {currentWeek && weekStart && weekEnd && (
                  <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
                    {weekStart.format('MM-DD')} ~ {weekEnd.format('MM-DD')}
                  </span>
                )}

                {/* 产品线筛选 */}
                <Select
                  style={{ width: 180 }}
                  placeholder="全部产品线"
                  allowClear
                  value={productLine || undefined}
                  onChange={(v) => setProductLine(v || '')}
                >
                  {Object.entries(PRODUCT_LINE_MAP).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v.label}</Select.Option>
                  ))}
                </Select>
              </Space>
            )}
          </div>
        </Card>

        {/* Tab 切换 */}
        <Card>
          <Tabs activeTab={activeTab} onChange={setActiveTab}>
            <Tabs.TabPane key="submitted" title="已提交周报">
              {weekGroups.length === 0 && !loading ? (
                <Empty description={currentWeek ? '该周暂无周报' : '暂无周报'} />
              ) : (
                weekGroups.map((group) => (
                  <div key={group.key} style={{ marginBottom: 24 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-text-1)',
                      marginBottom: 8,
                      paddingBottom: 6,
                      borderBottom: '1px solid var(--color-border-2)',
                    }}>
                      {group.label}
                    </div>
                    <Table
                      columns={submittedColumns}
                      data={group.reports}
                      loading={loading}
                      rowKey="id"
                      pagination={false}
                      scroll={{ x: 1200 }}
                      size="small"
                    />
                  </div>
                ))
              )}
            </Tabs.TabPane>

            <Tabs.TabPane key="drafts" title="草稿箱">
              <Table
                columns={draftColumns}
                data={drafts}
                loading={draftsLoading}
                rowKey="id"
                pagination={{ pageSize: 20, showTotal: true }}
                scroll={{ x: 800 }}
                noDataElement={<Empty description="暂无草稿" />}
              />
            </Tabs.TabPane>
          </Tabs>
        </Card>
      </div>
    </MainLayout>
  );
};

export default WeeklyReportsSummary;
