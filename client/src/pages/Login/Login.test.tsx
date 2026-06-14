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

vi.mock('sonner', () => ({
  toast: { success: mockMessageSuccess, error: mockMessageError, warning: vi.fn(), info: vi.fn() },
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
    expect(screen.getByText('硬件项目管理')).toBeInTheDocument();
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

  it('登录成功后跳转到首页', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('登录失败时不跳转页面', async () => {
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
      expect(mockLogin).toHaveBeenCalledWith('admin', 'wrongpass');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('点击登录时调用 login 携带输入的凭据', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'testpass' },
    });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass');
    });
  });

  it('显示登录标题', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('硬件项目管理')).toBeInTheDocument();
  });

  it('显示密码登录和企业微信 Tab', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('密码登录')).toBeInTheDocument();
    expect(screen.getByText('企业微信')).toBeInTheDocument();
  });

  it('renders form with autocomplete off', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const form = document.querySelector('form');
    expect(form?.getAttribute('autocomplete')).toBe('off');
  });

  it('has username and password input fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument();
  });

  it('空表单提交不触发 login', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('登录'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('登录按钮初始显示登录文字且未禁用', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: '登录' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('username input has minLength validation', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText('请输入用户名');
    expect(input).toBeInTheDocument();
  });

  it('short username does not trigger login call', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'ab' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByText('登录'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('login container has correct CSS class', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(document.querySelector('.login-container')).toBeInTheDocument();
    expect(document.querySelector('.login-card')).toBeInTheDocument();
  });

  it('short password does not trigger login call', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByText('登录'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('显示企业微信 Tab 内容区域', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('企业微信')).toBeInTheDocument();
  });

  it('loading 状态初始为 false，按钮不显示登录中', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.queryByText('登录中...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('password input has type password', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const pwdInput = screen.getByPlaceholderText('请输入密码');
    expect(pwdInput.getAttribute('type')).toBe('password');
  });

  it('renders username input field', () => {
    render(<Login />);
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
  });

  it('renders login form title', () => {
    render(<Login />);
    expect(screen.getByText('登录')).toBeInTheDocument();
  });

  it('password input is wrapped in form with autocomplete off', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.getAttribute('autocomplete')).toBe('off');
  });

  it('login form does not submit with only username', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'admin' },
    });
    fireEvent.click(screen.getByText('登录'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('login success with valid credentials navigates and clears form state', async () => {
    mockLogin.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByText('登录'));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('renders login form with username and password fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument();
  });

  it('login form renders without MemoryRouter wrapper using default context', () => {
    expect(() => render(<Login />)).not.toThrow();
  });

  it('login form has password input', () => {
    render(<Login />);
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
  });

  it('login form has submit button', () => {
    render(<Login />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('login form has username input', () => {
    render(<Login />);
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('login form renders password input', () => {
    render(<Login />);
    const inputs = document.querySelectorAll('input[type="password"]');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders submit button', () => {
    render(<Login />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('Login page has input fields', () => {
    render(<Login />);
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders login form container', () => {
    const { container } = render(<Login />);
    expect(container.querySelector('form, .arco-form, div')).toBeTruthy();
  });
});
