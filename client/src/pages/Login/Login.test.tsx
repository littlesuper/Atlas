import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './index';

// ---- Mocks ----
// vi.mock() factory functions are hoisted before const/let declarations, so
// mock fns must be created with vi.hoisted() to be reachable inside factories.

const { mockNavigate, mockLogin, mockMessageError, mockMessageSuccess } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLogin: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageSuccess: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ login: mockLogin }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { success: mockMessageSuccess, error: mockMessageError },
  };
});

// Icon SVGs are not needed in jsdom
vi.mock('@arco-design/web-react/icon', () => ({
  IconUser: () => null,
  IconLock: () => null,
}));

// ---- Tests ----

describe('Login 页面渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('显示系统标题', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('硬件管理系统')).toBeInTheDocument();
  });

  it('显示用户名和密码输入框', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument();
  });

  it('显示登录按钮', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('登录')).toBeInTheDocument();
  });

  it('显示页脚品牌文字', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText(/贝锐科技/)).toBeInTheDocument();
  });
});

describe('Login handleSubmit 逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('登录成功后跳转到 /projects', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/projects', { replace: true });
    });
  });

  it('登录失败时显示服务器错误消息', async () => {
    mockLogin.mockRejectedValue(new Error('用户名或密码错误'));
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('用户名或密码错误');
    });
  });

  it('登录失败且无 error.message 时显示默认提示', async () => {
    mockLogin.mockRejectedValue({});
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('登录失败，请检查用户名和密码');
    });
  });
});
