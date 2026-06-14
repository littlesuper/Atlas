import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ActivityComments, { renderActionLabel, formatChangeEntries } from './ActivityComments';
import { activityCommentsApi, auditLogsApi } from '../../../api';
import type { ActivityComment, AuditLog } from '../../../types';

function commentsResponse(
  data: ActivityComment[] = [],
  total = 0,
): Awaited<ReturnType<typeof activityCommentsApi.list>> {
  return { data: { data, total } } as Awaited<ReturnType<typeof activityCommentsApi.list>>;
}

function logsResponse(
  data: AuditLog[] = [],
  total = 0,
): Awaited<ReturnType<typeof auditLogsApi.list>> {
  return { data: { data, total, page: 1, pageSize: 10 } } as Awaited<ReturnType<typeof auditLogsApi.list>>;
}

function emptyResponse<T>(): T {
  return {} as T;
}

describe('ActivityComments', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const isKnownAutoSizeWarning = (args: unknown[]) => {
      const message = args.map((arg) => String(arg)).join(' ');
      return message.includes('NaN') && message.includes('height') && message.includes('css style property');
    };
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      if (isKnownAutoSizeWarning(args)) {
        return;
      }
      originalConsoleError(...args);
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      if (isKnownAutoSizeWarning(args)) {
        return;
      }
      originalConsoleWarn(...args);
    });
    vi.mocked(activityCommentsApi.list).mockResolvedValue(commentsResponse());
    vi.mocked(auditLogsApi.list).mockResolvedValue(logsResponse());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

    // 发送按钮在输入为空时禁用
    const submitBtn = screen.getByLabelText('发送评论');
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });

  it('calls create API when submitting a comment', async () => {
    vi.mocked(activityCommentsApi.create).mockResolvedValue(
      emptyResponse<Awaited<ReturnType<typeof activityCommentsApi.create>>>(),
    );

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
      expect(screen.getByLabelText('发送评论').hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(screen.getByLabelText('发送评论'));

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

    fireEvent.mouseDown(screen.getByText('变更历史'));

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
    vi.mocked(auditLogsApi.list).mockResolvedValue(logsResponse([
      {
        id: 'log1',
        userId: 'u1',
        userName: 'Zhang',
        action: 'UPDATE',
        resourceType: 'activity',
        resourceName: 'Task A',
        createdAt: '2025-03-01T10:00:00Z',
        changes: { status: { from: 'NOT_STARTED', to: 'IN_PROGRESS' } },
      },
    ], 1));

    render(<ActivityComments activityId="act1" />);

    await waitFor(() => expect(screen.getByText('变更历史')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('变更历史'));

    await waitFor(() => {
      expect(screen.getByText('Zhang')).toBeInTheDocument();
      expect(screen.getByText(/NOT_STARTED/)).toBeInTheDocument();
      expect(screen.getByText(/IN_PROGRESS/)).toBeInTheDocument();
    });
  });
});

describe('renderActionLabel', () => {
  it('maps CREATE to 创建', () => expect(renderActionLabel('CREATE')).toBe('创建'));
  it('maps UPDATE to 更新', () => expect(renderActionLabel('UPDATE')).toBe('更新'));
  it('maps DELETE to 删除', () => expect(renderActionLabel('DELETE')).toBe('删除'));
  it('returns raw action for unknown', () => expect(renderActionLabel('UNKNOWN')).toBe('UNKNOWN'));
});

describe('formatChangeEntries', () => {
  it('formats single change entry', () => {
    const result = formatChangeEntries({ status: { from: 'A', to: 'B' } });
    expect(result).toEqual(['status: A → B']);
  });

  it('formats multiple change entries', () => {
    const result = formatChangeEntries({
      status: { from: 'A', to: 'B' },
      priority: { from: 'LOW', to: 'HIGH' },
    });
    expect(result).toHaveLength(2);
  });

  it('replaces null with dash', () => {
    const result = formatChangeEntries({ field: { from: null, to: 'value' } });
    expect(result[0]).toBe('field: - → value');
  });

  it('replaces undefined with dash', () => {
    const result = formatChangeEntries({ field: { from: 'old', to: undefined } });
    expect(result[0]).toBe('field: old → -');
  });

  it('returns empty array for empty changes object', () => {
    expect(formatChangeEntries({})).toEqual([]);
  });

  it('renders falsy number 0 as "0" not "-"', () => {
    const result = formatChangeEntries({ count: { from: 0, to: 5 } });
    expect(result[0]).toBe('count: 0 → 5');
  });

  it('renders boolean false as "false" not "-"', () => {
    const result = formatChangeEntries({ active: { from: true, to: false } });
    expect(result[0]).toBe('active: true → false');
  });

  it('formatChangeEntries handles both null and undefined in same entry', () => {
    const result = formatChangeEntries({ field: { from: null, to: undefined } });
    expect(result[0]).toBe('field: - → -');
  });

  it('formatChangeEntries renders empty string from/to as empty string not dash', () => {
    const result = formatChangeEntries({ name: { from: '', to: 'new' } });
    expect(result[0]).toBe('name:  → new');
  });

  it('formatChangeEntries stringifies object from/to values', () => {
    const result = formatChangeEntries({ config: { from: { a: 1 }, to: { b: 2 } } });
    expect(result[0]).toBe('config: [object Object] → [object Object]');
  });

  it('formatChangeEntries handles array from/to values', () => {
    const result = formatChangeEntries({ list: { from: [1, 2], to: [3] } });
    expect(result[0]).toBe('list: 1,2 → 3');
  });

  it('formatChangeEntries handles symbol values gracefully', () => {
    const result = formatChangeEntries({ field: { from: Symbol('x'), to: 'y' } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('field:');
  });

  it('formatChangeEntries handles null to value change', () => {
    const result = formatChangeEntries({ name: { from: null, to: 'new' } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('name');
  });

  it('formatChangeEntries handles zero number from and to', () => {
    const result = formatChangeEntries({ count: { from: 0, to: 0 } });
    expect(result[0]).toBe('count: 0 → 0');
  });

  it('renderActionLabel returns raw string for empty action', () => {
    expect(renderActionLabel('')).toBe('');
  });

  it('formatChangeEntries handles undefined from and to values', () => {
    const result = formatChangeEntries({ field: { from: undefined, to: undefined } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('field');
  });

  it('renderActionLabel returns label for UPDATE action', () => {
    const label = renderActionLabel('UPDATE');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('formatChangeEntries with numeric values formats correctly', () => {
    const result = formatChangeEntries({ count: { from: 0, to: 5 } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('count');
  });

  it('formatChangeEntries handles empty object', () => {
    const result = formatChangeEntries({});
    expect(result).toEqual([]);
  });

  it('formatChangeEntries handles single entry', () => {
    const result = formatChangeEntries({ name: { from: 'old', to: 'new' } });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('name');
  });

  it('formatChangeEntries handles multiple entries', () => {
    const result = formatChangeEntries({ name: { from: 'a', to: 'b' }, status: { from: 'x', to: 'y' } });
    expect(result).toHaveLength(2);
  });

  it('formatChangeEntries handles empty object', () => {
    const result = formatChangeEntries({});
    expect(result).toHaveLength(0);
  });

  it('formatChangeEntries handles single field entry', () => {
    const result = formatChangeEntries({ status: { from: 'TODO', to: 'DONE' } });
    expect(result).toHaveLength(1);
  });

  it('formatChangeEntries handles empty change object', () => {
    const result = formatChangeEntries({});
    expect(result).toHaveLength(0);
  });

  it('formatChangeEntries handles entry with non-standard keys', () => {
    const result = formatChangeEntries({ customField: { from: 'x', to: 'y' } });
    expect(result).toHaveLength(1);
  });
});
