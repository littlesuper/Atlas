import React, { useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}

const ChatInput: React.FC<Props> = ({ value, onChange, onSend, sending }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="bg-background mx-auto flex w-full max-w-[760px] items-end gap-1 rounded-3xl border px-2 py-1.5 pl-4 shadow-sm">
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => {
          onChange(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="有问题，尽管问"
        aria-label="AI 输入"
        className="text-foreground placeholder:text-muted-foreground max-h-[200px] min-w-0 flex-1 resize-none border-none bg-transparent px-1.5 py-2 text-[15px] outline-none"
      />
      <Button
        type="button"
        size="icon"
        aria-label="发送"
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="size-9 shrink-0 rounded-full"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
};

export default ChatInput;
