import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiManagement from './AiManagement';

// ---- vi.hoisted mocks ----

const {
  mockList,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockTestConnection,
  mockGetUsageStats,
  mockMessageSuccess,
  mockMessageError,
  mockMessageWarning,
  mockHasPermission,
  mockModalConfirm,
} = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockTestConnection: vi.fn(),
  mockGetUsageStats: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageWarning: vi.fn(),
  mockHasPermission: vi.fn(),
  mockModalConfirm: vi.fn(),
}));

// ---- Module mocks ----

vi.mock('../../api', () => ({
  aiConfigApi: {
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
    testConnection: mockTestConnection,
    getUsageStats: mockGetUsageStats,
  },
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ hasPermission: mockHasPermission }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: mockMessageSuccess,
      error: mockMessageError,
      warning: mockMessageWarning,
    },
    Modal: {
      ...actual.Modal,
      confirm: mockModalConfirm,
    },
  };
});

vi.mock('@arco-design/web-react/icon', () => ({
  IconPlus: () => null,
  IconEdit: () => null,
  IconDelete: () => null,
}));

// ---- Helpers ----

const EMPTY_STATS = {
  data: {
    totals: { callCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    dailyStats: [],
    recentLogs: [],
  },
};

function makeConfig(overrides: Partial<import('../../types').AiConfig> = {}) {
  return {
    id: 'cfg-1',
    name: 'DeepSeek',
    apiKey: '****sk01',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat',
    features: 'risk',
    ...overrides,
  };
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <AiManagement />
    </MemoryRouter>,
  );
}

// ============================================================
// 测试
// ============================================================

describe('AiManagement 配置列表', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('加载并显示配置列表', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    });
    expect(screen.getByText('****sk01')).toBeInTheDocument();
  });

  it('无配置时显示空状态提示', async () => {
    mockList.mockResolvedValue({ data: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/暂无AI配置/)).toBeInTheDocument();
    });
  });

  it('加载列表失败时显示错误消息', async () => {
    mockList.mockRejectedValue(new Error('network'));
    renderComponent();

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('加载AI配置列表失败');
    });
  });

  it('显示关联功能标签', async () => {
    mockList.mockResolvedValue({
      data: [makeConfig({ features: 'risk,weekly_report' })],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('风险评估')).toBeInTheDocument();
      expect(screen.getByText('周报建议')).toBeInTheDocument();
    });
  });

  it('无关联功能时显示"无"', async () => {
    mockList.mockResolvedValue({
      data: [makeConfig({ features: '' })],
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('无')).toBeInTheDocument();
    });
  });

  it('无权限时不显示操作列和新建按钮', async () => {
    mockHasPermission.mockReturnValue(false);
    mockList.mockResolvedValue({ data: [makeConfig()] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    });
    expect(screen.queryByText('新建配置')).not.toBeInTheDocument();
  });
});

describe('AiManagement 新建配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockList.mockResolvedValue({ data: [] });
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('点击新建按钮打开 Drawer', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('新建配置')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新建配置'));

    await waitFor(() => {
      // Drawer 打开后显示表单字段（用 placeholder 验证，避免与 Table 列名重复）
      expect(screen.getByPlaceholderText('如：GPT-4o 风险评估')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://api.openai.com/v1/chat/completions')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.getByText('验证连接')).toBeInTheDocument();
    });
  });

  it('创建成功后刷新列表并显示成功消息', async () => {
    const newCfg = makeConfig({ id: 'cfg-new', name: 'New Config' });
    mockCreate.mockResolvedValue({ data: newCfg });
    mockList.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [newCfg] });

    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('如：GPT-4o 风险评估')).toBeInTheDocument();
    });

    // 填写名称（必填）
    fireEvent.change(screen.getByPlaceholderText('如：GPT-4o 风险评估'), {
      target: { value: 'New Config' },
    });
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test-key' },
    });

    // 点确定
    fireEvent.click(screen.getByRole('button', { name: /确定|OK/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
      expect(mockMessageSuccess).toHaveBeenCalledWith('配置创建成功');
    });
  });
});

describe('AiManagement 编辑配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('点击编辑按钮打开 Drawer 并填充表单', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    });

    // 点编辑按钮（表格行中的第一个按钮）
    const row = screen.getByText('DeepSeek').closest('tr')!;
    const editBtn = within(row).getAllByRole('button')[0];
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText('编辑配置')).toBeInTheDocument();
    });
  });

  it('更新成功后刷新列表', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    mockUpdate.mockResolvedValue({ data: cfg });
    renderComponent();

    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const editBtn = within(row).getAllByRole('button')[0];
    fireEvent.click(editBtn);

    await waitFor(() => expect(screen.getByText('编辑配置')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /确定|OK/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('cfg-1', expect.any(Object));
      expect(mockMessageSuccess).toHaveBeenCalledWith('配置更新成功');
    });
  });
});

describe('AiManagement 删除配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('点击删除按钮弹出确认框', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    renderComponent();

    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const deleteBtn = within(row).getAllByRole('button')[1]; // 第二个按钮是删除
    fireEvent.click(deleteBtn);

    expect(mockModalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认删除',
        content: expect.stringContaining('DeepSeek'),
      }),
    );
  });

  it('确认删除后调 API 并刷新', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    mockDelete.mockResolvedValue({});
    renderComponent();

    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const deleteBtn = within(row).getAllByRole('button')[1];
    fireEvent.click(deleteBtn);

    // 执行 Modal.confirm 的 onOk
    const confirmCall = mockModalConfirm.mock.calls[0][0];
    await confirmCall.onOk();

    expect(mockDelete).toHaveBeenCalledWith('cfg-1');
    expect(mockMessageSuccess).toHaveBeenCalledWith('配置删除成功');
  });

  it('删除失败时显示错误消息', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    mockDelete.mockRejectedValue(new Error('fail'));
    renderComponent();

    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const deleteBtn = within(row).getAllByRole('button')[1];
    fireEvent.click(deleteBtn);

    const confirmCall = mockModalConfirm.mock.calls[0][0];
    await confirmCall.onOk();

    expect(mockMessageError).toHaveBeenCalledWith('删除失败');
  });
});

describe('AiManagement 连接测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockList.mockResolvedValue({ data: [] });
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('新建模式下未填 URL 和 Key 时提示警告', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockMessageWarning).toHaveBeenCalledWith('请填写 API URL 和 API Key');
    });
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it('新建模式下填写 URL 和 Key 后成功测试', async () => {
    mockTestConnection.mockResolvedValue({
      data: { success: true, message: '连接成功' },
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    fireEvent.change(
      screen.getByPlaceholderText('https://api.openai.com/v1/chat/completions'),
      { target: { value: 'https://api.deepseek.com/v1/chat/completions' } },
    );
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-real-key' },
    });

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          apiUrl: 'https://api.deepseek.com/v1/chat/completions',
          apiKey: 'sk-real-key',
        }),
      );
      expect(mockMessageSuccess).toHaveBeenCalledWith('连接成功');
    });
  });

  it('连接测试失败时显示错误消息', async () => {
    mockTestConnection.mockResolvedValue({
      data: { success: false, message: 'API 返回 401: Unauthorized' },
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    fireEvent.change(
      screen.getByPlaceholderText('https://api.openai.com/v1/chat/completions'),
      { target: { value: 'https://api.example.com' } },
    );
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-bad-key' },
    });

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('API 返回 401: Unauthorized');
    });
  });

  it('连接测试网络错误时显示默认错误消息', async () => {
    mockTestConnection.mockRejectedValue(new Error('Network error'));

    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    fireEvent.change(
      screen.getByPlaceholderText('https://api.openai.com/v1/chat/completions'),
      { target: { value: 'https://api.example.com' } },
    );
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-key' },
    });

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('验证请求失败');
    });
  });

  it('编辑模式下掩码 Key 传 configId 给服务端', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    mockTestConnection.mockResolvedValue({
      data: { success: true, message: '连接成功' },
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    // 打开编辑
    const row = screen.getByText('DeepSeek').closest('tr')!;
    const editBtn = within(row).getAllByRole('button')[0];
    fireEvent.click(editBtn);

    await waitFor(() => expect(screen.getByText('编辑配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          configId: 'cfg-1',
          apiKey: '****sk01',
        }),
      );
      expect(mockMessageSuccess).toHaveBeenCalledWith('连接成功');
    });
  });

  it('编辑模式下输入新 Key 时不传 configId', async () => {
    const cfg = makeConfig();
    mockList.mockResolvedValue({ data: [cfg] });
    mockTestConnection.mockResolvedValue({
      data: { success: true, message: '连接成功' },
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const editBtn = within(row).getAllByRole('button')[0];
    fireEvent.click(editBtn);

    await waitFor(() => expect(screen.getByText('编辑配置')).toBeInTheDocument());

    // 输入新 key（替换掩码）
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-new-real-key' },
    });

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      const callArgs = mockTestConnection.mock.calls[0][0];
      expect(callArgs.apiKey).toBe('sk-new-real-key');
      expect(callArgs.configId).toBeUndefined();
    });
  });

  it('新建模式下只填 URL 不填 Key 时提示警告', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    // 只填 URL
    fireEvent.change(
      screen.getByPlaceholderText('https://api.openai.com/v1/chat/completions'),
      { target: { value: 'https://api.example.com' } },
    );

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockMessageWarning).toHaveBeenCalledWith('请填写 API URL 和 API Key');
    });
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it('新建模式下只填 Key 不填 URL 时提示警告', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('新建配置'));
    await waitFor(() => expect(screen.getByText('验证连接')).toBeInTheDocument());

    // 只填 Key
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-some-key' },
    });

    fireEvent.click(screen.getByText('验证连接'));

    await waitFor(() => {
      expect(mockMessageWarning).toHaveBeenCalledWith('请填写 API URL 和 API Key');
    });
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it('编辑模式下空 Key 不阻断（使用 configId 回退）', async () => {
    // 模拟配置的 apiKey 被清空的极端情况
    const cfg = makeConfig({ apiKey: '' });
    mockList.mockResolvedValue({ data: [cfg] });
    mockTestConnection.mockResolvedValue({
      data: { success: true, message: '连接成功' },
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument());

    const row = screen.getByText('DeepSeek').closest('tr')!;
    const editBtn = within(row).getAllByRole('button')[0];
    fireEvent.click(editBtn);

    await waitFor(() => expect(screen.getByText('编辑配置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('验证连接'));

    // 编辑模式下即使 apiKey 为空也不阻断（editingConfig 不为 null），由服务端最终校验
    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalled();
    });
  });
});

describe('AiManagement 使用统计', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockList.mockResolvedValue({ data: [] });
  });

  it('显示 Token 使用统计卡片', async () => {
    mockGetUsageStats.mockResolvedValue({
      data: {
        totals: { callCount: 42, promptTokens: 10000, completionTokens: 5000, totalTokens: 15000 },
        dailyStats: [],
        recentLogs: [],
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Token 使用统计')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('统计加载失败时显示错误消息', async () => {
    mockGetUsageStats.mockRejectedValue(new Error('fail'));
    renderComponent();

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('加载使用统计失败');
    });
  });

  it('显示最近调用日志', async () => {
    mockGetUsageStats.mockResolvedValue({
      data: {
        totals: { callCount: 1, promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        dailyStats: [],
        recentLogs: [
          {
            id: 'log-1',
            feature: 'risk',
            project: { id: 'p-1', name: '测试项目' },
            modelName: 'gpt-4o-mini',
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            createdAt: '2026-02-18T10:00:00.000Z',
          },
        ],
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('测试项目')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
    });
  });
});

describe('AiManagement 服务商预设', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
    mockList.mockResolvedValue({ data: [] });
    mockGetUsageStats.mockResolvedValue(EMPTY_STATS);
  });

  it('Drawer 中显示服务商选择器', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('新建配置')).toBeInTheDocument());
    fireEvent.click(screen.getByText('新建配置'));

    await waitFor(() => {
      expect(screen.getByText('服务商')).toBeInTheDocument();
    });
  });
});
