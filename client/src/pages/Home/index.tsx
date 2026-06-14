import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';
import RiskOverview from './RiskOverview';

/**
 * 首页 = 全屏 AI 聊天页：空态展示问候/示例 + 按需风险区；开始对话后进入气泡流。
 * 读取 ?project= 作为上下文，就地发送（每轮独立 propose，确认后才写入）。
 */
const Home: React.FC = () => {
  const [params] = useSearchParams();
  const contextProjectId = params.get('project');
  const { messages, sending, send, applyProposal, reset } = useAssistantChat();
  const [input, setInput] = useState('');

  const doSend = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setInput('');
    void send(t, contextProjectId);
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex-1 overflow-auto">
          {messages.length === 0 ? (
            <>
              <EmptyState onPick={(t) => doSend(t)} />
              <RiskOverview />
            </>
          ) : (
            <MessageList messages={messages} onApply={applyProposal} />
          )}
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => doSend(input)}
            onNewChat={() => {
              reset();
              setInput('');
            }}
            sending={sending}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default Home;
