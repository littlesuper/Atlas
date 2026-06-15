import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { pinyin } from 'pinyin-pro';
import MainLayout from '../../layouts/MainLayout';
import { usersApi, rolesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { User, Role, Permission } from '../../types';
import InlineRoleEditor from './InlineRoleEditor';
import { USER_STATUS_MAP, PERMISSION_RESOURCE_MAP, PERMISSION_ACTION_MAP } from '../../utils/constants';
import AiManagement from './AiManagement';
import AuditLogTab from './AuditLog';
import WecomManagement from './WecomManagement';
import HolidayManagement from './HolidayManagement';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

export function resolveTab(urlTab: string, visibleTabs: string[]): string {
  return visibleTabs.includes(urlTab) ? urlTab : visibleTabs[0] || 'ai';
}

export function generateUsername(realName: string): string {
  return pinyin(realName, { toneType: 'none', type: 'array' }).join('');
}

const ALL = '__all__';

function Field({
  label,
  required,
  error,
  extra,
  children,
  className,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  extra?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {extra && !error && <p className="text-muted-foreground text-xs">{extra}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

interface UserForm {
  username: string;
  realName: string;
  password: string;
  wecomUserId: string;
  roleIds: string[]; // 存角色名称
}
const EMPTY_USER: UserForm = { username: '', realName: '', password: '', wecomUserId: '', roleIds: [] };

interface RoleForm {
  name: string;
  description: string;
  permissionIds: string[];
}
const EMPTY_ROLE: RoleForm = { name: '', description: '', permissionIds: [] };

const AdminPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

  // Tab状态（从 URL 读取，刷新后保持）
  const [searchParams, setSearchParams] = useSearchParams();
  const setMainTab = useCallback(
    (tab: string) => {
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams]
  );
  const [accountTab, setAccountTab] = useState('users');

  const visibleTabs = useMemo(() => {
    const tabs: string[] = [];
    if (hasPermission('system', 'ai')) tabs.push('ai');
    if (hasPermission('system', 'account')) tabs.push('account');
    if (hasPermission('system', 'account')) tabs.push('holidays');
    if (hasPermission('system', 'audit_log')) tabs.push('audit');
    return tabs;
  }, [hasPermission]);

  const urlTab = searchParams.get('tab') || '';
  const mainTab = resolveTab(urlTab, visibleTabs);

  useEffect(() => {
    if (visibleTabs.length > 0 && urlTab !== mainTab) {
      setSearchParams({ tab: mainTab }, { replace: true });
    }
  }, [mainTab, setSearchParams, urlTab, visibleTabs]);

  // 用户数据
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [canLoginFilter, setCanLoginFilter] = useState<string>('');
  const [formCanLogin, setFormCanLogin] = useState(true);
  const [formStatus, setFormStatus] = useState<string>('ACTIVE');
  const [userValues, setUserValues] = useState<UserForm>(EMPTY_USER);
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});
  const setUserField = <K extends keyof UserForm>(k: K, v: UserForm[K]) => {
    setUserValues((p) => ({ ...p, [k]: v }));
    setUserErrors((p) => (p[k as string] ? { ...p, [k as string]: '' } : p));
  };

  // 行内编辑用户角色
  const [inlineRoleUserId, setInlineRoleUserId] = useState<string | null>(null);
  const [inlineRoleValue, setInlineRoleValue] = useState<string[]>([]);
  const [inlineRoleSaving, setInlineRoleSaving] = useState(false);

  // 角色数据
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleValues, setRoleValues] = useState<RoleForm>(EMPTY_ROLE);
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});
  const setRoleField = <K extends keyof RoleForm>(k: K, v: RoleForm[K]) => {
    setRoleValues((p) => ({ ...p, [k]: v }));
    setRoleErrors((p) => (p[k as string] ? { ...p, [k as string]: '' } : p));
  };

  // 删除确认
  const [confirm, setConfirm] = useState<{ title: string; content: string; onOk: () => void } | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params: Parameters<typeof usersApi.list>[0] = {};
      if (userSearchKeyword) params.keyword = userSearchKeyword;
      if (canLoginFilter) params.canLogin = canLoginFilter;
      const response = await usersApi.list(params);
      setUsers(response.data.data || []);
    } catch {
      toast.error('加载用户列表失败');
    } finally {
      setUsersLoading(false);
    }
  }, [canLoginFilter, userSearchKeyword]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const response = await rolesApi.list();
      setRoles(response.data);
    } catch {
      toast.error('加载角色列表失败');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      const response = await rolesApi.getPermissions();
      setPermissions(response.data);
    } catch (error) {
      console.error('加载权限列表失败', error);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'account') {
      loadRoles();
      loadPermissions();
    }
  }, [loadPermissions, loadRoles, mainTab]);

  useEffect(() => {
    if (mainTab === 'account') {
      loadUsers();
    }
  }, [loadUsers, mainTab]);

  const handleUserSearch = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setUserSearchKeyword(value);
      }, 300);
    };
  }, []);

  const handleOpenUserModal = (user?: User) => {
    setUserErrors({});
    if (user) {
      setEditingUser(user);
      setFormCanLogin(user.canLogin !== false);
      setFormStatus(user.status || 'ACTIVE');
      setUserValues({
        username: user.username || '',
        realName: user.realName,
        password: '',
        wecomUserId: user.wecomUserId || '',
        roleIds: user.roles || [],
      });
    } else {
      setEditingUser(null);
      setFormCanLogin(true);
      setFormStatus('ACTIVE');
      setUserValues(EMPTY_USER);
    }
    setUserModalVisible(true);
  };

  const handleSubmitUser = async () => {
    const e: Record<string, string> = {};
    if (!userValues.realName.trim()) e.realName = '请输入姓名';
    if (userValues.username && userValues.username.length < 2) e.username = '用户名长度不能少于2位';
    if (userValues.password && userValues.password.length < 6) e.password = '密码长度不能少于6位';
    if (userValues.roleIds.length === 0) e.roleIds = '请选择至少一个角色';
    setUserErrors(e);
    if (Object.keys(e).length) return;

    try {
      const roleIds =
        userValues.roleIds
          .map((roleName) => roles.find((r) => r.name === roleName)?.id)
          .filter(Boolean) || [];

      if (editingUser) {
        const updateData: Parameters<typeof usersApi.update>[1] = {
          realName: userValues.realName,
          wecomUserId: userValues.wecomUserId || null,
          canLogin: formCanLogin,
          status: formStatus,
          roleIds: roleIds as string[],
        };
        if (userValues.password) {
          updateData.password = userValues.password;
        }
        await usersApi.update(editingUser.id, updateData);
        toast.success('用户更新成功');
      } else {
        await usersApi.create({
          username: userValues.username,
          password: userValues.password,
          realName: userValues.realName,
          canLogin: formCanLogin,
          roleIds: roleIds as string[],
        });
        toast.success('用户创建成功');
      }

      setUserModalVisible(false);
      loadUsers();
    } catch (error) {
      console.error('提交失败', error);
    }
  };

  const handleDeleteUser = (user: User) => {
    setConfirm({
      title: '确认删除',
      content: `确定要删除用户"${user.realName}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await usersApi.delete(user.id);
          toast.success('删除成功');
          loadUsers();
        } catch {
          // 错误已由请求拦截器统一提示
        }
      },
    });
  };

  const handleOpenRoleModal = (role?: Role) => {
    setRoleErrors({});
    if (role) {
      setEditingRole(role);
      setRoleValues({
        name: role.name,
        description: role.description || '',
        permissionIds: role.permissions.map((p) => p.id),
      });
    } else {
      setEditingRole(null);
      setRoleValues(EMPTY_ROLE);
    }
    setRoleModalVisible(true);
  };

  const handleSubmitRole = async () => {
    const e: Record<string, string> = {};
    if (!roleValues.name.trim()) e.name = '请输入角色名称';
    else if (roleValues.name.length < 2) e.name = '角色名称长度不能少于2位';
    if (roleValues.permissionIds.length === 0) e.permissionIds = '请选择至少一个权限';
    setRoleErrors(e);
    if (Object.keys(e).length) return;

    try {
      const data = {
        name: roleValues.name,
        description: roleValues.description,
        permissionIds: roleValues.permissionIds,
      };
      if (editingRole) {
        await rolesApi.update(editingRole.id, data);
        toast.success('角色更新成功');
      } else {
        await rolesApi.create(data);
        toast.success('角色创建成功');
      }
      setRoleModalVisible(false);
      loadRoles();
    } catch (error) {
      console.error('提交失败', error);
    }
  };

  const handleDeleteRole = (role: Role) => {
    setConfirm({
      title: '确认删除',
      content: `确定要删除角色"${role.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await rolesApi.delete(role.id);
          toast.success('角色删除成功');
          loadRoles();
        } catch {
          toast.error('角色删除失败');
        }
      },
    });
  };

  const startInlineRoleEdit = (user: User) => {
    if (!hasPermission('user', 'update')) return;
    setInlineRoleUserId(user.id);
    setInlineRoleValue([...(user.roles || [])]);
  };

  const commitInlineRoleEdit = async (user: User) => {
    if (inlineRoleSaving) return;
    const original = [...(user.roles || [])].sort().join(',');
    const next = [...inlineRoleValue].sort().join(',');
    if (original === next) {
      setInlineRoleUserId(null);
      return;
    }
    const roleIds = inlineRoleValue
      .map((name) => roles.find((r) => r.name === name)?.id)
      .filter(Boolean) as string[];
    setInlineRoleSaving(true);
    try {
      await usersApi.update(user.id, { roleIds });
      toast.success('角色已更新');
      await loadUsers();
    } catch {
      toast.error('角色更新失败');
    } finally {
      setInlineRoleSaving(false);
      setInlineRoleUserId(null);
    }
  };

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach((perm) => {
      if (!groups[perm.resource]) groups[perm.resource] = [];
      groups[perm.resource].push(perm);
    });
    return groups;
  }, [permissions]);

  const togglePermission = (id: string) => {
    setRoleValues((p) => ({
      ...p,
      permissionIds: p.permissionIds.includes(id)
        ? p.permissionIds.filter((x) => x !== id)
        : [...p.permissionIds, id],
    }));
    setRoleErrors((p) => (p.permissionIds ? { ...p, permissionIds: '' } : p));
  };

  const roleColCount = 5;
  const userColCount = 7;

  return (
    <MainLayout>
      <TooltipProvider>
        {visibleTabs.length === 0 && (
          <div className="text-muted-foreground flex min-h-[40vh] flex-col items-center justify-center gap-2">
            <div className="text-base font-medium">权限不足</div>
            <div className="text-sm">您没有系统管理的访问权限</div>
          </div>
        )}
        {/* 一级分区已平铺到侧边栏（/admin?tab=*）；各分区内容各自成卡片，
            不再套外层 Card（避免与 AiManagement 自带卡片重复成层）。内容由 URL ?tab= 驱动。 */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          {hasPermission('system', 'ai') && (
            <TabsContent value="ai">
              <AiManagement />
            </TabsContent>
          )}

          {hasPermission('system', 'account') && (
            <TabsContent value="account">
                <Tabs value={accountTab} onValueChange={setAccountTab}>
                  <TabsList>
                    <TabsTrigger value="users">用户管理</TabsTrigger>
                    <TabsTrigger value="roles">角色管理</TabsTrigger>
                    <TabsTrigger value="wecom">企微配置</TabsTrigger>
                  </TabsList>

                  {/* 用户管理 */}
                  <TabsContent value="users" className="mt-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground mr-auto text-[13px]">共 {users.length} 个用户</span>
                      <Select value={canLoginFilter || ALL} onValueChange={(v) => setCanLoginFilter(v === ALL ? '' : v)}>
                        <SelectTrigger className="w-36" size="sm">
                          <SelectValue placeholder="全部" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>全部</SelectItem>
                          <SelectItem value="true">允许登录</SelectItem>
                          <SelectItem value="false">不可登录</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input className="w-60 pl-8" placeholder="搜索用户..." onChange={(e) => handleUserSearch(e.target.value)} />
                      </div>
                      {hasPermission('user', 'create') && (
                        <Button onClick={() => handleOpenUserModal()}>
                          <Plus className="size-4" />
                          新建用户
                        </Button>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-28">姓名</TableHead>
                            <TableHead className="w-36">用户名</TableHead>
                            <TableHead className="w-24">允许登录</TableHead>
                            <TableHead className="w-72">角色</TableHead>
                            <TableHead className="w-24">状态</TableHead>
                            <TableHead className="w-44">创建时间</TableHead>
                            <TableHead className="w-28 text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usersLoading ? (
                            <TableRow>
                              <TableCell colSpan={userColCount} className="h-24 text-center">
                                <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                              </TableCell>
                            </TableRow>
                          ) : users.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={userColCount} className="text-muted-foreground h-24 text-center">
                                暂无用户
                              </TableCell>
                            </TableRow>
                          ) : (
                            users.map((record) => {
                              const canEdit = hasPermission('user', 'update');
                              const statusCfg = USER_STATUS_MAP[record.status as keyof typeof USER_STATUS_MAP];
                              return (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.realName}</TableCell>
                                  <TableCell>{record.username || '-'}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={arcoBadgeClass(record.canLogin !== false ? 'green' : 'gray')}>
                                      {record.canLogin !== false ? '是' : '否'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {inlineRoleUserId === record.id ? (
                                      <InlineRoleEditor
                                        roles={roles}
                                        initialValue={inlineRoleValue}
                                        loading={inlineRoleSaving}
                                        onChange={setInlineRoleValue}
                                        onCommit={() => commitInlineRoleEdit(record)}
                                      />
                                    ) : (
                                      <div
                                        onClick={() => canEdit && startInlineRoleEdit(record)}
                                        className={cn('flex min-h-[22px] flex-wrap items-center gap-1 rounded px-1 py-0.5', canEdit && 'hover:bg-accent cursor-pointer')}
                                        title={canEdit ? '单击编辑角色' : undefined}
                                      >
                                        {(record.roles || []).map((role) => (
                                          <Badge key={role} variant="outline" className={arcoBadgeClass('blue')}>
                                            {role}
                                          </Badge>
                                        ))}
                                        {(record.roles || []).length === 0 && <span className="text-muted-foreground">-</span>}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {statusCfg && (
                                      <Badge variant="outline" className={arcoBadgeClass(statusCfg.color)}>
                                        {statusCfg.label}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-xs">
                                    {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-0.5">
                                      {hasPermission('user', 'update') && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="size-8" aria-label="编辑用户" onClick={() => handleOpenUserModal(record)}>
                                              <Pencil className="size-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>编辑</TooltipContent>
                                        </Tooltip>
                                      )}
                                      {hasPermission('user', 'delete') && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive size-8" aria-label="删除用户" onClick={() => handleDeleteUser(record)}>
                                              <Trash2 className="size-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>删除</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* 角色管理 */}
                  <TabsContent value="roles" className="mt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">共 {roles.length} 个角色</span>
                      {hasPermission('role', 'create') && (
                        <Button onClick={() => handleOpenRoleModal()}>
                          <Plus className="size-4" />
                          新建角色
                        </Button>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-48">角色名称</TableHead>
                            <TableHead className="w-72">描述</TableHead>
                            <TableHead>权限列表</TableHead>
                            <TableHead className="w-20">用户数</TableHead>
                            <TableHead className="w-28 text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rolesLoading ? (
                            <TableRow>
                              <TableCell colSpan={roleColCount} className="h-24 text-center">
                                <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                              </TableCell>
                            </TableRow>
                          ) : roles.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={roleColCount} className="text-muted-foreground h-24 text-center">
                                暂无角色
                              </TableCell>
                            </TableRow>
                          ) : (
                            roles.map((record) => {
                              const count = users.filter((u) => u.roles.includes(record.name)).length;
                              return (
                                <TableRow key={record.id}>
                                  <TableCell className="font-medium">{record.name}</TableCell>
                                  <TableCell className="text-muted-foreground">{record.description || '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {record.permissions.slice(0, 5).map((perm) => (
                                        <Badge key={perm.id} variant="outline" className={arcoBadgeClass('cyan')}>
                                          {PERMISSION_RESOURCE_MAP[perm.resource] || perm.resource}:
                                          {PERMISSION_ACTION_MAP[perm.action] || perm.action}
                                        </Badge>
                                      ))}
                                      {record.permissions.length > 5 && (
                                        <Badge variant="outline" className={arcoBadgeClass('default')}>
                                          +{record.permissions.length - 5}
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>{count}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-0.5">
                                      {hasPermission('role', 'update') && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="size-8" aria-label="编辑角色" onClick={() => handleOpenRoleModal(record)}>
                                              <Pencil className="size-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>编辑</TooltipContent>
                                        </Tooltip>
                                      )}
                                      {hasPermission('role', 'delete') && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive size-8" aria-label="删除角色" onClick={() => handleDeleteRole(record)}>
                                              <Trash2 className="size-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>删除</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* 企微配置 */}
                  <TabsContent value="wecom" className="mt-4">
                    <WecomManagement />
                  </TabsContent>
                </Tabs>
            </TabsContent>
          )}

          {hasPermission('system', 'account') && (
            <TabsContent value="holidays">
              <HolidayManagement />
            </TabsContent>
          )}

          {hasPermission('system', 'audit_log') && (
            <TabsContent value="audit">
              <AuditLogTab />
            </TabsContent>
          )}
        </Tabs>

        {/* 用户抽屉 */}
        <Sheet open={userModalVisible} onOpenChange={(o) => !o && setUserModalVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onInteractOutside={(e) => e.preventDefault()}>
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>{editingUser ? '编辑用户' : '新建用户'}</SheetTitle>
              <SheetDescription className="sr-only">用户账号信息</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <Field label="姓名" required error={userErrors.realName}>
                <Input
                  placeholder="请输入姓名"
                  value={userValues.realName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUserField('realName', v);
                    if (!editingUser && v) setUserField('username', generateUsername(v));
                  }}
                />
              </Field>

              <div className="flex gap-6">
                <Field label="允许登录">
                  <div className="flex h-9 items-center gap-2">
                    <Switch checked={formCanLogin} onCheckedChange={setFormCanLogin} />
                    <span className="text-muted-foreground text-[13px]">{formCanLogin ? '可登录' : '不可登录'}</span>
                  </div>
                </Field>
                <Field label="账号状态">
                  <div className="flex h-9 items-center gap-2">
                    <Switch checked={formStatus !== 'DISABLED'} onCheckedChange={(c) => setFormStatus(c ? 'ACTIVE' : 'DISABLED')} />
                    <span className="text-muted-foreground text-[13px]">{formStatus !== 'DISABLED' ? '启用' : '已禁用'}</span>
                  </div>
                </Field>
              </div>

              <Field
                label="用户名"
                error={userErrors.username}
                extra={!editingUser ? '根据姓名自动生成拼音，可手动修改' : '用户名创建后不可修改'}
              >
                <Input placeholder="请输入用户名" disabled={!!editingUser} value={userValues.username} onChange={(e) => setUserField('username', e.target.value)} />
              </Field>

              <Field label="密码" error={userErrors.password}>
                <Input type="password" placeholder="请输入密码" value={userValues.password} onChange={(e) => setUserField('password', e.target.value)} />
              </Field>

              <Field label="企微UserID" extra="关联企业微信账号，用于企微扫码登录">
                <Input placeholder="请输入企微UserID（选填）" value={userValues.wecomUserId} onChange={(e) => setUserField('wecomUserId', e.target.value)} />
              </Field>

              <Field label="角色" required error={userErrors.roleIds}>
                <MultiSelect
                  options={roles.map((r) => ({ value: r.name, label: r.name }))}
                  value={userValues.roleIds}
                  onChange={(ids) => setUserField('roleIds', ids)}
                  placeholder="请选择角色"
                />
              </Field>
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setUserModalVisible(false)}>
                取消
              </Button>
              <Button onClick={handleSubmitUser}>{editingUser ? '保存' : '创建'}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* 角色抽屉 */}
        <Sheet open={roleModalVisible} onOpenChange={(o) => !o && setRoleModalVisible(false)}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[700px]" onInteractOutside={(e) => e.preventDefault()}>
            <SheetHeader className="border-b px-6 py-4">
              <SheetTitle>{editingRole ? '编辑角色' : '新建角色'}</SheetTitle>
              <SheetDescription className="sr-only">角色与权限配置</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <Field label="角色名称" required error={roleErrors.name}>
                <Input placeholder="请输入角色名称" value={roleValues.name} onChange={(e) => setRoleField('name', e.target.value)} />
              </Field>

              <Field label="角色描述">
                <Textarea placeholder="请输入角色描述" rows={3} value={roleValues.description} onChange={(e) => setRoleField('description', e.target.value)} />
              </Field>

              <Field label="权限配置" required error={roleErrors.permissionIds}>
                <div className="space-y-4">
                  {Object.entries(groupedPermissions).map(([resource, perms]) => (
                    <div key={resource} className="border-b pb-3 last:border-b-0">
                      <div className="mb-2 text-sm font-medium">{PERMISSION_RESOURCE_MAP[resource] || resource}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {perms.map((perm) => (
                          <label key={perm.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox checked={roleValues.permissionIds.includes(perm.id)} onCheckedChange={() => togglePermission(perm.id)} />
                            <span>
                              {PERMISSION_ACTION_MAP[perm.action] || perm.action}
                              {perm.description ? `（${perm.description}）` : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
            </div>
            <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setRoleModalVisible(false)}>
                取消
              </Button>
              <Button onClick={handleSubmitRole}>{editingRole ? '保存' : '创建'}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* 删除确认 */}
        <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm?.content}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  confirm?.onOk();
                  setConfirm(null);
                }}
              >
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </MainLayout>
  );
};

export default AdminPage;
