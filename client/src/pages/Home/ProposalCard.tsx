import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AssistantMessage, AssistantDiffRow, AssistantRiskRow } from '../../types';

const riskBadgeClass = (s: AssistantRiskRow['severity']) =>
  s === 'danger'
    ? 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
    : s === 'warning'
      ? 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
      : 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';

interface Props {
  message: Extract<AssistantMessage, { kind: 'proposal' }>;
  onApply: () => void;
}

const ProposalCard: React.FC<Props> = ({ message, onApply }) => {
  const { preview, narrative, confidence, applied, stale } = message;
  const rows = preview.rows ?? [];
  const risks = preview.risks ?? [];
  const elapsedText = message.elapsedMs != null ? `耗时 ${(message.elapsedMs / 1000).toFixed(1)} 秒` : null;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">改动预览 · 确认后才写入</div>

      {confidence === 'low' && (
        <div className="mb-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          AI 对你的意图不太确定，请仔细核对下面每一条改动后再应用。
        </div>
      )}

      {narrative ? (
        <p className="text-foreground mb-2.5 text-sm">{narrative}</p>
      ) : (
        <p className="text-muted-foreground mb-2.5 text-sm">（AI 文字复述暂不可用，以下为系统计算的结构化改动，仍可确认应用）</p>
      )}

      {risks.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {risks.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <Badge variant="outline" className={riskBadgeClass(r.severity)}>
                {r.kind}
              </Badge>
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">对象</TableHead>
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
      )}

      <div className="mt-3.5 flex items-center gap-3">
        {applied ? (
          <span className="text-sm text-green-700 dark:text-green-400">已应用，可在审计/撤回处回滚</span>
        ) : stale ? (
          <span className="text-muted-foreground text-sm">提议已过期，请重新发起对话</span>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!message.proposalId || rows.length === 0}>
                应用全部
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认应用改动</AlertDialogTitle>
                <AlertDialogDescription>
                  将按预览结果经现有校验路径写入数据库并记入审计，可在审计/撤回处回滚。是否继续？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>返回</AlertDialogCancel>
                <AlertDialogAction onClick={onApply}>确认应用</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {elapsedText && <span className={cn('text-muted-foreground text-xs', applied || stale ? '' : 'ml-auto')}>{elapsedText}</span>}
      </div>
    </div>
  );
};

export default ProposalCard;
