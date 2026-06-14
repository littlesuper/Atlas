import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RiskOverview from './RiskOverview';
import type { RiskDashboardData, RiskDashboardInsights } from '../../types';

const { mockGetDashboard, mockGetInsights } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetInsights: vi.fn(),
}));

vi.mock('../../api', () => ({
  riskApi: { getDashboard: mockGetDashboard, getInsights: mockGetInsights },
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

const renderRO = () => render(<MemoryRouter><RiskOverview /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDashboard.mockResolvedValue({ data: dashboard });
  mockGetInsights.mockResolvedValue({ data: insights });
});

describe('RiskOverview', () => {
  it('有真实风险点时显示风险区与内容', async () => {
    renderRO();
    await waitFor(() => expect(screen.getByText('项目风险点（AI 分析）')).toBeInTheDocument());
    expect(screen.getByText('关键路径有阻塞风险')).toBeInTheDocument(); // 高风险项目 AI 洞察
    expect(screen.getByText('项目甲关键路径阻塞')).toBeInTheDocument(); // AI 重点关注
    expect(screen.getByText('尽快补齐固件联调资源')).toBeInTheDocument(); // 重点行动项
    expect(screen.queryByText('项目乙')).not.toBeInTheDocument(); // LOW 被过滤
  });

  it('仅善意提示(无高风险项目/行动项)时返回 null', async () => {
    mockGetDashboard.mockResolvedValueOnce({
      data: { ...dashboard, projects: [dashboard.projects[1]], topActionItems: [] },
    });
    mockGetInsights.mockResolvedValueOnce({ data: { ...insights, topConcerns: ['当前所有项目风险等级在可控范围内'] } });
    renderRO();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument());
  });

  it('加载失败时返回 null', async () => {
    mockGetDashboard.mockRejectedValueOnce(new Error('network'));
    renderRO();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    expect(screen.queryByText('项目风险点（AI 分析）')).not.toBeInTheDocument();
  });
});
