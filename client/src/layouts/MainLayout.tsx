import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  FolderKanban,
  ShieldAlert,
  FileText,
  Users,
  Package,
  Settings,
  ChevronsUpDown,
  LogOut,
  Sun,
  Moon,
  User,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import NotificationBell from '../components/NotificationBell';
import AssistantLauncher from '../components/AssistantLauncher';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface NavItemDef {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: { resource: string; action: string };
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasPermission, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const [appVersion, setAppVersion] = React.useState('');
  React.useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((d) => setAppVersion(d.version || '')).catch(() => {});
  }, []);

  const menuItems: NavItemDef[] = [
    { key: '/', label: '首页', path: '/', icon: Home },
    { key: '/projects', label: '项目管理', path: '/projects', icon: FolderKanban },
    { key: '/risk-dashboard', label: '风险总览', path: '/risk-dashboard', icon: ShieldAlert },
    { key: '/weekly-reports', label: '项目周报', path: '/weekly-reports', icon: FileText },
    { key: '/workload', label: '项目资源', path: '/workload', icon: Users },
    { key: '/products', label: '产品管理', path: '/products', icon: Package },
    { key: '/admin', label: '系统管理', path: '/admin', icon: Settings, permission: { resource: 'user', action: 'read' } },
  ];

  const visibleMenuItems = menuItems.filter((item) =>
    item.permission ? hasPermission(item.permission.resource, item.permission.action) : true
  );
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(path + '/');
  const platformItems = visibleMenuItems.filter((i) => i.key !== '/admin');
  const systemItems = visibleMenuItems.filter((i) => i.key === '/admin');
  const activeTitle = visibleMenuItems.find((i) => isActive(i.path))?.label ?? '';

  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const routeProjectId = projectMatch && projectMatch[1] !== 'new' ? projectMatch[1] : null;
  const canUseAssistant = hasPermission('activity', 'update');

  // .nav-item 类名保留：迁移期未迁的旧页面 e2e 仍靠 `.nav-item`+文案 点击导航
  const renderItems = (items: NavItemDef[]) =>
    items.map((item) => {
      const Icon = item.icon;
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton
            className="nav-item"
            isActive={isActive(item.path)}
            tooltip={item.label}
            onClick={() => navigate(item.path)}
          >
            <Icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                onClick={() => navigate('/')}
                className="data-[slot=sidebar-menu-button]:!p-1.5"
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                  <img src="/logo.png" alt="贝锐科技" className="size-6 object-contain" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Atlas</span>
                  <span className="text-muted-foreground truncate text-xs">贝锐科技</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>平台</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(platformItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {systemItems.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>系统</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(systemItems)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        <User className="size-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.realName || user?.username || '用户'}</span>
                      {user?.username && <span className="text-muted-foreground truncate text-xs">@{user.username}</span>}
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="min-w-56 rounded-lg">
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    {user?.realName || user?.username || '用户'}
                    {appVersion ? ` · v${appVersion}` : ''}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLogoutOpen(true)}>
                    <LogOut className="size-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          {activeTitle && <h1 className="text-base font-medium">{activeTitle}</h1>}
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
              {theme === 'light' ? <Moon /> : <Sun />}
            </Button>
          </div>
        </header>

        <div className="page-content">{children}</div>
      </SidebarInset>

      {/* 退出确认 */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出</AlertDialogTitle>
            <AlertDialogDescription>确定要退出登录吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => logout()}>退出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 全局 AI 助手浮层；首页已有 hero 输入 */}
      {canUseAssistant && location.pathname !== '/' && <AssistantLauncher projectId={routeProjectId} />}
    </SidebarProvider>
  );
};

export default MainLayout;
