import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  FolderKanban,
  ShieldAlert,
  FileText,
  Users,
  Package,
  Sparkles,
  UserCog,
  CalendarDays,
  ScrollText,
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

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user, hasPermission, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const [appVersion, setAppVersion] = React.useState('');
  React.useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((d) => setAppVersion(d.version || '')).catch(() => {});
  }, []);

  const navGroups: NavGroupDef[] = [
    {
      label: '概览',
      items: [{ key: '/', label: '首页', path: '/', icon: Home }],
    },
    {
      label: '项目',
      items: [
        { key: '/projects', label: '项目管理', path: '/projects', icon: FolderKanban },
        { key: '/weekly-reports', label: '项目周报', path: '/weekly-reports', icon: FileText },
        { key: '/risk-dashboard', label: '风险总览', path: '/risk-dashboard', icon: ShieldAlert },
        { key: '/workload', label: '项目资源', path: '/workload', icon: Users },
      ],
    },
    {
      label: '产品',
      items: [{ key: '/products', label: '产品管理', path: '/products', icon: Package }],
    },
    {
      // 系统设置的一级菜单直接平铺到侧边栏（替代原「系统管理」单项），各项跳到 /admin?tab=*
      label: '系统',
      items: [
        { key: '/admin?tab=ai', label: 'AI管理', path: '/admin?tab=ai', icon: Sparkles, permission: { resource: 'system', action: 'ai' } },
        { key: '/admin?tab=account', label: '账号管理', path: '/admin?tab=account', icon: UserCog, permission: { resource: 'system', action: 'account' } },
        { key: '/admin?tab=holidays', label: '节假日', path: '/admin?tab=holidays', icon: CalendarDays, permission: { resource: 'system', action: 'account' } },
        { key: '/admin?tab=audit', label: '操作日志', path: '/admin?tab=audit', icon: ScrollText, permission: { resource: 'system', action: 'audit_log' } },
      ],
    },
  ];

  const currentTab = new URLSearchParams(location.search).get('tab');
  // 含 ?tab= 的项（系统设置子项）按 pathname + tab 精确匹配；其余按路径前缀匹配
  const isActive = (item: NavItemDef) => {
    const [itemPath, itemQuery] = item.path.split('?');
    if (itemQuery) {
      const itemTab = new URLSearchParams(itemQuery).get('tab');
      return location.pathname === itemPath && currentTab === itemTab;
    }
    if (itemPath === '/') return location.pathname === '/';
    return location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
  };
  const hasItemPermission = (item: NavItemDef) =>
    item.permission ? hasPermission(item.permission.resource, item.permission.action) : true;
  // 过滤掉无可见项的分组（无任何 system:* 权限时「系统」整组隐藏）
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(hasItemPermission) }))
    .filter((group) => group.items.length > 0);

  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const routeProjectId = projectMatch && projectMatch[1] !== 'new' ? projectMatch[1] : null;
  const canUseAssistant = hasPermission('activity', 'update');

  // .nav-item 类名保留：迁移期未迁的旧页面 e2e 仍靠 `.nav-item`+文案 点击导航
  const renderItems = (items: NavItemDef[]) =>
    items.map((item) => {
      const Icon = item.icon;
      return (
        <SidebarMenuItem key={item.key}>
          {/* 用真实链接而非 button+onClick：鼠标点击导航不残留焦点框；非输入项不显示焦点描边，键盘聚焦改用淡底色提示 */}
          <SidebarMenuButton
            asChild
            className="nav-item focus-visible:bg-sidebar-accent focus-visible:ring-0"
            isActive={isActive(item)}
            tooltip={item.label}
          >
            <Link to={item.path}>
              <Icon />
              <span>{item.label}</span>
            </Link>
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
              {/* 仅展示，不作跳转链接 */}
              <div className="flex h-12 w-full items-center gap-1.5 overflow-hidden p-2 text-left group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!">
                {/* shrink-0：收起时被压成 32px 图标槽，没有它 flex 会把图标挤成长方形 → 变形 */}
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center">
                  <img src="/logo.png" alt="贝锐科技" className="size-8 object-contain" />
                </div>
                <div className="grid flex-1 text-left text-lg leading-tight">
                  <span className="truncate font-medium">硬件项目管理</span>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {visibleGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(group.items)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
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
                {/* 关闭后不把焦点交还触发按钮，避免鼠标操作后残留 focus-visible 焦点环（看着像选择框） */}
                <DropdownMenuContent side="right" align="end" className="min-w-56 rounded-lg" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    {user?.realName || user?.username || '用户'}
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
          {/* 极弱化版本号：仅为排障，不影响整体美观；侧栏收起时隐藏 */}
          {appVersion && (
            <div
              title="系统版本"
              className="text-muted-foreground/40 px-2 text-[10px] leading-none tabular-nums group-data-[collapsible=icon]:hidden"
            >
              v{appVersion}
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="切换主题">
              {theme === 'light' ? <Moon /> : <Sun />}
            </Button>
          </div>
        </header>

        {/* 首页是全屏聊天：去掉 page-content 的 24px padding 并固定为视口高度，
            否则 padding + 子页 h-full 叠加会把底部输入框顶出可视区 */}
        <div
          className="page-content"
          style={location.pathname === '/' ? { padding: 0, height: 'calc(100vh - 56px)', minHeight: 0 } : undefined}
        >
          {children}
        </div>
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
      {canUseAssistant && location.pathname !== '/' && (
        <AssistantLauncher projectId={routeProjectId} />
      )}
    </SidebarProvider>
  );
};

export default MainLayout;
