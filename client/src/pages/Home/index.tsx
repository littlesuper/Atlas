import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import MainLayout from '../../layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';
import RiskOverview from './RiskOverview';

/**
 * 首页 = 全屏 AI 聊天页（claude.ai 式）：空态展示问候/示例 + 按需风险区；
 * 开始对话后进入气泡流，消息区独立滚动并自动滚到底部，输入框固定底部。
 * 顶部「新对话」可随时清空回空态。读取 ?project= 作为上下文，就地发送。
 */
const Home: React.FC = () => {
  const [params] = useSearchParams();
  const contextProjectId = params.get('project');
  const { messages, sending, send, applyProposal, reset, cancelPending } = useAssistantChat();
  const [input, setInput] = useState('');
  const hasConversation = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新消息到来时滚到底部（仅有对话时 sentinel 才挂载）
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);

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
      <div className="flex h-full flex-col">
        {hasConversation && (
          <div className="flex shrink-0 items-center justify-end border-b px-4 py-2">
            <Button variant="ghost" size="sm" onClick={newChat} className="text-muted-foreground gap-1.5">
              <Plus className="size-4" />
              新对话
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {hasConversation ? (
            <>
              <MessageList messages={messages} onApply={applyProposal} onCancelPending={cancelPending} />
              <div ref={bottomRef} />
            </>
          ) : (
            <>
              <EmptyState onPick={(t) => doSend(t)} />
              <RiskOverview />
            </>
          )}
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2">
          <ChatInput value={input} onChange={setInput} onSend={() => doSend(input)} sending={sending} />
        </div>
      </div>
    </MainLayout>
  );
};

export default Home;
