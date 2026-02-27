import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from '@arco-design/web-react';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import ErrorBoundary from './components/ErrorBoundary';

// 页面组件（需要实际创建）
const Login = React.lazy(() => import('./pages/Login'));
const ProjectList = React.lazy(() => import('./pages/Project/List'));
const ProjectDetail = React.lazy(() => import('./pages/Project/Detail'));
const ProductManagement = React.lazy(() => import('./pages/Product'));
const AdminManagement = React.lazy(() => import('./pages/Admin'));
const WeeklyReportsSummary = React.lazy(() => import('./pages/WeeklyReports'));
const WeeklyReportForm = React.lazy(() => import('./pages/WeeklyReports/Form'));
const WorkloadPage = React.lazy(() => import('./pages/Workload'));
const TemplateManagement = React.lazy(() => import('./pages/Admin/TemplateManagement'));

// 受保护的路由组件
interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePermission?: { resource: string; action: string };
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requirePermission,
}) => {
  const { isAuthenticated, hasPermission, loading } = useAuthStore();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size={40} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 检查权限
  if (requirePermission) {
    const { resource, action } = requirePermission;
    if (!hasPermission(resource, action)) {
      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontSize: '16px',
            color: 'var(--color-text-3)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <div>您没有访问此页面的权限</div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const { fetchUser, isAuthenticated } = useAuthStore();
  const { loadTheme, syncFromServer } = useThemeStore();

  useEffect(() => {
    // 立即从 localStorage 加载主题（无闪烁）
    loadTheme();
    // 获取用户信息，成功后从服务端同步主题偏好
    fetchUser().then(() => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        syncFromServer();
      }
    });
  }, [fetchUser, loadTheme, syncFromServer]);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <React.Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
            }}
          >
            <Spin size={40} />
          </div>
        }
      >
        <Routes>
          {/* 登录页 */}
          <Route path="/login" element={<Login />} />

          {/* 首页重定向 */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/projects" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* 项目列表（首页） */}
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectList />
              </ProtectedRoute>
            }
          />

          {/* 项目详情 */}
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectDetail />
              </ProtectedRoute>
            }
          />

          {/* 产品管理 */}
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <ProductManagement />
              </ProtectedRoute>
            }
          />

          {/* 账号管理（需要user:read权限） */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requirePermission={{ resource: 'user', action: 'read' }}>
                <AdminManagement />
              </ProtectedRoute>
            }
          />

          {/* 项目周报汇总 */}
          <Route
            path="/weekly-reports"
            element={
              <ProtectedRoute>
                <WeeklyReportsSummary />
              </ProtectedRoute>
            }
          />

          {/* 新建周报 */}
          <Route
            path="/weekly-reports/new"
            element={
              <ProtectedRoute>
                <WeeklyReportForm />
              </ProtectedRoute>
            }
          />

          {/* 编辑周报 */}
          <Route
            path="/weekly-reports/:id/edit"
            element={
              <ProtectedRoute>
                <WeeklyReportForm />
              </ProtectedRoute>
            }
          />

          {/* 项目模板管理 */}
          <Route
            path="/templates"
            element={
              <ProtectedRoute requirePermission={{ resource: 'project', action: 'create' }}>
                <TemplateManagement />
              </ProtectedRoute>
            }
          />

          {/* 资源负载 */}
          <Route
            path="/workload"
            element={
              <ProtectedRoute>
                <WorkloadPage />
              </ProtectedRoute>
            }
          />

          {/* 404页面 */}
          <Route
            path="*"
            element={
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100vh',
                  fontSize: '16px',
                  color: 'var(--color-text-3)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>404</div>
                  <div>页面不存在</div>
                </div>
              </div>
            }
          />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
