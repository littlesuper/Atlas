import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistantChatStore } from '../store/assistantChatStore';

/** 首页 hero 胶囊输入：提交时把首条消息交接给全屏页并跳转。 */
const AssistantHeroInput: React.FC = () => {
  const navigate = useNavigate();
  const setPending = useAssistantChatStore((s) => s.setPendingUtterance);
  const [utterance, setUtterance] = useState('');

  const submit = () => {
    const t = utterance.trim();
    if (!t) return;
    setPending(t);
    navigate('/assistant');
  };

  return (
    <div className="bg-background flex items-center gap-1 rounded-full border px-2 py-1.5 pl-3 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="清空"
        onClick={() => setUtterance('')}
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
            submit();
          }
        }}
        placeholder="有问题，尽管问"
        aria-label="AI 输入"
        className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-none bg-transparent px-1.5 py-1.5 text-[15px] outline-none"
      />
      <Button type="button" size="icon" aria-label="发送" onClick={submit} className="size-9 shrink-0 rounded-full">
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
};

export default AssistantHeroInput;
