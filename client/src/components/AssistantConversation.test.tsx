import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssistantConversation from './AssistantConversation';
import type { AssistantProposeResult } from '../types';

const { mockPropose, mockApply, mockToastError, mockToastSuccess, mockToastWarning } = vi.hoisted(() => ({
  mockPropose: vi.fn(),
  mockApply: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastWarning: vi.fn(),
}));

vi.mock('../api', () => ({ assistantApi: { propose: mockPropose, apply: mockApply } }));

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess, warning: mockToastWarning },
}));

// 点击「应用全部」后弹出 AlertDialog，再点「确认应用」才真正写入
const confirmApply = async () => {
  fireEvent.click(screen.getByText('应用全部'));
  fireEvent.click(await screen.findByText('确认应用'));
};

const baseProposal = (over: Partial<AssistantProposeResult> = {}): AssistantProposeResult => ({
  proposalId: 'prop-1',
  noOp: false,
  preview: {
    rows: [{ key: 'A1', label: '硬件打样', before: '2026-03-02 ~ 2026-03-06', after: '2026-03-16 ~ 2026-03-20' }],
    risks: [],
    confidence: 'high',
  },
  narrative: '硬件打样推迟两周。',
  ...over,
});

const analyze = (text = '把硬件打样推迟两周') => {
  fireEvent.change(screen.getByPlaceholderText('例如：把整机测试的工期改成 5 天'), { target: { value: text } });
  fireEvent.click(screen.getByText('分析').closest('button')!);
};

beforeEach(() => vi.clearAllMocks());

describe('AssistantConversation', () => {
  it('renders input immediately (no FAB/open needed)', () => {
    render(<AssistantConversation projectId="p1" />);
    expect(screen.getByPlaceholderText('例如：把整机测试的工期改成 5 天')).toBeInTheDocument();
  });

  it('warns on empty analyze (no API call)', () => {
    render(<AssistantConversation projectId="p1" />);
    fireEvent.click(screen.getByText('分析'));
    expect(mockToastWarning).toHaveBeenCalled();
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it('propose ok → timeline + preview + apply; sends (utterance, projectId)', async () => {
    mockPropose.mockResolvedValue({
      data: baseProposal({
        preview: {
          rows: [{ key: 'A1', label: '硬件打样', before: 'a', after: 'b' }],
          risks: [{ kind: 'hard_node_breach', severity: 'danger', text: '撞硬节点：M1' }],
          confidence: 'high',
        },
      }),
    });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText('意图解析')).toBeInTheDocument());
    expect(screen.getByText('生成预览')).toBeInTheDocument();
    expect(screen.getByText('硬件打样推迟两周。')).toBeInTheDocument();
    expect(screen.getByText('撞硬节点：M1')).toBeInTheDocument();
    expect(screen.getByText('应用全部')).toBeInTheDocument();
    expect(mockPropose).toHaveBeenCalledWith('把硬件打样推迟两周', 'p1');
  });

  it('sends null context when projectId is null (home hero)', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    render(<AssistantConversation projectId={null} />);
    analyze('把项目甲优先级改成高');
    await waitFor(() => expect(mockPropose).toHaveBeenCalledWith('把项目甲优先级改成高', null));
  });

  it('shows AI / 系统计算 stage tags', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText('意图解析')).toBeInTheDocument());
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getAllByText('系统计算').length).toBe(2);
  });

  it('503 → AI unavailable, no preview', async () => {
    mockPropose.mockRejectedValue({ response: { status: 503 } });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText(/AI 暂不可用/)).toBeInTheDocument());
    expect(screen.queryByText('应用全部')).not.toBeInTheDocument();
  });

  it('noOp → 没听懂, no preview', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal({ proposalId: null, noOp: true, narrative: '没听懂这句话', preview: { rows: [], risks: [] } }) });
    render(<AssistantConversation projectId={null} />);
    analyze('优化一下');
    await waitFor(() => expect(screen.getByText('没听懂这句话')).toBeInTheDocument());
    expect(screen.queryByText('应用全部')).not.toBeInTheDocument();
  });

  it('low confidence warning', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal({ preview: { rows: [{ key: 'A1', label: 'x', before: 'a', after: 'b' }], risks: [], confidence: 'low' } }) });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText(/AI 对你的意图不太确定/)).toBeInTheDocument());
  });

  it('degrades to structured diff when narrative empty', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal({ narrative: '' }) });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText(/AI 文字复述暂不可用/)).toBeInTheDocument());
    expect(screen.getByText('应用全部')).toBeInTheDocument();
  });

  it('apply → success, 已应用 step, dispatches assistant:applied', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    mockApply.mockResolvedValue({ data: { ok: true, appliedDiff: { rows: [] }, risks: [] } });
    const evt = vi.fn();
    window.addEventListener('assistant:applied', evt);
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => screen.getByText('应用全部'));
    await confirmApply();
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith('prop-1'));
    expect(mockToastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('已写入，可在审计/撤回处回滚')).toBeInTheDocument());
    expect(evt).toHaveBeenCalled();
    window.removeEventListener('assistant:applied', evt);
  });

  it('apply 409 clears run + error', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    mockApply.mockRejectedValue({ response: { status: 409 } });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => screen.getByText('应用全部'));
    await confirmApply();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('已被改动')));
  });

  it('cancel clears the preview', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal() });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => screen.getByText('应用全部'));
    fireEvent.click(screen.getByText('取消'));
    await waitFor(() => expect(screen.queryByText('应用全部')).not.toBeInTheDocument());
  });

  it('renders a query ANSWER (read-only) distinctly — no apply button', async () => {
    mockPropose.mockResolvedValue({
      data: {
        proposalId: null,
        noOp: true,
        mode: 'answer',
        basis: 'deterministic',
        answer: 'GW-X500 的 EVT 阶段：6 个活动，按实际日期 2025-10-06 ~ 2025-12-20，共 53 个工作日。',
        preview: { rows: [], risks: [] },
        narrative: '',
      },
    });
    render(<AssistantConversation projectId={null} />);
    analyze('GW-X500 的 EVT 阶段花了多少工作日');
    await waitFor(() => expect(screen.getByText(/共 53 个工作日/)).toBeInTheDocument());
    expect(screen.getByText('问题解析')).toBeInTheDocument();
    expect(screen.getByText('查询计算')).toBeInTheDocument();
    expect(screen.getByText('系统精确计算')).toBeInTheDocument(); // 确定性来源标注
    expect(screen.getByText('再问一句')).toBeInTheDocument();
    // 只读：没有"应用全部"
    expect(screen.queryByText('应用全部')).not.toBeInTheDocument();
  });

  it('shows elapsed time on a change preview (耗时 X.X 秒)', async () => {
    mockPropose.mockResolvedValue({ data: baseProposal({ elapsedMs: 1230 }) });
    render(<AssistantConversation projectId="p1" />);
    analyze();
    await waitFor(() => expect(screen.getByText('耗时 1.2 秒')).toBeInTheDocument());
  });

  it('shows elapsed time on a query answer (耗时 X.X 秒)', async () => {
    mockPropose.mockResolvedValue({
      data: {
        proposalId: null,
        noOp: true,
        mode: 'answer',
        basis: 'deterministic',
        answer: 'GW-X500 的 EVT 阶段：共 53 个工作日。',
        preview: { rows: [], risks: [] },
        narrative: '',
        elapsedMs: 5720,
      },
    });
    render(<AssistantConversation projectId={null} />);
    analyze('GW-X500 的 EVT 阶段花了多少工作日');
    await waitFor(() => expect(screen.getByText('耗时 5.7 秒')).toBeInTheDocument());
  });

  it('grounded answer shows a "据系统数据" caveat badge', async () => {
    mockPropose.mockResolvedValue({
      data: {
        proposalId: null,
        noOp: true,
        mode: 'answer',
        basis: 'grounded',
        answer: '据系统数据，GW-X500 当前瓶颈在固件联调。',
        preview: { rows: [], risks: [] },
        narrative: '',
      },
    });
    render(<AssistantConversation projectId={null} />);
    analyze('GW-X500 现在的瓶颈在哪');
    // 用 badge 专有文案断言（"据系统数据"在答案与 badge 里都出现）
    await waitFor(() => expect(screen.getByText(/AI 整理，可能不完整/)).toBeInTheDocument());
  });

  describe('hero variant (pill input)', () => {
    it('renders the pill placeholder and round send button (no 分析 button)', () => {
      render(<AssistantConversation projectId={null} variant="hero" />);
      expect(screen.getByPlaceholderText('有问题，尽管问')).toBeInTheDocument();
      expect(screen.getByLabelText('发送')).toBeInTheDocument();
      expect(screen.queryByText('分析')).not.toBeInTheDocument();
    });

    it('submits via the round button → propose(utterance, null)', async () => {
      mockPropose.mockResolvedValue({ data: baseProposal() });
      render(<AssistantConversation projectId={null} variant="hero" />);
      fireEvent.change(screen.getByPlaceholderText('有问题，尽管问'), { target: { value: '把项目甲优先级改成高' } });
      fireEvent.click(screen.getByLabelText('发送'));
      await waitFor(() => expect(mockPropose).toHaveBeenCalledWith('把项目甲优先级改成高', null));
    });

    it('submits on Enter key', async () => {
      mockPropose.mockResolvedValue({ data: baseProposal() });
      render(<AssistantConversation projectId={null} variant="hero" />);
      const input = screen.getByPlaceholderText('有问题，尽管问');
      fireEvent.change(input, { target: { value: '把硬件打样推迟两周' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(mockPropose).toHaveBeenCalledWith('把硬件打样推迟两周', null));
    });

    it('the + button clears the input', () => {
      render(<AssistantConversation projectId={null} variant="hero" />);
      const input = screen.getByPlaceholderText('有问题，尽管问') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'something' } });
      expect(input.value).toBe('something');
      fireEvent.click(screen.getByLabelText('清空重来'));
      expect(input.value).toBe('');
    });
  });
});
