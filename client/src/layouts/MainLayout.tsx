import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Dropdown, Menu, Avatar, Modal, Tooltip } from '@arco-design/web-react';
import { IconUser, IconPoweroff, IconSun, IconMoon } from '@arco-design/web-react/icon';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import NotificationBell from '../components/NotificationBell';
import '../styles/global.css';

const { Header, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasPermission, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  // 菜单项配置
  const menuItems = [
    {
      key: '/projects',
      label: '项目管理',
      path: '/projects',
    },
    {
      key: '/weekly-reports',
      label: '项目周报',
      path: '/weekly-reports',
    },
    {
      key: '/workload',
      label: '项目资源',
      path: '/workload',
    },
    {
      key: '/products',
      label: '产品管理',
      path: '/products',
    },
    {
      key: '/admin',
      label: '系统管理',
      path: '/admin',
      // 需要user:read权限才能看到账号管理
      permission: { resource: 'user', action: 'read' },
    },
  ];

  // 过滤掉没有权限的菜单项
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.permission) {
      return hasPermission(item.permission.resource, item.permission.action);
    }
    return true;
  });

  // 判断当前菜单项是否激活
  const isActiveMenuItem = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // 处理菜单点击
  const handleMenuClick = (path: string) => {
    navigate(path);
  };

  // 处理退出登录
  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出',
      content: '确定要退出登录吗？',
      onOk: () => {
        logout();
      },
    });
  };

  // 用户下拉菜单
  const userDropdownMenu = (
    <Menu>
      <Menu.Item key="logout" onClick={handleLogout}>
        <IconPoweroff style={{ marginRight: '8px' }} />
        退出登录
      </Menu.Item>
    </Menu>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="main-header">
        {/* 左侧 LOGO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <img
            src="/logo.png"
            alt="贝锐科技"
            className="logo"
            onClick={() => navigate('/')}
          />
        </div>

        {/* 右侧菜单和用户信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 导航菜单 */}
          <div className="nav-menu">
            {visibleMenuItems.map((item) => (
              <div
                key={item.key}
                className={`nav-item ${isActiveMenuItem(item.path) ? 'active' : ''}`}
                onClick={() => handleMenuClick(item.path)}
              >
                {item.label}
              </div>
            ))}
          </div>

          {/* 通知铃铛 */}
          <NotificationBell />

          {/* 主题切换 */}
          <Tooltip content={theme === 'light' ? '切换为暗色模式' : '切换为明亮模式'}>
            <div
              className="theme-toggle-btn"
              onClick={toggleTheme}
            >
              {theme === 'light' ? <IconMoon /> : <IconSun />}
            </div>
          </Tooltip>

          {/* 用户下拉菜单 */}
          <Dropdown droplist={userDropdownMenu} position="br">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: '8px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Avatar size={28} style={{ backgroundColor: 'var(--status-info)' }}>
                <IconUser />
              </Avatar>
              <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '14px' }}>
                {user?.realName || user?.username || '用户'}
              </span>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Content className="page-content">{children}</Content>
    </Layout>
  );
};

export default MainLayout;
