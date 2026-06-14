import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, Save, Send, Lightbulb, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import MainLayout from '../../layouts/MainLayout';
import { weeklyReportsApi, projectsApi, uploadApi } from '../../api';
import { Project, ReportAttachment, WeeklyReport } from '../../types';
import RichTextEditor, { RichTextEditorRef } from '../../components/RichTextEditor';
import AttachmentList from '../../components/AttachmentList';
import SafeHtml from '../../components/SafeHtml';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

dayjs.extend(isoWeek);

const PHASES = ['EVT', 'DVT', 'PVT', 'MP'];

type ProgressStatus = 'ON_TRACK' | 'MINOR_ISSUE' | 'MAJOR_ISSUE';

interface PhaseData {
  progress: string;
  risks: string;
  schedule: string;
}

export function mergePhase(p?: Partial<PhaseData>): PhaseData {
  return {
    progress: p?.progress || '',
    risks: p?.risks || '',
    schedule: p?.schedule || '',
  };
}

export function buildEmptyPhaseProgress(): Record<string, PhaseData> {
  return {
    EVT: mergePhase(),
    DVT: mergePhase(),
    PVT: mergePhase(),
    MP: mergePhase(),
  };
}

const PROGRESS_OPTIONS: Array<{ value: ProgressStatus; label: string; Icon: typeof CheckCircle2; cls: string }> = [
  { value: 'ON_TRACK', label: '正常', Icon: CheckCircle2, cls: 'text-green-600 dark:text-green-400' },
  { value: 'MINOR_ISSUE', label: '轻度阻碍', Icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
  { value: 'MAJOR_ISSUE', label: '严重阻碍', Icon: XCircle, cls: 'text-red-600 dark:text-red-400' },
];

/** 上周参考折叠区 */
const PrevReferenceBlock: React.FC<{
  items: Array<{ label: string; html?: string }>;
  weekNumber: number;
}> = ({ items, weekNumber }) => {
  const hasContent = items.some((item) => item.html);
  if (!hasContent) return null;
  return (
    <details open className="mb-2">
      <summary className="text-muted-foreground cursor-pointer text-xs">上周参考（第 {weekNumber} 周）</summary>
      <div className="bg-muted/50 mt-1 rounded px-3 py-2">
        {items.map((item, idx) =>
          item.html ? (
            <div key={idx} className={idx < items.length - 1 ? 'mb-2' : ''}>
              <div className="text-muted-foreground mb-0.5 text-[11px] font-medium">{item.label}</div>
              <SafeHtml className="html-content text-muted-foreground text-xs leading-relaxed" html={item.html} />
            </div>
          ) : null
        )}
      </div>
    </details>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={cn('font-medium', className)}>{children}</span>
);

const WeeklyReportForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectIdParam = searchParams.get('projectId');

  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);

  // 基本数据
  const [project, setProject] = useState<Project | null>(null);

  // 表单字段
  const [projectId, setProjectId] = useState(projectIdParam || '');
  const [weekDate, setWeekDate] = useState<dayjs.Dayjs>(dayjs().startOf('isoWeek' as dayjs.OpUnitType));
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>('ON_TRACK');
  const [changeOverview, setChangeOverview] = useState('');
  const [demandAnalysis, setDemandAnalysis] = useState('');
  const [keyProgress, setKeyProgress] = useState('');
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [riskWarning, setRiskWarning] = useState('');
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [phaseProgress, setPhaseProgress] = useState<Record<string, PhaseData>>(buildEmptyPhaseProgress());

  // 富文本编辑器 ref（用于 AI 采用按钮）
  const keyProgressRef = useRef<RichTextEditorRef>(null);
  const nextWeekPlanRef = useRef<RichTextEditorRef>(null);
  const riskWarningRef = useRef<RichTextEditorRef>(null);

  // 上周参考
  const [prevReport, setPrevReport] = useState<WeeklyReport | null>(null);

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
      weeklyReportsApi
        .get(id)
        .then((res) => {
          const r = res.data;
          setProjectId(r.projectId);
          setWeekDate(dayjs(r.weekStart));
          setProgressStatus(r.progressStatus as ProgressStatus);
          setChangeOverview(r.changeOverview || '');
          setDemandAnalysis(r.demandAnalysis || '');
          setKeyProgress(r.keyProgress || '');
          setNextWeekPlan(r.nextWeekPlan || '');
          setRiskWarning(r.riskWarning || '');
          if (r.attachments) {
            setAttachments(r.attachments as ReportAttachment[]);
          }
          if (r.phaseProgress) {
            setPhaseProgress({
              EVT: mergePhase(r.phaseProgress.EVT),
              DVT: mergePhase(r.phaseProgress.DVT),
              PVT: mergePhase(r.phaseProgress.PVT),
              MP: mergePhase(r.phaseProgress.MP),
            });
          }
          projectsApi
            .get(r.projectId)
            .then((pr) => setProject(pr.data))
            .catch(() => {
              toast.warning('加载项目信息失败');
            });
          setLoading(false);
        })
        .catch(() => {
          toast.error('加载周报失败');
          setLoading(false);
        });
    } else if (projectId) {
      projectsApi
        .get(projectId)
        .then((res) => setProject(res.data))
        .catch(() => {
          toast.warning('加载项目信息失败');
        });
    }
  }, [id, isEdit, projectId]);

  // 创建模式：加载上一周次的周报作为参考
  useEffect(() => {
    if (isEdit || !projectId) {
      setPrevReport(null);
      return;
    }
    const curYear = weekDate.isoWeekYear();
    const curWeek = weekDate.isoWeek();
    weeklyReportsApi
      .getPreviousReport(projectId, curYear, curWeek)
      .then((res) => setPrevReport(res.data))
      .catch(() => setPrevReport(null));
  }, [isEdit, projectId, weekDate]);

  const buildData = () => ({
    projectId,
    weekStart: weekStart.format('YYYY-MM-DD'),
    weekEnd: weekEnd.format('YYYY-MM-DD'),
    progressStatus,
    changeOverview: changeOverview || undefined,
    demandAnalysis: demandAnalysis || undefined,
    keyProgress: keyProgress || undefined,
    nextWeekPlan: nextWeekPlan || undefined,
    riskWarning: riskWarning || undefined,
    phaseProgress,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const handleSaveDraft = async () => {
    if (!projectId) {
      toast.error('请先选择项目');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && id) {
        await weeklyReportsApi.update(id, buildData());
        clearDraft();
        toast.success('保存成功');
      } else {
        const res = await weeklyReportsApi.create({ ...buildData(), projectId });
        clearDraft();
        toast.success('创建成功');
        navigate(`/weekly-reports/${res.data.id}/edit`, { replace: true });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!projectId) {
      toast.error('请先选择项目');
      return;
    }
    setSaving(true);
    try {
      let reportId = id;
      if (isEdit && id) {
        await weeklyReportsApi.update(id, buildData());
      } else {
        const res = await weeklyReportsApi.create({ ...buildData(), projectId });
        reportId = res.data.id;
      }
      await weeklyReportsApi.submit(reportId!);
      clearDraft();
      toast.success('周报提交成功');
      goBack();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || '提交失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAiSuggestions = async () => {
    if (!projectId) {
      toast.error('请先选择项目');
      return;
    }
    setAiLoading(true);
    const loadingId = toast.loading('正在进行 AI 分析...');
    try {
      const res = await weeklyReportsApi.getAiSuggestions(
        projectId,
        weekStart.format('YYYY-MM-DD'),
        weekEnd.format('YYYY-MM-DD')
      );
      setAiSuggestions(res.data);
      toast.success('AI 建议已生成');
    } catch {
      toast.error('获取 AI 建议失败');
    } finally {
      toast.dismiss(loadingId);
      setAiLoading(false);
    }
  };

  // AI 采用：同时更新 state 和编辑器内容
  const adoptAiSuggestion = (
    field: 'keyProgress' | 'nextWeekPlan' | 'riskWarning',
    html: string,
    ref: React.RefObject<RichTextEditorRef | null>
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
    if (!isEdit) {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.keyProgress && !keyProgress) setKeyProgress(draft.keyProgress);
          if (draft.nextWeekPlan && !nextWeekPlan) setNextWeekPlan(draft.nextWeekPlan);
          if (draft.riskWarning && !riskWarning) setRiskWarning(draft.riskWarning);
          if (draft.progressStatus) setProgressStatus(draft.progressStatus);
          toast.info('已恢复上次编辑的草稿');
        } catch {
          /* ignore */
        }
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
        toast.success(`附件「${res.data.name}」上传成功`);
      } catch {
        toast.error(`附件「${file.name}」上传失败`);
      }
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="text-muted-foreground size-9 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  const AiCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Card className="max-h-[300px] overflow-y-auto p-3">
      <div className="mb-2 text-sm font-medium">💡 AI 建议</div>
      {children}
    </Card>
  );

  return (
    <MainLayout>
      <div>
        {/* 头部 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={goBack}>
              <ChevronLeft className="size-4" />
              返回
            </Button>
            <h2 className="text-lg font-semibold">{isEdit ? '编辑周报' : '创建周报'}</h2>
            {project && <span className="text-muted-foreground text-sm">— {project.name}</span>}
          </div>
          <Button variant="outline" className="border-dashed" disabled={aiLoading} onClick={handleAiSuggestions}>
            {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
            AI 智能分析
          </Button>
        </div>

        {/* 周次 + 进展状态 */}
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">周次</span>
              <Popover open={weekOpen} onOpenChange={setWeekOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-48 justify-start font-normal">
                    {weekDate.isoWeekYear()} 第 {weekDate.isoWeek()} 周
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={weekDate.toDate()}
                    onSelect={(d) => {
                      if (d) setWeekDate(dayjs(d).startOf('isoWeek' as dayjs.OpUnitType));
                      setWeekOpen(false);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-[13px]">
                {weekStart.format('MM-DD')} ~ {weekEnd.format('MM-DD')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">项目状态</span>
              <div className="bg-muted inline-flex rounded-md p-0.5">
                {PROGRESS_OPTIONS.map((opt) => {
                  const active = progressStatus === opt.value;
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setProgressStatus(opt.value)}
                      className={cn(
                        'flex items-center gap-1 rounded px-3 py-1 text-sm transition-colors',
                        active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('size-4', opt.cls)} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* 变更信息与需求研判 */}
        <Card className="mb-4 p-4">
          <div className="mb-3 text-[15px] font-semibold">变更信息与需求研判</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2">
                <SectionLabel>变更信息概述</SectionLabel>
              </div>
              <RichTextEditor
                value={changeOverview}
                onChange={setChangeOverview}
                placeholder="请输入本周变更信息概述（选填）..."
                minHeight={120}
              />
            </div>
            <div>
              <div className="mb-2">
                <SectionLabel>需求确认与研判</SectionLabel>
              </div>
              <RichTextEditor
                value={demandAnalysis}
                onChange={setDemandAnalysis}
                placeholder="请输入需求确认与研判内容（选填）..."
                minHeight={120}
              />
            </div>
          </div>
        </Card>

        {/* 进展与计划 */}
        <Card className="mb-4 p-4">
          <div className="mb-3 text-[15px] font-semibold">进展与计划</div>

          {/* 本周重要进展 */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>本周重要进展</SectionLabel>
              {aiSuggestions?.keyProgress && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">AI 建议：</span>
                  <Button size="sm" className="h-6 px-2 text-xs" onClick={() => adoptAiSuggestion('keyProgress', aiSuggestions.keyProgress || '', keyProgressRef)}>
                    采用
                  </Button>
                </div>
              )}
            </div>
            {prevReport && (
              <PrevReferenceBlock
                weekNumber={prevReport.weekNumber}
                items={[
                  { label: '上周计划', html: prevReport.nextWeekPlan },
                  { label: '上周进展', html: prevReport.keyProgress },
                ]}
              />
            )}
            <div className={cn('grid gap-3', aiSuggestions?.keyProgress ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1')}>
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
                <AiCard>
                  <SafeHtml className="html-content text-[13px]" html={aiSuggestions.keyProgress} />
                </AiCard>
              )}
            </div>
          </div>

          {/* 下周工作计划 */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>下周工作计划</SectionLabel>
              {aiSuggestions?.nextWeekPlan && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">AI 建议：</span>
                  <Button size="sm" className="h-6 px-2 text-xs" onClick={() => adoptAiSuggestion('nextWeekPlan', aiSuggestions.nextWeekPlan || '', nextWeekPlanRef)}>
                    采用
                  </Button>
                </div>
              )}
            </div>
            {prevReport && (
              <PrevReferenceBlock weekNumber={prevReport.weekNumber} items={[{ label: '上周计划', html: prevReport.nextWeekPlan }]} />
            )}
            <div className={cn('grid gap-3', aiSuggestions?.nextWeekPlan ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1')}>
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
                <AiCard>
                  <SafeHtml className="html-content text-[13px]" html={aiSuggestions.nextWeekPlan} />
                </AiCard>
              )}
            </div>
          </div>

          {/* 风险预警 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel className="text-red-600 dark:text-red-400">风险预警</SectionLabel>
              <div className="flex items-center gap-2">
                {projectId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={async () => {
                      try {
                        const res = await weeklyReportsApi.getRiskPrefill(projectId);
                        if (res.data.riskWarning) {
                          setRiskWarning(res.data.riskWarning);
                          riskWarningRef.current?.setHtml(res.data.riskWarning);
                          toast.success('已导入风险评估内容');
                        } else {
                          toast.info('暂无风险评估数据可导入');
                        }
                      } catch {
                        toast.error('导入失败');
                      }
                    }}
                  >
                    从风险评估导入
                  </Button>
                )}
                {aiSuggestions?.riskWarning !== undefined && (
                  <>
                    <span className="text-muted-foreground text-xs">AI 建议：</span>
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={() => adoptAiSuggestion('riskWarning', aiSuggestions.riskWarning || '', riskWarningRef)}>
                      采用
                    </Button>
                  </>
                )}
              </div>
            </div>
            {prevReport && (
              <PrevReferenceBlock weekNumber={prevReport.weekNumber} items={[{ label: '上周风险', html: prevReport.riskWarning }]} />
            )}
            <div className={cn('grid gap-3', aiSuggestions?.riskWarning !== undefined ? 'grid-cols-1 lg:grid-cols-[1fr_400px]' : 'grid-cols-1')}>
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
                <AiCard>
                  {aiSuggestions.riskWarning ? (
                    <SafeHtml className="html-content text-[13px]" html={aiSuggestions.riskWarning} />
                  ) : (
                    <span className="text-[13px] text-green-600 dark:text-green-400">✓ 未发现明显风险</span>
                  )}
                </AiCard>
              )}
            </div>
          </div>
        </Card>

        {/* 阶段进展 */}
        <Card className="mb-4 p-4">
          <div className="mb-3 text-[15px] font-semibold">阶段进展</div>
          <div className="divide-y rounded-md border">
            {PHASES.map((phase) => (
              <details key={phase} className="group">
                <summary className="hover:bg-accent flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium">
                  {phase}
                  <ChevronLeft className="size-4 -rotate-90 transition-transform group-open:rotate-[-90deg] group-open:-scale-y-100" />
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  <div>
                    <div className="mb-1 text-[13px] font-medium">工程周期</div>
                    <Input
                      value={phaseProgress[phase]?.schedule || ''}
                      onChange={(e) => updatePhase(phase, 'schedule', e.target.value)}
                      placeholder="如：2026-02-10 ~ 2026-02-28"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[13px] font-medium">进展描述</div>
                    <Textarea
                      value={phaseProgress[phase]?.progress || ''}
                      onChange={(e) => updatePhase(phase, 'progress', e.target.value)}
                      placeholder="请输入进展描述..."
                      rows={3}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[13px] font-medium">风险管理</div>
                    <Textarea
                      value={phaseProgress[phase]?.risks || ''}
                      onChange={(e) => updatePhase(phase, 'risks', e.target.value)}
                      placeholder="请输入风险管理内容..."
                      rows={3}
                    />
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Card>

        {/* 底部操作栏 */}
        <div className="flex justify-end gap-3 pb-6">
          <Button variant="outline" onClick={goBack}>
            取消
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
            <Save className="size-4" />
            保存草稿
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Send className="size-4" />
            提交周报
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default WeeklyReportForm;
