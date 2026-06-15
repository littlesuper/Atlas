import React from 'react';
import { Check } from 'lucide-react';
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
  onCancelPending?: () => void;
}

const MessageList: React.FC<Props> = ({ messages, onApply, onCancelPending }) => (
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
      if (m.kind === 'status' && m.variant === 'need_input') {
        return (
          <div
            key={m.id}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="font-medium">还需要补充信息</div>
            <div className="mt-1">{m.missing?.length ? `缺少：${m.missing.join('、')}` : m.text}</div>
            <div className="mt-1.5 text-xs opacity-80">直接在下方输入框补充即可，我接着办。</div>
            {onCancelPending && (
              <button type="button" onClick={onCancelPending} className="mt-2 text-xs underline opacity-80 hover:opacity-100">
                取消补充
              </button>
            )}
          </div>
        );
      }
      return (
        <div
          key={m.id}
          className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm"
        >
          {m.text}
        </div>
      );
    })}
  </div>
);

export default MessageList;
