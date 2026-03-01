import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Space,
  Tag,
  Empty,
  Modal,
  Message,
  Tooltip,
} from '@arco-design/web-react';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconSend,
  IconCheckCircleFill,
  IconExclamationCircleFill,
  IconCloseCircleFill,
} from '@arco-design/web-react/icon';
import { weeklyReportsApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { useReportPermission } from '../../hooks/useReportPermission';
import { WeeklyReport, ReportAttachment } from '../../types';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import { REPORT_STATUS_MAP, PROGRESS_STATUS_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

interface Props {
  projectId: string;
  managerId?: string;
  collaboratingProjectIds?: string[];
  isArchived?: boolean;
  snapshotData?: any[] | null;
}

const PROGRESS_ICON: Record<string, React.ReactNode> = {
  ON_TRACK: <IconCheckCircleFill />,
  MINOR_ISSUE: <IconExclamationCircleFill />,
  MAJOR_ISSUE: <IconCloseCircleFill />,
};

const PROGRESS_COLOR: Record<string, string> = {
  ON_TRACK: 'var(--status-success)',
  MINOR_ISSUE: 'var(--status-warning)',
  MAJOR_ISSUE: 'var(--status-danger)',
};

const ProjectWeeklyTab: React.FC<Props> = ({ projectId, managerId, isArchived, snapshotData }) => {
  const navigate = useNavigate();
  const { hasPermission, isProjectManager } = useAuthStore();
  const { canEdit: canEditReport, canDelete } = useReportPermission();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await weeklyReportsApi.getByProject(projectId);
      setReports(res.data || []);
    } catch {
      Message.error('加载周报列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (snapshotData) {
      setReports(snapshotData as WeeklyReport[]);
    } else {
      load();
    }
  }, [projectId, snapshotData]);

  const handleCreate = () => {
    navigate(`/weekly-reports/new?projectId=${projectId}`);
  };

  const handleSubmit = (report: WeeklyReport) => {
    Modal.confirm({
      title: '提交周报',
      content: `确定要提交第${report.weekNumber}周周报吗？提交后不可撤回。`,
      onOk: async () => {
        try {
          await weeklyReportsApi.submit(report.id);
          Message.success('周报提交成功');
          load();
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
          load();
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-3)' }}>加载中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>共 {reports.length} 份周报</span>
        {!isArchived && hasPermission('weekly_report', 'create') && isProjectManager(managerId ?? '', projectId) && (
          <Button type="primary" icon={<IconPlus />} onClick={handleCreate}>创建周报</Button>
        )}
      </div>

      {reports.length === 0 ? (
        <Empty description="暂无周报" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {reports.map((report) => {
            const statusCfg = REPORT_STATUS_MAP[report.status as keyof typeof REPORT_STATUS_MAP] ?? { label: report.status, color: 'default' };
            const progressCfg = PROGRESS_STATUS_MAP[report.progressStatus as keyof typeof PROGRESS_STATUS_MAP] ?? { label: report.progressStatus, color: 'default' };
            const icon = PROGRESS_ICON[report.progressStatus] || '?';
            const iconColor = PROGRESS_COLOR[report.progressStatus] || 'var(--status-not-started)';

            return (
              <Card
                key={report.id}
                style={{ width: '100%' }}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: iconColor, fontSize: 18, display: 'inline-flex' }}>{icon}</span>
                    <span style={{ fontWeight: 600 }}>
                      {report.year} 年第 {report.weekNumber} 周
                    </span>
                    <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
                      {dayjs(report.weekStart).format('MM-DD')} ~ {dayjs(report.weekEnd).format('MM-DD')}
                    </span>
                    <Tag color={statusCfg.color}>{statusCfg.label}</Tag>
                    <Tag color={progressCfg.color}>{progressCfg.label}</Tag>
                  </div>
                }
                extra={
                  !isArchived && canEditReport(report) ? (
                  <Space>
                    <Tooltip content="编辑">
                      <Button type="text" icon={<IconEdit />} size="small"
                        onClick={() => navigate(`/weekly-reports/${report.id}/edit`)} />
                    </Tooltip>
                    {report.status === 'DRAFT' && (
                      <Tooltip content="提交">
                        <Button type="text" icon={<IconSend />} size="small"
                          onClick={() => handleSubmit(report)} />
                      </Tooltip>
                    )}
                    {canDelete(report) && (
                      <Tooltip content="删除">
                        <Button type="text" status="danger" icon={<IconDelete />} size="small"
                          onClick={() => handleDelete(report)} />
                      </Tooltip>
                    )}
                  </Space>
                  ) : undefined
                }
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  {/* 本周重要进展 */}
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>本周重要进展</div>
                    {report.keyProgress ? (
                      <SafeHtml
                        className="html-content"
                        style={{ fontSize: 13, color: 'var(--color-text-2)', maxHeight: 120, overflow: 'hidden' }}
                        html={report.keyProgress}
                      />
                    ) : (
                      <span style={{ color: 'var(--color-text-4)', fontSize: 13 }}>暂无内容</span>
                    )}
                    {((report.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'keyProgress').length > 0 && (
                      <AttachmentList
                        attachments={(report.attachments as ReportAttachment[]).filter(a => a.section === 'keyProgress')}
                        section="keyProgress"
                        readOnly
                      />
                    )}
                  </div>

                  {/* 下周工作计划 */}
                  <div style={{ borderLeft: '1px solid var(--color-border-2)', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>下周工作计划</div>
                    {report.nextWeekPlan ? (
                      <SafeHtml
                        className="html-content"
                        style={{ fontSize: 13, color: 'var(--color-text-2)', maxHeight: 120, overflow: 'hidden' }}
                        html={report.nextWeekPlan}
                      />
                    ) : (
                      <span style={{ color: 'var(--color-text-4)', fontSize: 13 }}>暂无内容</span>
                    )}
                    {((report.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'nextWeekPlan').length > 0 && (
                      <AttachmentList
                        attachments={(report.attachments as ReportAttachment[]).filter(a => a.section === 'nextWeekPlan')}
                        section="nextWeekPlan"
                        readOnly
                      />
                    )}
                  </div>

                  {/* 风险预警 */}
                  <div style={{ borderLeft: '1px solid var(--color-border-2)', paddingLeft: 16 }}>
                    <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13, color: report.riskWarning ? 'var(--status-danger)' : 'var(--color-text-2)' }}>
                      风险预警
                    </div>
                    {report.riskWarning ? (
                      <SafeHtml
                        className="html-content"
                        style={{ fontSize: 13, color: 'var(--color-text-2)', maxHeight: 120, overflow: 'hidden' }}
                        html={report.riskWarning}
                      />
                    ) : (
                      <span style={{ color: 'var(--status-success)', fontSize: 13 }}>✓ 无风险</span>
                    )}
                    {((report.attachments as ReportAttachment[] | undefined) || []).filter(a => a.section === 'riskWarning').length > 0 && (
                      <AttachmentList
                        attachments={(report.attachments as ReportAttachment[]).filter(a => a.section === 'riskWarning')}
                        section="riskWarning"
                        readOnly
                      />
                    )}
                  </div>
                </div>

                {/* 卡片底部 */}
                <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--divider-color)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                    创建人：{report.creator?.realName || '-'}
                  </span>
                  {report.submittedAt && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                      提交时间：{dayjs(report.submittedAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </Space>
      )}
    </div>
  );
};

export default ProjectWeeklyTab;
