import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AssistantMessage } from '../../types';
import ProposalCard from './ProposalCard';
import AnswerBubble from './AnswerBubble';

const StepsLine: React.FC<{ steps: string[] }> = ({ steps }) => (
  <div className="text-muted-foreground mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
    {steps.map((s) => (
      <span key={s} className="inline-flex items-center gap-1">
        <Check className="size-3" />
        {s}
      </span>
    ))}
  </div>
);

const PROPOSAL_STEPS = ['意图解析〔AI〕', '生成预览〔系统〕', '风险判定〔系统〕'];
const ANSWER_STEPS = ['问题解析〔AI〕', '查询计算〔系统〕'];

interface Props {
  messages: AssistantMessage[];
  onApply: (id: string) => void;
  /** 处理中（已发送、等待 AI 回复）→ 在末尾显示「思考中…」动画 */
  sending: boolean;
}

const MessageList: React.FC<Props> = ({ messages, onApply, sending }) => (
  <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6">
    {messages.map((m) => {
      if (m.role === 'user') {
        return (
          <div key={m.id} className="flex justify-end">
            <div className="bg-muted max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed">{m.text}</div>
          </div>
        );
      }
      if (m.kind === 'answer') {
        return (
          <div key={m.id}>
            <StepsLine steps={ANSWER_STEPS} />
            <AnswerBubble answer={m.answer} basis={m.basis} elapsedMs={m.elapsedMs} />
          </div>
        );
      }
      if (m.kind === 'proposal') {
        return (
          <div key={m.id}>
            <StepsLine steps={PROPOSAL_STEPS} />
            <ProposalCard message={m} onApply={() => onApply(m.id)} />
          </div>
        );
      }
      // status
      return (
        <div
          key={m.id}
          className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm"
        >
          {m.text}
        </div>
      );
    })}
    {sending && (
      <div className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
        <Loader2 className="text-primary size-4 animate-spin" />
        <span>思考中…</span>
      </div>
    )}
  </div>
);

export default MessageList;
