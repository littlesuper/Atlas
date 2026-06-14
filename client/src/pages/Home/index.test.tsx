import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { AssistantMessage } from '../../types';

// 受控的 useAssistantChat：每个用例改 h.messages，断言 h.send/h.reset
const h = vi.hoisted(() => ({
  messages: [] as AssistantMessage[],
  send: vi.fn(),
  applyProposal: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('../../hooks/useAssistantChat', () => ({
  useAssistantChat: () => ({ messages: h.messages, sending: false, send: h.send, applyProposal: h.applyProposal, reset: h.reset }),
}));
vi.mock('../../layouts/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// 隔离子组件（各自有独立测试）：用占位 + 暴露关键回调
vi.mock('./EmptyState', () => ({
  default: ({ onPick }: { onPick: (t: string) => void }) => (
    <button data-testid="empty-pick" onClick={() => onPick('问一句')}>empty</button>
  ),
}));
vi.mock('./RiskOverview', () => ({ default: () => <div data-testid="risk-overview" /> }));
vi.mock('./MessageList', () => ({
  default: ({ messages }: { messages: AssistantMessage[] }) => <div data-testid="message-list">{messages.length}</div>,
}));
vi.mock('./ChatInput', () => ({
  default: ({ onSend, onNewChat }: { onSend: () => void; onNewChat: () => void }) => (
    <div>
      <button data-testid="chat-send" onClick={onSend}>send</button>
      <button data-testid="chat-new" onClick={onNewChat}>new</button>
    </div>
  ),
}));

import Home from './index';

const renderAt = (path = '/') => render(<MemoryRouter initialEntries={[path]}><Home /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  h.messages = [];
});

describe('Home (AI 聊天首页)', () => {
  it('空态显示问候/示例与按需风险区', () => {
    renderAt('/');
    expect(screen.getByTestId('empty-pick')).toBeInTheDocument();
    expect(screen.getByTestId('risk-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
  });

  it('有对话时显示消息流,隐藏空态与风险区', () => {
    h.messages = [{ id: '1', role: 'user', text: '你好' }];
    renderAt('/');
    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('risk-overview')).not.toBeInTheDocument();
  });

  it('发送时带上 ?project= 上下文', () => {
    renderAt('/?project=p9');
    fireEvent.click(screen.getByTestId('empty-pick'));
    expect(h.send).toHaveBeenCalledWith('问一句', 'p9');
  });

  it('无 project 参数时上下文为 null', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('empty-pick'));
    expect(h.send).toHaveBeenCalledWith('问一句', null);
  });

  it('新对话调用 reset', () => {
    renderAt('/');
    fireEvent.click(screen.getByTestId('chat-new'));
    expect(h.reset).toHaveBeenCalled();
  });
});
