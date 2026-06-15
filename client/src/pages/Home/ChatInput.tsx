import React, { useEffect, useRef } from 'react';
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

  // 进入首页 / 切到会话态时，键盘焦点默认落在输入框
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  return (
    // 对齐全站 input 设计 token：rounded-xl + border-input + bg-input/20 + focus-within ring，扁平不投影
    <div className="bg-input/20 border-input focus-within:border-ring/60 focus-within:ring-ring/15 mx-auto flex w-full max-w-[760px] items-end gap-1.5 rounded-xl border px-2.5 py-2 transition-[color,box-shadow] focus-within:ring-1 dark:bg-input/30">
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
        className="text-foreground placeholder:text-muted-foreground max-h-[200px] min-w-0 flex-1 resize-none border-none bg-transparent px-1.5 py-1.5 text-sm outline-none"
      />
      <Button
        type="button"
        size="icon"
        aria-label="发送"
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="size-8 shrink-0 rounded-lg"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
};

export default ChatInput;
