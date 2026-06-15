import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmptyState, { ExampleChips } from './EmptyState';
import RiskOverview from './RiskOverview';

/**
 * 首页 = 全屏 AI 聊天页（claude.ai 式）：空态下问候 + 输入框垂直居中，按需在下方展示风险区；
 * 开始对话后进入气泡流，消息区独立滚动并自动滚到底部，输入框固定底部。
 * 顶部「新对话」可随时清空回空态。读取 ?project= 作为上下文，就地发送。
 */
const Home: React.FC = () => {
  const [params] = useSearchParams();
  const contextProjectId = params.get('project');
  const { messages, sending, send, applyProposal, reset } = useAssistantChat();
  const [input, setInput] = useState('');
  const hasConversation = messages.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息 / 思考中 到来时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const doSend = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setInput('');
    void send(t, contextProjectId);
  };

  const newChat = () => {
    reset();
    setInput('');
  };

  return (
    <MainLayout>
      <div className="relative flex h-full flex-col">
        {hasConversation ? (
          <>
            {/* 新对话：常驻右上角浮层按钮（去掉原顶部分隔线 header） */}
            <Button
              variant="outline"
              size="sm"
              onClick={newChat}
              className="text-muted-foreground bg-background/80 absolute right-6 top-3 z-10 gap-1.5 backdrop-blur"
            >
              <Plus className="size-4" />
              新对话
            </Button>
            {/* 消息区占满高度→滚动条贯通到底；输入框 sticky 停靠底部、随滚动区内（不遮挡滚动条），少消息时由 spacer 推到底（claude.ai 式） */}
            <div ref={scrollRef} className="scrollbar-subtle flex-1 overflow-auto pt-2">
              <div className="flex min-h-full flex-col">
                <MessageList messages={messages} onApply={applyProposal} sending={sending} />
                <div className="flex-1" />
                <div className="bg-background sticky bottom-0 px-4 pb-4 pt-2">
                  <ChatInput value={input} onChange={setInput} onSend={() => doSend(input)} sending={sending} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-auto">
            {/* 空态（claude.ai 式）：问候 → 输入框 → 示例 chips，整体垂直居中；有风险点时在下方按需展示 */}
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-4 py-10">
              <EmptyState />
              <div className="mt-6">
                <ChatInput value={input} onChange={setInput} onSend={() => doSend(input)} sending={sending} />
              </div>
              <div className="mt-4">
                {/* 示例仅填入输入框（含占位项目名，需用户改成真实项目后再发送），不直接发起对话 */}
                <ExampleChips onPick={(t) => setInput(t)} />
              </div>
            </div>
            <RiskOverview />
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Home;
