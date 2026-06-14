import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { projectsApi } from '../../../api';
import { useAuthStore } from '../../../store/authStore';
import { arcoBadgeClass } from '../../../utils/badgeColor';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SnapshotsTabProps {
  projectId: string;
  managerId?: string;
  isArchived?: boolean;
}

interface SnapshotMeta {
  id: string;
  archivedBy: string;
  archivedAt: string;
  remark?: string;
  creator?: { id: string; realName: string; username: string };
}

const SnapshotsTab: React.FC<SnapshotsTabProps> = ({ projectId, managerId }) => {
  const navigate = useNavigate();
  const { hasPermission, isProjectManager } = useAuthStore();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [remark, setRemark] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await projectsApi.listProjectArchives(projectId);
      setSnapshots(res.data || []);
    } catch {
      toast.error('加载快照列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await projectsApi.createSnapshot(projectId, remark || undefined);
      toast.success('快照创建成功');
      setCreateModalVisible(false);
      setRemark('');
      load();
    } catch {
      toast.error('创建快照失败');
    } finally {
      setCreating(false);
    }
  };

  const canManage = hasPermission('project', 'update') && isProjectManager(managerId ?? '', projectId);

  if (loading && snapshots.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        {/* 头部 */}
        <div className="mb-5 flex items-center justify-between">
          <span className="text-muted-foreground text-[13px]">共 {snapshots.length} 个快照</span>
          {canManage && (
            <Button onClick={() => setCreateModalVisible(true)}>
              <Plus className="size-4" />
              创建快照
            </Button>
          )}
        </div>

        {/* 快照列表 */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-48">时间</TableHead>
                <TableHead className="w-28">创建人</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-20 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : snapshots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                    暂无快照，点击「创建快照」保存项目当前状态
                  </TableCell>
                </TableRow>
              ) : (
                snapshots.map((s, index) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{snapshots.length - index}</TableCell>
                    <TableCell className="font-medium">{dayjs(s.archivedAt).format('YYYY-MM-DD HH:mm')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={arcoBadgeClass('gray')}>
                        {s.creator?.realName || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.remark || ''}</TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="查看"
                            onClick={() => navigate(`/projects/${projectId}/snapshot/${s.id}`)}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>查看</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 创建快照弹窗 */}
        <Dialog
          open={createModalVisible}
          onOpenChange={(o) => {
            if (!o) {
              setCreateModalVisible(false);
              setRemark('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建项目快照</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              快照将保存项目当前的所有数据（活动、产品、周报、风险评估），不会影响项目正常使用。
            </p>
            <div className="space-y-1">
              <Textarea
                placeholder="备注（可选），例如：EVT阶段完成、里程碑M2达成..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                maxLength={200}
                rows={3}
              />
              <div className="text-muted-foreground text-right text-xs">{remark.length}/200</div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateModalVisible(false);
                  setRemark('');
                }}
              >
                取消
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default SnapshotsTab;
