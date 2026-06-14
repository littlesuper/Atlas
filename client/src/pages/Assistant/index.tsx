import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import { useAssistantChatStore } from '../../store/assistantChatStore';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmptyState from './EmptyState';

const Assistant: React.FC = () => {
  const [params] = useSearchParams();
  const contextProjectId = params.get('project');
  const { messages, sending, send, applyProposal, reset } = useAssistantChat();
  const [input, setInput] = useState('');
  const ranRef = useRef(false);

  // 首页 hero 交接的首条消息：挂载时自动发送一次
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const pending = useAssistantChatStore.getState().pendingUtterance;
    if (pending) {
      useAssistantChatStore.getState().setPendingUtterance(null);
      void send(pending, contextProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <EmptyState onPick={(t) => doSend(t)} />
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

export default Assistant;
