import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, ArrowUp, Check, Loader2, CircleAlert } from 'lucide-react';
import { assistantApi } from '../api';
import { AssistantProposeResult, AssistantDiffRow, AssistantRiskRow } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AssistantConversationProps {
  /** 当前路由的项目上下文；非项目页（如首页）为 null，由 AI 从话里定位项目 */
  projectId: string | null;
  /** hero（首页）使用更紧凑的提示文案 */
  variant?: 'panel' | 'hero';
}

type Phase = 'idle' | 'proposing' | 'ai_unavailable' | 'noop' | 'preview' | 'applied';
type StepStatus = 'wait' | 'process' | 'finish' | 'error';

const AI_BADGE = 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';
const SYS_BADGE = 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';

const riskBadgeClass = (s: AssistantRiskRow['severity']) =>
  s === 'danger'
    ? 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
    : s === 'warning'
      ? 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
      : 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';

const StepDot: React.FC<{ status: StepStatus }> = ({ status }) => {
  if (status === 'process') return <Loader2 className="text-primary size-4 animate-spin" />;
  if (status === 'finish')
    return (
      <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full">
        <Check className="size-3" />
      </span>
    );
  if (status === 'error') return <CircleAlert className="size-4 text-red-500" />;
  return <span className="border-muted-foreground/30 mt-0.5 size-3.5 rounded-full border-2" />;
};

interface TimelineStep {
  title: string;
  tag?: { text: string; cls: string };
  status: StepStatus;
  desc?: string;
}

const Timeline: React.FC<{ steps: TimelineStep[] }> = ({ steps }) => (
  <ol className="space-y-2">
    {steps.map((st, i) => (
      <li key={i} className="flex gap-3">
        <div className="flex flex-col items-center pt-0.5">
          <StepDot status={st.status} />
          {i < steps.length - 1 && <span className="bg-border mt-1 w-px flex-1" />}
        </div>
        <div className="pb-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{st.title}</span>
            {st.tag && (
              <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', st.tag.cls)}>
                {st.tag.text}
              </Badge>
            )}
          </div>
          {st.desc && <div className="text-muted-foreground mt-0.5 text-xs">{st.desc}</div>}
        </div>
      </li>
    ))}
  </ol>
);

const Note: React.FC<{ tone: 'info' | 'success' | 'warning'; className?: string; children: React.ReactNode }> = ({
  tone,
  className,
  children,
}) => {
  const tones = {
    info: 'border-border bg-muted/50 text-foreground',
    success:
      'border-green-200 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200',
    warning:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  };
  return <div className={cn('rounded-md border px-3 py-2 text-sm', tones[tone], className)}>{children}</div>;
};

/**
 * 助手对话核心：输入 → 分步执行时间线 → 预览 → 确认应用。
 * 被右下角浮层 AssistantLauncher 与首页 hero 共用（单一受测路径）。
 * 应用成功后派发 window 事件 'assistant:applied'，相关页面可监听刷新。
 */
const AssistantConversation: React.FC<AssistantConversationProps> = ({ projectId, variant = 'panel' }) => {
  const [utterance, setUtterance] = useState('');
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<AssistantProposeResult | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [applied, setApplied] = useState(false);

  const resetRun = () => {
    setResult(null);
    setAiUnavailable(false);
    setApplied(false);
  };

  const handlePropose = async () => {
    const text = utterance.trim();
    if (!text) {
      toast.warning('请先输入你想做的调整');
      return;
    }
    setProposing(true);
    resetRun();
    try {
      const res = await assistantApi.propose(text, projectId);
      setResult(res.data);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 503) {
        setAiUnavailable(true);
      } else {
        toast.error(getApiErrorMessage(error, '解析失败，请稍后重试') || '解析失败，请稍后重试');
      }
    } finally {
      setProposing(false);
    }
  };

  const handleApply = () => {
    if (!result?.proposalId) return;
    setConfirmOpen(true);
  };

  const doApply = async () => {
    if (!result?.proposalId) return;
    const proposalId = result.proposalId;
    setConfirmOpen(false);
    setApplying(true);
    try {
      await assistantApi.apply(proposalId);
      toast.success('已应用，可在审计/撤回处回滚');
      setApplied(true);
      window.dispatchEvent(new CustomEvent('assistant:applied'));
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error('数据在此期间已被改动，请重新发起对话');
        resetRun();
      } else if (status === 400) {
        toast.error(getApiErrorMessage(error, '无法应用') || '无法应用');
      } else if (status === 404) {
        toast.error('提议已过期，请重新发起对话');
        resetRun();
      } else {
        toast.error(getApiErrorMessage(error, '应用失败，请稍后重试') || '应用失败，请稍后重试');
      }
    } finally {
      setApplying(false);
    }
  };

  const handleCancel = () => {
    resetRun();
    setUtterance('');
  };

  const phase: Phase = proposing
    ? 'proposing'
    : aiUnavailable
      ? 'ai_unavailable'
      : applied
        ? 'applied'
        : result?.noOp
          ? 'noop'
          : result
            ? 'preview'
            : 'idle';

  const rows = result?.preview.rows ?? [];
  const risks = result?.preview.risks ?? [];
  const lowConfidence = phase === 'preview' && result?.preview.confidence === 'low';
  // 只读问答的回答（与"改动提议"分开渲染）
  const answer = result?.answer;
  const isAnswer = !!answer;
  // 服务端端到端耗时（界面直接显示，便于比较模型快慢）
  const elapsedText = result?.elapsedMs != null ? `耗时 ${(result.elapsedMs / 1000).toFixed(1)} 秒` : null;

  const s1: StepStatus =
    phase === 'proposing' ? 'process' : phase === 'ai_unavailable' ? 'error' : phase === 'idle' ? 'wait' : 'finish';
  const s2: StepStatus = phase === 'preview' || phase === 'applied' ? 'finish' : 'wait';
  const s3 = s2;
  const s4: StepStatus = phase === 'applied' ? 'finish' : phase === 'preview' ? 'process' : 'wait';
  const s5: StepStatus = phase === 'applied' ? 'finish' : 'wait';

  const step1Desc =
    phase === 'proposing'
      ? '正在解析你的意图…'
      : phase === 'ai_unavailable'
        ? 'AI 暂不可用，请手动操作'
        : phase === 'noop'
          ? result?.narrative || '没听懂这句话'
          : phase === 'preview' || phase === 'applied'
            ? `已识别意图${lowConfidence ? ' · AI 置信度低，请仔细核对' : ''}`
            : '';
  const step2Desc = s2 === 'finish' ? `生成 ${rows.length} 项改动` : '';
  const step3Desc = s3 === 'finish' ? (risks.length > 0 ? `${risks.length} 项风险` : '无风险') : '';
  const step4Desc = phase === 'applied' ? '已确认' : phase === 'preview' ? '请核对下方改动后确认' : '';
  const step5Desc = phase === 'applied' ? '已写入，可在审计/撤回处回滚' : '';

  const showTimeline = phase !== 'idle' && !isAnswer;

  const changeSteps: TimelineStep[] = [
    { title: '意图解析', tag: { text: 'AI', cls: AI_BADGE }, status: s1, desc: step1Desc },
    { title: '生成预览', tag: { text: '系统计算', cls: SYS_BADGE }, status: s2, desc: step2Desc },
    { title: '风险判定', tag: { text: '系统计算', cls: SYS_BADGE }, status: s3, desc: step3Desc },
    { title: '预览待确认', status: s4, desc: step4Desc },
    { title: '已应用', status: s5, desc: step5Desc },
  ];

  const answerSteps: TimelineStep[] = [
    { title: '问题解析', tag: { text: 'AI', cls: AI_BADGE }, status: 'finish', desc: '已理解你的提问' },
    { title: '查询计算', tag: { text: '系统计算', cls: SYS_BADGE }, status: 'finish', desc: '答案由系统数据算出' },
  ];

  return (
    <div>
      {variant === 'hero' ? (
        // 胶囊输入条（参考现代对话式输入）：[+] [输入] [● 发送]
        <div className="bg-background flex items-center gap-1 rounded-full border px-2 py-1.5 pl-3 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="清空重来"
            onClick={handleCancel}
            disabled={proposing}
            className="text-muted-foreground size-8 shrink-0 rounded-full"
          >
            <Plus className="size-4" />
          </Button>
          <input
            value={utterance}
            onChange={(e) => setUtterance(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePropose();
              }
            }}
            placeholder="有问题，尽管问"
            disabled={proposing}
            aria-label="AI 输入"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-none bg-transparent px-1.5 py-1.5 text-[15px] outline-none"
          />
          <Button
            type="button"
            size="icon"
            aria-label="发送"
            onClick={handlePropose}
            disabled={proposing}
            className="size-9 shrink-0 rounded-full"
          >
            {proposing ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
            直接用一句话描述你想做的调整（支持排期、项目字段、风险项，如“把项目甲的硬件打样推迟两周”“把项目甲优先级改成高”“给项目甲加一条高风险：电源散热”）。
            AI 会自己听懂你指的是哪个项目、要改什么；改动由系统计算，<strong className="text-foreground font-medium">确认后才写入</strong>。
          </p>

          <Textarea
            value={utterance}
            onChange={(e) => setUtterance(e.target.value)}
            placeholder="例如：把整机测试的工期改成 5 天"
            rows={2}
            disabled={proposing}
            className="resize-none"
          />
          <div className="mt-2.5">
            <Button disabled={proposing} onClick={handlePropose}>
              {proposing ? '分析中…' : '分析'}
            </Button>
          </div>
        </>
      )}

      {isAnswer && (
        <div className="mt-4">
          <Timeline steps={answerSteps} />
          <Note tone="success" className="mt-2">
            {answer}
          </Note>
          <div className="mt-1.5 flex items-center gap-2">
            {result?.basis === 'grounded' ? (
              <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                据系统数据（AI 整理，可能不完整，请核对）
              </Badge>
            ) : (
              <Badge variant="outline" className={SYS_BADGE}>
                系统精确计算
              </Badge>
            )}
            {elapsedText && <span className="text-muted-foreground text-xs">{elapsedText}</span>}
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              再问一句
            </Button>
          </div>
        </div>
      )}

      {showTimeline && (
        <div className="mt-4">
          <Timeline steps={changeSteps} />
          {elapsedText && <div className="text-muted-foreground mt-1.5 text-xs">{elapsedText}</div>}
        </div>
      )}

      {phase === 'preview' && (
        <div className="mt-2">
          {lowConfidence && (
            <Note tone="warning" className="mb-2.5">
              AI 对你的意图不太确定，请仔细核对下面每一条改动后再应用。
            </Note>
          )}
          {result?.narrative ? (
            <Note tone="info" className="mb-2.5">
              {result.narrative}
            </Note>
          ) : (
            <Note tone="info" className="mb-2.5">
              （AI 文字复述暂不可用，以下为系统计算的结构化改动，仍可确认应用）
            </Note>
          )}

          {risks.length > 0 && (
            <div className="mb-2.5 space-y-1.5">
              {risks.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[13px]">
                  <Badge variant="outline" className={riskBadgeClass(r.severity)}>
                    {r.kind}
                  </Badge>
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">对象</TableHead>
                    <TableHead>原</TableHead>
                    <TableHead>新</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: AssistantDiffRow) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-muted-foreground">{r.before}</TableCell>
                      <TableCell className="font-medium text-amber-600 dark:text-amber-400">{r.after}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-muted-foreground py-6 text-center text-sm">无改动</div>
          )}

          <div className="mt-3.5 flex gap-2">
            <Button
              variant="destructive"
              disabled={applying || !result?.proposalId || rows.length === 0}
              onClick={handleApply}
            >
              应用全部
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={applying}>
              取消
            </Button>
          </div>
        </div>
      )}

      {phase === 'applied' && (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            再调整一句
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认应用改动</AlertDialogTitle>
            <AlertDialogDescription>
              将按预览结果经现有校验路径写入数据库并记入审计，可在审计/撤回处回滚。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>返回</AlertDialogCancel>
            <AlertDialogAction onClick={doApply} disabled={applying}>
              确认应用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AssistantConversation;
