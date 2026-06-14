import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

import AssistantHeroInput from './AssistantHeroInput';
import { useAssistantChatStore } from '../store/assistantChatStore';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useAssistantChatStore.setState({ messages: [], pendingUtterance: null });
});

describe('AssistantHeroInput', () => {
  it('renders the pill placeholder and send button', () => {
    render(<AssistantHeroInput />);
    expect(screen.getByPlaceholderText('有问题，尽管问')).toBeInTheDocument();
    expect(screen.getByLabelText('发送')).toBeInTheDocument();
  });

  it('submit stores pending utterance and navigates to /assistant', () => {
    render(<AssistantHeroInput />);
    fireEvent.change(screen.getByPlaceholderText('有问题，尽管问'), { target: { value: '把项目甲优先级改成高' } });
    fireEvent.click(screen.getByLabelText('发送'));
    expect(useAssistantChatStore.getState().pendingUtterance).toBe('把项目甲优先级改成高');
    expect(mockNavigate).toHaveBeenCalledWith('/assistant');
  });

  it('submits on Enter', () => {
    render(<AssistantHeroInput />);
    const input = screen.getByPlaceholderText('有问题，尽管问');
    fireEvent.change(input, { target: { value: '把硬件打样推迟两周' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/assistant');
  });

  it('does nothing on empty submit', () => {
    render(<AssistantHeroInput />);
    fireEvent.click(screen.getByLabelText('发送'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
