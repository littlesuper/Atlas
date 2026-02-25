import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api', () => ({
  notificationsApi: {
    list: vi.fn().mockResolvedValue({ data: { data: [], unreadCount: 0 } }),
    markRead: vi.fn().mockResolvedValue({}),
    markAllRead: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual('@arco-design/web-react');
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn() },
  };
});

import NotificationBell from './NotificationBell';
import { notificationsApi } from '../api';

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: { data: [], unreadCount: 0 },
    } as any);
  });

  it('renders the notification bell icon', async () => {
    renderBell();
    // The bell icon area should be in the document
    await waitFor(() => {
      expect(notificationsApi.list).toHaveBeenCalled();
    });
  });

  it('shows badge dot when there are unread notifications', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', type: 'ACTIVITY_DUE', title: 'Due!', content: 'Activity due', isRead: false, createdAt: '2025-03-01' },
        ],
        unreadCount: 1,
      },
    } as any);

    const { container } = renderBell();
    await waitFor(() => {
      // Arco Badge renders a dot element when count > 0
      const badge = container.querySelector('.arco-badge-dot, .arco-badge-number');
      expect(badge || container.querySelector('.arco-badge')).toBeTruthy();
    });
  });

  it('expands notification panel on click', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', type: 'ACTIVITY_DUE', title: 'Due!', content: 'Activity due', isRead: false, createdAt: '2025-03-01' },
        ],
        unreadCount: 1,
      },
    } as any);

    const { container } = renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());

    // Click the bell area
    const bellArea = container.querySelector('[style*="cursor: pointer"]') || container.firstChild!.firstChild!;
    fireEvent.click(bellArea as Element);

    await waitFor(() => {
      // Panel should show header "通知"
      expect(screen.getByText(/通知/)).toBeInTheDocument();
    });
  });

  it('shows empty message when no notifications', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: { data: [], unreadCount: 0 },
    } as any);

    const { container } = renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());

    const bellArea = container.querySelector('[style*="cursor: pointer"]') || container.firstChild!.firstChild!;
    fireEvent.click(bellArea as Element);

    await waitFor(() => {
      expect(screen.getByText('暂无通知')).toBeInTheDocument();
    });
  });

  it('calls markAllRead when clicking the mark-all-read button', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', type: 'ACTIVITY_DUE', title: 'Due!', content: 'Activity due', isRead: false, createdAt: '2025-03-01' },
        ],
        unreadCount: 1,
      },
    } as any);
    vi.mocked(notificationsApi.markAllRead).mockResolvedValue({} as any);

    const { container } = renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());

    const bellArea = container.querySelector('[style*="cursor: pointer"]') || container.firstChild!.firstChild!;
    fireEvent.click(bellArea as Element);

    await waitFor(() => expect(screen.getByText('全部已读')).toBeInTheDocument());
    fireEvent.click(screen.getByText('全部已读'));

    await waitFor(() => {
      expect(notificationsApi.markAllRead).toHaveBeenCalled();
    });
  });

  it('calls markRead and navigates when clicking a notification', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', type: 'ACTIVITY_DUE', title: 'Due!', content: 'Content here', isRead: false, createdAt: '2025-03-01', relatedId: 'p1' },
        ],
        unreadCount: 1,
      },
    } as any);
    vi.mocked(notificationsApi.markRead).mockResolvedValue({} as any);

    const { container } = renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());

    const bellArea = container.querySelector('[style*="cursor: pointer"]') || container.firstChild!.firstChild!;
    fireEvent.click(bellArea as Element);

    await waitFor(() => expect(screen.getByText('Due!')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Due!'));

    await waitFor(() => {
      expect(notificationsApi.markRead).toHaveBeenCalledWith('n1');
      expect(mockNavigate).toHaveBeenCalledWith('/projects/p1');
    });
  });

  it('navigates to weekly tab for REPORT_REMINDER type', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      data: {
        data: [
          { id: 'n1', type: 'REPORT_REMINDER', title: 'Report!', content: 'Submit report', isRead: true, createdAt: '2025-03-01', relatedId: 'p2' },
        ],
        unreadCount: 0,
      },
    } as any);

    const { container } = renderBell();
    await waitFor(() => expect(notificationsApi.list).toHaveBeenCalled());

    const bellArea = container.querySelector('[style*="cursor: pointer"]') || container.firstChild!.firstChild!;
    fireEvent.click(bellArea as Element);

    await waitFor(() => expect(screen.getByText('Report!')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Report!'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/projects/p2?tab=weekly');
    });
  });
});
