import React, { useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AssistantConversation from './AssistantConversation';

interface AssistantLauncherProps {
  /** 当前路由的项目上下文；非项目页为 null（AI 从话里定位项目） */
  projectId: string | null;
}

/**
 * 右下角常驻 AI 助手浮层：FAB + 可收起面板，内容复用 AssistantConversation。
 */
const AssistantLauncher: React.FC<AssistantLauncherProps> = ({ projectId }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <Button
          size="icon"
          aria-label="打开 AI 助手"
          onClick={() => setOpen(true)}
          className="fixed right-6 bottom-6 z-[1000] size-12 rounded-full shadow-lg"
        >
          <Bot className="size-5" />
        </Button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="AI 助手"
          className="bg-background fixed right-6 bottom-6 z-[1000] flex max-h-[78vh] w-[min(440px,92vw)] flex-col overflow-hidden rounded-lg border shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 font-semibold">
              <Bot className="size-4" />
              AI 助手
            </span>
            <Button variant="ghost" size="icon" aria-label="收起助手" className="size-7" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-3.5">
            <AssistantConversation projectId={projectId} />
          </div>
        </div>
      )}
    </>
  );
};

export default AssistantLauncher;
