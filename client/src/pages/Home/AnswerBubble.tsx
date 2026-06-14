import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';

const SYS_BADGE = 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';
const GROUNDED_BADGE = 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';

interface Props {
  answer: string;
  basis?: 'deterministic' | 'grounded';
  elapsedMs?: number;
}

const AnswerBubble: React.FC<Props> = ({ answer, basis, elapsedMs }) => {
  const elapsedText = elapsedMs != null ? `耗时 ${(elapsedMs / 1000).toFixed(1)} 秒` : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[15px] leading-7 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2">
        {basis === 'grounded' ? (
          <Badge variant="outline" className={GROUNDED_BADGE}>
            据系统数据（AI 整理，可能不完整，请核对）
          </Badge>
        ) : (
          <Badge variant="outline" className={SYS_BADGE}>
            系统精确计算
          </Badge>
        )}
        {elapsedText && <span className="text-muted-foreground text-xs">{elapsedText}</span>}
      </div>
    </div>
  );
};

export default AnswerBubble;
