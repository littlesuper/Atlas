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

// 隔离 hero 输入（其自身测试已覆盖）：只验证首页装配
vi.mock('../../components/AssistantHeroInput', () => ({
  default: () => <div data-testid="hero-input" />,
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
  it('always renders the hero input', () => {
    renderHome();
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
  });

  it('shows the risk section when there are risk points', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText('项目风险点（AI 分析）')).toBeInTheDocument());
    expect(screen.getByText('关键路径有阻塞风险')).toBeInTheDocument();
    expect(screen.getByText('项目甲关键路径阻塞')).toBeInTheDocument();
    expect(screen.getByText('尽快补齐固件联调资源')).toBeInTheDocument();
  });

  it('hides the risk section when only a benign concern exists (no real risk points)', async () => {
    mockGetDashboard.mockResolvedValueOnce({
      data: { ...dashboard, projects: [dashboard.projects[1]], topActionItems: [] }, // 仅 LOW，无行动项
    });
    // 善意提示（非真实风险）不应触发风险区：topConcerns 非空但无高风险项目/行动项
    mockGetInsights.mockResolvedValueOnce({ data: { ...insights, topConcerns: ['当前所有项目风险等级在可控范围内'] } });
    renderHome();
    // hero 始终在；等渲染稳定后断言风险区缺席
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument());
  });

  it('shows only the hero when risk data fails to load', async () => {
    mockGetDashboard.mockRejectedValueOnce(new Error('network'));
    renderHome();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    expect(screen.getByTestId('hero-input')).toBeInTheDocument();
    expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument();
  });
});
