import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../api', () => ({
  activityCommentsApi: {
    list: vi.fn().mockResolvedValue({ data: { data: [], total: 0 } }),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  auditLogsApi: {
    list: vi.fn().mockResolvedValue({ data: { data: [], total: 0 } }),
  },
}));

vi.mock('../../../store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'u1', realName: 'Test User' } }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual('@arco-design/web-react');
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn() },
    Modal: { confirm: vi.fn(({ onOk }: any) => onOk && onOk()) },
  };
});

import ActivityComments from './ActivityComments';
import { activityCommentsApi, auditLogsApi } from '../../../api';

describe('ActivityComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(activityCommentsApi.list).mockResolvedValue({
      data: { data: [], total: 0 },
    } as any);
    vi.mocked(auditLogsApi.list).mockResolvedValue({
      data: { data: [], total: 0 },
    } as any);
  });

  it('renders comments tab by default', async () => {
    render(<ActivityComments activityId="act1" />);

    await waitFor(() => {
      expect(screen.getByText(/评论/)).toBeInTheDocument();
    });
    expect(activityCommentsApi.list).toHaveBeenCalledWith('act1', expect.any(Object));
  });

  it('shows empty state when no comments', async () => {
    render(<ActivityComments activityId="act1" />);

    await waitFor(() => {
      expect(screen.getByText('暂无评论')).toBeInTheDocument();
    });
  });

  it('submit button is disabled when input is empty', async () => {
    render(<ActivityComments activityId="act1" />);

    await waitFor(() => {
      expect(activityCommentsApi.list).toHaveBeenCalled();
    });

    // The primary button should be disabled (arco-btn-disabled class)
    const submitBtn = document.querySelector('button.arco-btn-primary');
    expect(submitBtn).toBeTruthy();
    expect(submitBtn!.classList.contains('arco-btn-disabled')).toBe(true);
    expect(submitBtn!.hasAttribute('disabled')).toBe(true);
  });

  it('calls create API when submitting a comment', async () => {
    vi.mocked(activityCommentsApi.create).mockResolvedValue({} as any);

    render(<ActivityComments activityId="act1" />);

    await waitFor(() => {
      expect(activityCommentsApi.list).toHaveBeenCalled();
    });

    // Arco TextArea uses an onChange prop that receives value directly,
    // but from testing-library we simulate via native input event
    const textarea = document.querySelector('textarea:not([style*="visibility: hidden"])')!;
    // Use fireEvent.input + change to trigger the Arco onChange
    fireEvent.focus(textarea);
    // Simulate typing by setting nativeEvent value
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )!.set!.call(textarea, 'Test comment');
    fireEvent.input(textarea, { target: { value: 'Test comment' } });
    fireEvent.change(textarea, { target: { value: 'Test comment' } });

    await waitFor(() => {
      const submitBtn = document.querySelector('button.arco-btn-primary');
      expect(submitBtn!.classList.contains('arco-btn-disabled')).toBe(false);
    });

    const submitBtn = document.querySelector('button.arco-btn-primary')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(activityCommentsApi.create).toHaveBeenCalledWith({
        activityId: 'act1',
        content: 'Test comment',
      });
    });
  });

  it('switches to history tab and loads audit logs', async () => {
    render(<ActivityComments activityId="act1" />);

    await waitFor(() => {
      expect(screen.getByText('变更历史')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('变更历史'));

    await waitFor(() => {
      expect(auditLogsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'activity',
          keyword: 'act1',
        })
      );
    });
  });

  it('displays change diff in history tab', async () => {
    vi.mocked(auditLogsApi.list).mockResolvedValue({
      data: {
        data: [
          {
            id: 'log1',
            userName: 'Zhang',
            action: 'UPDATE',
            resourceName: 'Task A',
            createdAt: '2025-03-01T10:00:00Z',
            changes: { status: { from: 'NOT_STARTED', to: 'IN_PROGRESS' } },
          },
        ],
        total: 1,
      },
    } as any);

    render(<ActivityComments activityId="act1" />);

    await waitFor(() => expect(screen.getByText('变更历史')).toBeInTheDocument());
    fireEvent.click(screen.getByText('变更历史'));

    await waitFor(() => {
      expect(screen.getByText('Zhang')).toBeInTheDocument();
      expect(screen.getByText(/NOT_STARTED/)).toBeInTheDocument();
      expect(screen.getByText(/IN_PROGRESS/)).toBeInTheDocument();
    });
  });
});
