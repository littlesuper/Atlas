import React, { useState, useEffect } from 'react';
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
import { PRODUCT_LINE_MAP, REPORT_STATUS_MAP } from '../../utils/constants';
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
  ON_TRACK: '#00b42a',
  MINOR_ISSUE: '#ff7d00',
  MAJOR_ISSUE: '#f53f3f',
};

const WeeklyReportsSummary: React.FC = () => {
  const navigate = useNavigate();
  const { canEdit: canEditReport, canDelete } = useReportPermission();
  const [currentWeek, setCurrentWeek] = useState<dayjs.Dayjs | null>(null);
  const [productLine, setProductLine] = useState<string>('');
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);

  const weekStart = currentWeek?.startOf('isoWeek' as dayjs.OpUnitType);
  const weekEnd = weekStart?.add(6, 'day');
  const year = currentWeek?.year();
  const weekNumber = currentWeek?.isoWeek();

  const loadReports = async () => {
    setLoading(true);
    try {
      if (currentWeek && year !== undefined && weekNumber !== undefined) {
        // 按指定周次加载
        const params = productLine ? { productLine } : undefined;
        const res = await weeklyReportsApi.getByWeek(year, weekNumber, params);
        setReports(res.data || []);
      } else {
        // 不选时间，加载全部
        const params: Record<string, unknown> = { pageSize: 999 };
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

  useEffect(() => {
    loadReports();
  }, [year, weekNumber, productLine]);

  const handleSubmit = (report: WeeklyReport) => {
    Modal.confirm({
      title: '提交周报',
      content: `确定要提交第${report.weekNumber}周周报吗？提交后不可撤回。`,
      onOk: async () => {
        try {
          await weeklyReportsApi.submit(report.id);
          Message.success('周报提交成功');
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
          loadReports();
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  const columns = [
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
        <div>
          <a
            style={{ color: 'rgb(var(--primary-6))', fontWeight: 500, cursor: 'pointer' }}
            onClick={() => navigate(`/projects/${record.projectId}?tab=weekly`)}
          >
            {record.project?.name || '-'}
          </a>
          {record.status === 'DRAFT' && (
            <div style={{ marginTop: 4 }}>
              <Tag size="small" color={REPORT_STATUS_MAP.DRAFT.color}>{REPORT_STATUS_MAP.DRAFT.label}</Tag>
            </div>
          )}
        </div>
      ),
    },
    // 不选周次时显示周次列
    ...(!currentWeek
      ? [
          {
            title: '周次',
            width: 100,
            sorter: (a: WeeklyReport, b: WeeklyReport) => a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber,
            render: (_: unknown, record: WeeklyReport) => (
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {record.year}年第{record.weekNumber}周
              </span>
            ),
          },
        ]
      : []),
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
        const color = PROGRESS_COLOR[record.progressStatus] || '#86909c';
        const tip = PROGRESS_TOOLTIP[record.progressStatus] || record.progressStatus;
        return (
          <Tooltip content={tip}>
            <span style={{ color, fontWeight: 700, fontSize: 16, cursor: 'default' }}>{icon}</span>
          </Tooltip>
        );
      },
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
              html={record.keyProgress || '<span style="color:#c2c7d0">暂无</span>'}
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
              html={record.nextWeekPlan || '<span style="color:#c2c7d0">暂无</span>'}
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
              html={record.riskWarning || '<span style="color:#00b42a">无</span>'}
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
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: WeeklyReport) => {
        if (!canEditReport(record)) return null;
        return (
          <Space>
            <Tooltip content="编辑">
              <Button type="text" icon={<IconEdit />} size="small"
                onClick={() => navigate(`/weekly-reports/${record.id}/edit`)} />
            </Tooltip>
            {record.status === 'DRAFT' && (
              <Tooltip content="提交">
                <Button type="text" icon={<IconSend />} size="small"
                  onClick={() => handleSubmit(record)} />
              </Tooltip>
            )}
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

  return (
    <MainLayout>
      <div>
        {/* 标题和操作栏 */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap' }}>项目周报汇总</h2>

            <Space>
              {/* 周次选择器 */}
              <div style={{ background: '#fafafa', borderRadius: 6, padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
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
          </div>
        </Card>

        {/* 数据表格 */}
        <Card>
          <Table
            columns={columns}
            data={reports}
            loading={loading}
            rowKey="id"
            pagination={!currentWeek ? { pageSize: 20, showTotal: true } : false}
            scroll={{ x: 1200 }}
            noDataElement={<Empty description={currentWeek ? '该周暂无周报' : '暂无周报'} />}
          />
        </Card>
      </div>
    </MainLayout>
  );
};

export default WeeklyReportsSummary;
