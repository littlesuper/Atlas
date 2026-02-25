import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Input,
  DatePicker,
  Message,
  Spin,
  Radio,
  Collapse,
} from '@arco-design/web-react';
import {
  IconLeft,
  IconSave,
  IconSend,
  IconBulb,
} from '@arco-design/web-react/icon';
import MainLayout from '../../layouts/MainLayout';
import { weeklyReportsApi, projectsApi, uploadApi } from '../../api';
import { Project, ReportAttachment } from '../../types';
import RichTextEditor, { RichTextEditorRef } from '../../components/RichTextEditor';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const { TextArea } = Input;

const PHASES = ['EVT', 'DVT', 'PVT', 'MP'];

type ProgressStatus = 'ON_TRACK' | 'MINOR_ISSUE' | 'MAJOR_ISSUE';

interface PhaseData {
  progress: string;
  risks: string;
  schedule: string;
}

const PROGRESS_OPTIONS: Array<{ value: ProgressStatus; label: string; color: string }> = [
  { value: 'ON_TRACK', label: '✓ 顺利进行', color: 'var(--status-success)' },
  { value: 'MINOR_ISSUE', label: '⚠️ 轻度阻碍', color: 'var(--status-warning)' },
  { value: 'MAJOR_ISSUE', label: '✕ 严重阻碍', color: 'var(--status-danger)' },
];

const WeeklyReportForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectIdParam = searchParams.get('projectId');

  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // 基本数据
  const [project, setProject] = useState<Project | null>(null);

  // 表单字段
  const [projectId, setProjectId] = useState(projectIdParam || '');
  const [weekDate, setWeekDate] = useState<dayjs.Dayjs>(dayjs().startOf('isoWeek' as dayjs.OpUnitType));
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>('ON_TRACK');
  const [keyProgress, setKeyProgress] = useState('');
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [riskWarning, setRiskWarning] = useState('');
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [phaseProgress, setPhaseProgress] = useState<Record<string, PhaseData>>({
    EVT: { progress: '', risks: '', schedule: '' },
    DVT: { progress: '', risks: '', schedule: '' },
    PVT: { progress: '', risks: '', schedule: '' },
    MP: { progress: '', risks: '', schedule: '' },
  });

  // 富文本编辑器 ref（用于 AI 采用按钮）
  const keyProgressRef = useRef<RichTextEditorRef>(null);
  const nextWeekPlanRef = useRef<RichTextEditorRef>(null);
  const riskWarningRef = useRef<RichTextEditorRef>(null);

  // AI 建议
  const [aiSuggestions, setAiSuggestions] = useState<{
    keyProgress?: string;
    nextWeekPlan?: string;
    riskWarning?: string;
  } | null>(null);

  // 返回：始终导航到项目详情的周报 Tab
  const goBack = () => {
    if (projectId) {
      navigate(`/projects/${projectId}?tab=weekly`, { replace: true });
    } else {
      navigate('/weekly-reports', { replace: true });
    }
  };

  // 周次计算
  const weekStart = weekDate.startOf('isoWeek' as dayjs.OpUnitType);
  const weekEnd = weekStart.add(6, 'day');

  // 加载数据
  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      weeklyReportsApi.get(id).then((res) => {
        const r = res.data;
        setProjectId(r.projectId);
        setWeekDate(dayjs(r.weekStart));
        setProgressStatus(r.progressStatus as ProgressStatus);
        setKeyProgress(r.keyProgress || '');
        setNextWeekPlan(r.nextWeekPlan || '');
        setRiskWarning(r.riskWarning || '');
        if (r.attachments) {
          setAttachments(r.attachments as ReportAttachment[]);
        }
        const mergePhase = (p?: Partial<PhaseData>): PhaseData => ({
          progress: p?.progress || '',
          risks: p?.risks || '',
          schedule: p?.schedule || '',
        });
        if (r.phaseProgress) {
          setPhaseProgress({
            EVT: mergePhase(r.phaseProgress.EVT),
            DVT: mergePhase(r.phaseProgress.DVT),
            PVT: mergePhase(r.phaseProgress.PVT),
            MP: mergePhase(r.phaseProgress.MP),
          });
        }
        // Load project info
        projectsApi.get(r.projectId).then((pr) => setProject(pr.data)).catch(() => { Message.warning('加载项目信息失败'); });
        setLoading(false);
      }).catch(() => {
        Message.error('加载周报失败');
        setLoading(false);
      });
    } else if (projectId) {
      projectsApi.get(projectId).then((res) => setProject(res.data)).catch(() => { Message.warning('加载项目信息失败'); });
    }
  }, [id, isEdit, projectId]);

  const buildData = () => ({
    projectId,
    weekStart: weekStart.format('YYYY-MM-DD'),
    weekEnd: weekEnd.format('YYYY-MM-DD'),
    progressStatus,
    keyProgress: keyProgress || undefined,
    nextWeekPlan: nextWeekPlan || undefined,
    riskWarning: riskWarning || undefined,
    phaseProgress,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const handleSaveDraft = async () => {
    if (!projectId) { Message.error('请先选择项目'); return; }
    setSaving(true);
    try {
      if (isEdit && id) {
        await weeklyReportsApi.update(id, buildData());
        clearDraft();
        Message.success('保存成功');
      } else {
        const res = await weeklyReportsApi.create({ ...buildData(), projectId });
        clearDraft();
        Message.success('创建成功');
        navigate(`/weekly-reports/${res.data.id}/edit`, { replace: true });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      Message.error(err?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!projectId) { Message.error('请先选择项目'); return; }
    setSaving(true);
    try {
      let reportId = id;
      if (isEdit && id) {
        // 编辑模式：先保存再提交
        await weeklyReportsApi.update(id, buildData());
      } else {
        // 新建模式：先创建再提交
        const res = await weeklyReportsApi.create({ ...buildData(), projectId });
        reportId = res.data.id;
      }
      await weeklyReportsApi.submit(reportId!);
      clearDraft();
      Message.success('周报提交成功');
      goBack();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      Message.error(err?.response?.data?.error || '提交失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAiSuggestions = async () => {
    if (!projectId) { Message.error('请先选择项目'); return; }
    setAiLoading(true);
    const hideLoading = Message.loading({ content: '正在进行 AI 分析...', duration: 0 });
    try {
      const res = await weeklyReportsApi.getAiSuggestions(
        projectId,
        weekStart.format('YYYY-MM-DD'),
        weekEnd.format('YYYY-MM-DD')
      );
      setAiSuggestions(res.data);
      Message.success('AI 建议已生成');
    } catch {
      Message.error('获取 AI 建议失败');
    } finally {
      hideLoading();
      setAiLoading(false);
    }
  };

  // AI 采用：同时更新 state 和编辑器内容
  const adoptAiSuggestion = (
    field: 'keyProgress' | 'nextWeekPlan' | 'riskWarning',
    html: string,
    ref: React.RefObject<RichTextEditorRef | null>,
  ) => {
    const setters = { keyProgress: setKeyProgress, nextWeekPlan: setNextWeekPlan, riskWarning: setRiskWarning };
    setters[field](html);
    ref.current?.setHtml(html);
  };

  const updatePhase = (phase: string, field: keyof PhaseData, value: string) => {
    setPhaseProgress((prev) => ({
      ...prev,
      [phase]: { ...prev[phase], [field]: value },
    }));
  };

  // 自动保存草稿到 localStorage（每 30 秒）
  const draftKey = `weekly-report-draft-${id || projectId || 'new'}`;
  const lastSavedRef = useRef('');

  useEffect(() => {
    // 页面加载时恢复草稿
    if (!isEdit) {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.keyProgress && !keyProgress) setKeyProgress(draft.keyProgress);
          if (draft.nextWeekPlan && !nextWeekPlan) setNextWeekPlan(draft.nextWeekPlan);
          if (draft.riskWarning && !riskWarning) setRiskWarning(draft.riskWarning);
          if (draft.progressStatus) setProgressStatus(draft.progressStatus);
          Message.info('已恢复上次编辑的草稿');
        } catch { /* ignore */ }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => {
      const snapshot = JSON.stringify({ keyProgress, nextWeekPlan, riskWarning, progressStatus });
      if (snapshot !== lastSavedRef.current && (keyProgress || nextWeekPlan || riskWarning)) {
        localStorage.setItem(draftKey, snapshot);
        lastSavedRef.current = snapshot;
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [keyProgress, nextWeekPlan, riskWarning, progressStatus, draftKey]);

  // 保存/提交成功后清除本地草稿
  const clearDraft = () => localStorage.removeItem(draftKey);

  // 附件按 section 分组处理
  const getAttachmentsForSection = (section: string) => attachments.filter((a) => a.section === section);
  const updateAttachmentsForSection = (section: string, sectionAttachments: ReportAttachment[]) => {
    setAttachments((prev) => [...prev.filter((a) => a.section !== section), ...sectionAttachments]);
  };

  // Ctrl+V 粘贴文件 → 自动上传为附件
  const handlePasteFiles = async (files: File[], section: string) => {
    for (const file of files) {
      try {
        const res = await uploadApi.upload(file);
        const newAtt: ReportAttachment = {
          id: crypto.randomUUID(),
          name: res.data.name,
          url: res.data.url,
          uploadedAt: new Date().toISOString(),
          section,
        };
        setAttachments((prev) => [...prev, newAtt]);
        Message.success(`附件「${res.data.name}」上传成功`);
      } catch {
        Message.error(`附件「${file.name}」上传失败`);
      }
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size={40} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button icon={<IconLeft />} onClick={goBack}>返回</Button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {isEdit ? '编辑周报' : '创建周报'}
            </h2>
            {project && (
              <span style={{ color: 'var(--color-text-3)', fontSize: 14 }}>— {project.name}</span>
            )}
          </div>
          <Button
            type="outline"
            icon={<IconBulb />}
            loading={aiLoading}
            onClick={handleAiSuggestions}
            style={{ borderStyle: 'dashed' }}
          >
            AI 智能分析
          </Button>
        </div>

        {/* 周次 + 进展状态 */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>周次</span>
              <DatePicker.WeekPicker
                value={weekDate}
                onChange={(_dateStr, date) =>
                  date && setWeekDate(
                    (date as unknown as dayjs.Dayjs).startOf('isoWeek' as dayjs.OpUnitType)
                  )
                }
                style={{ width: 200 }}
                format="YYYY-wo"
              />
              <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
                {weekStart.format('MM-DD')} ~ {weekEnd.format('MM-DD')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>项目状态</span>
              <Radio.Group
                value={progressStatus}
                onChange={(v) => setProgressStatus(v as ProgressStatus)}
                type="button"
              >
                {PROGRESS_OPTIONS.map((opt) => (
                  <Radio key={opt.value} value={opt.value}>
                    <span style={{ color: progressStatus === opt.value ? opt.color : undefined }}>
                      {opt.label}
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            </div>
          </div>
        </Card>

        {/* 进展与计划 */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>进展与计划</div>

            {/* 本周重要进展 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>本周重要进展</span>
                {aiSuggestions?.keyProgress && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>AI 建议：</span>
                    <Button size="mini" type="primary"
                      onClick={() => adoptAiSuggestion('keyProgress', aiSuggestions.keyProgress || '', keyProgressRef)}>
                      采用
                    </Button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: aiSuggestions?.keyProgress ? '1fr 400px' : '1fr', gap: 12, alignItems: 'stretch' }}>
                <div>
                  <RichTextEditor
                    ref={keyProgressRef}
                    value={keyProgress}
                    onChange={setKeyProgress}
                    placeholder="请输入本周重要进展..."
                    minHeight={150}
                    onPasteFiles={(files) => handlePasteFiles(files, 'keyProgress')}
                  />
                  <AttachmentList
                    attachments={getAttachmentsForSection('keyProgress')}
                    onChange={(atts) => updateAttachmentsForSection('keyProgress', atts)}
                    section="keyProgress"
                  />
                </div>
                {aiSuggestions?.keyProgress && (
                  <Card size="small" title={<span>💡 AI 建议</span>} style={{ background: 'var(--ai-card-bg)', maxHeight: 300, overflowY: 'auto' }}>
                    <SafeHtml className="html-content" style={{ fontSize: 13 }} html={aiSuggestions.keyProgress} />
                  </Card>
                )}
              </div>
            </div>

            {/* 下周工作计划 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>下周工作计划</span>
                {aiSuggestions?.nextWeekPlan && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>AI 建议：</span>
                    <Button size="mini" type="primary"
                      onClick={() => adoptAiSuggestion('nextWeekPlan', aiSuggestions.nextWeekPlan || '', nextWeekPlanRef)}>
                      采用
                    </Button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: aiSuggestions?.nextWeekPlan ? '1fr 400px' : '1fr', gap: 12, alignItems: 'stretch' }}>
                <div>
                  <RichTextEditor
                    ref={nextWeekPlanRef}
                    value={nextWeekPlan}
                    onChange={setNextWeekPlan}
                    placeholder="请输入下周工作计划..."
                    minHeight={150}
                    onPasteFiles={(files) => handlePasteFiles(files, 'nextWeekPlan')}
                  />
                  <AttachmentList
                    attachments={getAttachmentsForSection('nextWeekPlan')}
                    onChange={(atts) => updateAttachmentsForSection('nextWeekPlan', atts)}
                    section="nextWeekPlan"
                  />
                </div>
                {aiSuggestions?.nextWeekPlan && (
                  <Card size="small" title={<span>💡 AI 建议</span>} style={{ background: 'var(--ai-card-bg)', maxHeight: 300, overflowY: 'auto' }}>
                    <SafeHtml className="html-content" style={{ fontSize: 13 }} html={aiSuggestions.nextWeekPlan} />
                  </Card>
                )}
              </div>
            </div>

            {/* 风险预警 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 500, color: 'var(--status-danger)' }}>风险预警</span>
                {aiSuggestions?.riskWarning !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>AI 建议：</span>
                    <Button size="mini" type="primary"
                      onClick={() => adoptAiSuggestion('riskWarning', aiSuggestions.riskWarning || '', riskWarningRef)}>
                      采用
                    </Button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: aiSuggestions?.riskWarning !== undefined ? '1fr 400px' : '1fr', gap: 12, alignItems: 'stretch' }}>
                <div>
                  <RichTextEditor
                    ref={riskWarningRef}
                    value={riskWarning}
                    onChange={setRiskWarning}
                    placeholder="请输入风险预警（选填）..."
                    minHeight={120}
                    onPasteFiles={(files) => handlePasteFiles(files, 'riskWarning')}
                  />
                  <AttachmentList
                    attachments={getAttachmentsForSection('riskWarning')}
                    onChange={(atts) => updateAttachmentsForSection('riskWarning', atts)}
                    section="riskWarning"
                  />
                </div>
                {aiSuggestions?.riskWarning !== undefined && (
                  <Card size="small" title={<span>💡 AI 建议</span>} style={{ background: 'var(--ai-card-bg)', maxHeight: 300, overflowY: 'auto' }}>
                    {aiSuggestions.riskWarning ? (
                      <SafeHtml className="html-content" style={{ fontSize: 13 }} html={aiSuggestions.riskWarning} />
                    ) : (
                      <span style={{ color: 'var(--status-success)', fontSize: 13 }}>✓ 未发现明显风险</span>
                    )}
                  </Card>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* 阶段进展 */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>阶段进展</div>
          <Collapse>
            {PHASES.map((phase) => (
              <Collapse.Item
                key={phase}
                header={phase}
                name={phase}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div>
                    <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>工程周期</div>
                    <Input
                      value={phaseProgress[phase]?.schedule || ''}
                      onChange={(v) => updatePhase(phase, 'schedule', v)}
                      placeholder="如：2026-02-10 ~ 2026-02-28"
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>进展描述</div>
                    <TextArea
                      value={phaseProgress[phase]?.progress || ''}
                      onChange={(v) => updatePhase(phase, 'progress', v)}
                      placeholder="请输入进展描述..."
                      rows={3}
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>风险管理</div>
                    <TextArea
                      value={phaseProgress[phase]?.risks || ''}
                      onChange={(v) => updatePhase(phase, 'risks', v)}
                      placeholder="请输入风险管理内容..."
                      rows={3}
                    />
                  </div>
                </Space>
              </Collapse.Item>
            ))}
          </Collapse>
        </Card>

        {/* 底部操作栏 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 24 }}>
          <Button onClick={goBack}>取消</Button>
          <Button icon={<IconSave />} onClick={handleSaveDraft} loading={saving}>保存草稿</Button>
          <Button type="primary" icon={<IconSend />} onClick={handleSubmit} loading={saving}>提交周报</Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default WeeklyReportForm;
