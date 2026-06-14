import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssistantLauncher from './AssistantLauncher';

// 对话逻辑已抽到 AssistantConversation（其测试覆盖 propose/apply/降级等）；
// launcher 只负责 FAB + 面板开合，这里 mock 掉对话组件，专测壳。
vi.mock('./AssistantConversation', () => ({
  default: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="assistant-conversation">conversation:{String(projectId)}</div>
  ),
}));

beforeEach(() => vi.clearAllMocks());

describe('AssistantLauncher (FAB shell)', () => {
  it('renders the FAB, panel hidden initially', () => {
    render(<AssistantLauncher projectId="p1" />);
    expect(screen.getByLabelText('打开 AI 助手')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-conversation')).not.toBeInTheDocument();
  });

  it('opens panel (renders conversation with projectId) and closes', async () => {
    render(<AssistantLauncher projectId="p1" />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(screen.getByTestId('assistant-conversation')).toHaveTextContent('conversation:p1');
    fireEvent.click(screen.getByLabelText('收起助手'));
    await waitFor(() => expect(screen.queryByTestId('assistant-conversation')).not.toBeInTheDocument());
  });

  it('passes null projectId through (off project pages)', () => {
    render(<AssistantLauncher projectId={null} />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(screen.getByTestId('assistant-conversation')).toHaveTextContent('conversation:null');
  });
});
