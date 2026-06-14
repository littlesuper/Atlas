import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { roleMembersApi, usersApi, rolesApi } from '../../api';
import { RoleMember, User, Role } from '../../types';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelect, type SelectOption } from '@/components/ui/multi-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const RoleMembersTab: React.FC = () => {
  const [roleMembers, setRoleMembers] = useState<RoleMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState<RoleMember | null>(null);
  const [cascadeMode, setCascadeMode] = useState<'keep' | 'removeAll' | 'selective'>('keep');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, rolesRes] = await Promise.all([
        roleMembersApi.list(),
        rolesApi.list(),
      ]);
      setRoleMembers(membersRes.data.data || []);
      setRoles(rolesRes.data || []);
    } catch {
      toast.error('加载角色成员失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersApi.list({ pageSize: 1000 });
      setUsers(res.data.data || []);
    } catch {
      toast.error('加载用户列表失败');
    }
  }, []);

  useEffect(() => {
    loadData();
    loadUsers();
  }, [loadData, loadUsers]);

  const groupedByRole = React.useMemo(() => {
    const map = new Map<string, { role: Role; members: RoleMember[] }>();
    for (const role of roles) {
      map.set(role.id, { role, members: [] });
    }
    for (const member of roleMembers) {
      if (!member.isActive) continue;
      const group = map.get(member.roleId);
      if (group) group.members.push(member);
    }
    return Array.from(map.values()).filter(g => g.members.length > 0);
  }, [roleMembers, roles]);

  const handleAddMembers = async () => {
    if (!addModalVisible || selectedUserIds.length === 0) return;
    try {
      await roleMembersApi.batchSet({
        roleId: addModalVisible,
        members: selectedUserIds.map((userId, idx) => ({ userId, sortOrder: idx })),
      });
      toast.success('添加成功');
      setAddModalVisible(null);
      setSelectedUserIds([]);
      loadData();
    } catch {
      toast.error('添加失败');
    }
  };

  const handleRemoveMember = async () => {
    if (!deleteModalVisible) return;
    try {
      await roleMembersApi.delete(deleteModalVisible.id, {
        cascadeMode,
      });
      toast.success('移除成功');
      setDeleteModalVisible(null);
      setCascadeMode('keep');
      loadData();
    } catch {
      toast.error('移除失败');
    }
  };

  const existingUserIds = React.useMemo(() => {
    if (!addModalVisible) return new Set<string>();
    return new Set(
      roleMembers
        .filter(m => m.roleId === addModalVisible && m.isActive)
        .map(m => m.userId)
    );
  }, [addModalVisible, roleMembers]);

  const addUserOptions: SelectOption[] = React.useMemo(
    () =>
      users
        .filter(u => u.status === 'ACTIVE')
        .filter(u => !existingUserIds.has(u.id))
        .map(u => ({
          value: u.id,
          label: `${u.realName}${u.username ? ` (${u.username})` : ''}${!u.canLogin ? ' [仅联系人]' : ''}`,
        })),
    [users, existingUserIds]
  );

  if (loading && roleMembers.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        {groupedByRole.map(({ role, members }) => (
          <div key={role.id} className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold">
                {role.name} ({members.length} 人)
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setAddModalVisible(role.id); setSelectedUserIds([]); }}
              >
                <Plus className="size-4" />
                添加成员
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">排序</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((record, idx) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {idx === 0 ? (
                          <Badge variant="outline" className={arcoBadgeClass('blue')}>
                            主负责人
                          </Badge>
                        ) : (
                          record.sortOrder
                        )}
                      </TableCell>
                      <TableCell>
                        <span>
                          {record.user.realName}
                          {record.user.canLogin === false && (
                            <Badge variant="outline" className={cn('ml-1', arcoBadgeClass('orange'))}>
                              仅联系人
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive size-8"
                              aria-label="移除成员"
                              onClick={() => setDeleteModalVisible(record)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>移除成员</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {groupedByRole.length === 0 && (
          <div className="text-muted-foreground py-10 text-center">
            暂无角色成员配置。请先添加角色成员。
          </div>
        )}

        {/* 添加成员 */}
        <Dialog open={!!addModalVisible} onOpenChange={(o) => !o && setAddModalVisible(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加成员</DialogTitle>
            </DialogHeader>
            <MultiSelect
              options={addUserOptions}
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              placeholder="选择要添加的用户"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddModalVisible(null)}>
                取消
              </Button>
              <Button onClick={handleAddMembers} disabled={selectedUserIds.length === 0}>
                确定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 移除成员确认 */}
        <AlertDialog
          open={!!deleteModalVisible}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteModalVisible(null);
              setCascadeMode('keep');
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {`确认从「${deleteModalVisible?.role?.name || ''}」角色移除 ${deleteModalVisible?.user?.realName || ''}?`}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div>
              <p className="mb-2 text-sm">是否同时从进行中的活动中移除该执行人？</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cascade"
                    checked={cascadeMode === 'keep'}
                    onChange={() => setCascadeMode('keep')}
                  />
                  <span>仅停止以后的自动指派</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cascade"
                    checked={cascadeMode === 'removeAll'}
                    onChange={() => setCascadeMode('removeAll')}
                  />
                  <span>全部移除（离职场景常用）</span>
                </label>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => { setDeleteModalVisible(null); setCascadeMode('keep'); }}
              >
                取消
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleRemoveMember}>
                确认移除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default RoleMembersTab;
