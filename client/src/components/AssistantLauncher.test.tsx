import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

import AssistantLauncher from './AssistantLauncher';

beforeEach(() => vi.clearAllMocks());

describe('AssistantLauncher (navigate FAB)', () => {
  it('renders the FAB', () => {
    render(<AssistantLauncher projectId="p1" />);
    expect(screen.getByLabelText('打开 AI 助手')).toBeInTheDocument();
  });

  it('navigates to / with project context', () => {
    render(<AssistantLauncher projectId="p1" />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(mockNavigate).toHaveBeenCalledWith('/?project=p1');
  });

  it('navigates without project param when projectId is null', () => {
    render(<AssistantLauncher projectId={null} />);
    fireEvent.click(screen.getByLabelText('打开 AI 助手'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
