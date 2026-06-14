import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './index';
import type { RiskDashboardData, RiskDashboardInsights } from '../../types';

const { mockGetDashboard, mockGetInsights } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetInsights: vi.fn(),
}));

vi.mock('../../api', () => ({
  riskApi: { getDashboard: mockGetDashboard, getInsights: mockGetInsights },
}));

// 隔离对话组件（其自身测试已覆盖）：只验证首页装配
vi.mock('../../components/AssistantConversation', () => ({
  default: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="hero-conversation">hero:{String(projectId)}</div>
  ),
}));

// MainLayout 依赖 store/路由，简化为透传
vi.mock('../../layouts/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const dashboard: RiskDashboardData = {
  projects: [
    { projectId: 'p1', projectName: '项目甲', productLine: null, riskLevel: 'CRITICAL', assessedAt: '2026-06-01', source: 'ai', aiInsights: '关键路径有阻塞风险', trendDirection: 'WORSENING' },
    { projectId: 'p2', projectName: '项目乙', productLine: null, riskLevel: 'LOW', assessedAt: '2026-06-01', source: 'rule_engine', aiInsights: null, trendDirection: 'STABLE' },
  ],
  riskDistribution: { LOW: 3, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
  topActionItems: [{ projectId: 'p1', projectName: '项目甲', action: '尽快补齐固件联调资源', priority: 'HIGH' }],
};
const insights: RiskDashboardInsights = {
  topConcerns: ['项目甲关键路径阻塞', '整体进度偏慢'],
  improvements: [],
  deteriorations: [],
  generatedAt: '2026-06-01',
};

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDashboard.mockResolvedValue({ data: dashboard });
  mockGetInsights.mockResolvedValue({ data: insights });
});

describe('Home (AI 首页)', () => {
  it('renders the hero AI conversation with null project context', () => {
    renderHome();
    expect(screen.getByText('用一句话使用系统')).toBeInTheDocument();
    expect(screen.getByTestId('hero-conversation')).toHaveTextContent('hero:null');
  });

  it('shows risk distribution, AI concerns, high-risk projects and action items', async () => {
    renderHome();
    // 等唯一文本出现（项目甲在卡片与行动项里都出现，不能用它做唯一断言）
    await waitFor(() => expect(screen.getByText('关键路径有阻塞风险')).toBeInTheDocument());
    // distribution section (中风险 只出现在分布标签里，无同名 Tag)
    expect(screen.getByText('中风险')).toBeInTheDocument();
    // AI concerns
    expect(screen.getByText('项目甲关键路径阻塞')).toBeInTheDocument();
    // high-risk project card with AI insight (CRITICAL shown, LOW filtered out)
    expect(screen.getByText('关键路径有阻塞风险')).toBeInTheDocument();
    expect(screen.queryByText('项目乙')).not.toBeInTheDocument();
    // action item
    expect(screen.getByText('尽快补齐固件联调资源')).toBeInTheDocument();
  });

  it('shows empty state when no high-risk projects', async () => {
    mockGetDashboard.mockResolvedValueOnce({
      data: { ...dashboard, projects: [dashboard.projects[1]] }, // only LOW
    });
    renderHome();
    await waitFor(() => expect(screen.getByText('暂无高风险项目')).toBeInTheDocument());
  });

  it('still renders hero when risk data fails to load', async () => {
    mockGetDashboard.mockRejectedValueOnce(new Error('network'));
    renderHome();
    await waitFor(() => expect(screen.getByText('暂无风险分析数据')).toBeInTheDocument());
    expect(screen.getByTestId('hero-conversation')).toBeInTheDocument();
  });
});
