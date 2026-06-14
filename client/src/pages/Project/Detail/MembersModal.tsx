import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { User } from '../../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface MembersModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: (memberIds: string[]) => Promise<void>;
  loading: boolean;
  users: User[];
  initialMemberIds: string[];
  managerId?: string;
}

const MembersModal: React.FC<MembersModalProps> = ({
  visible,
  onCancel,
  onOk,
  loading,
  users,
  initialMemberIds,
  managerId,
}) => {
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>(initialMemberIds);
  const [memberSearch, setMemberSearch] = useState('');

  // Reset when modal opens
  React.useEffect(() => {
    if (visible) {
      setPendingMemberIds(initialMemberIds);
      setMemberSearch('');
    }
  }, [visible, initialMemberIds]);

  const candidates = users
    .filter((u) => u.id !== managerId && !pendingMemberIds.includes(u.id))
    .filter((u) => {
      if (!memberSearch) return true;
      const kw = memberSearch.toLowerCase();
      return u.realName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
    });

  return (
    <Dialog
      open={visible}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>管理协作者</DialogTitle>
        </DialogHeader>

        {/* 已选成员标签 */}
        <div className="mb-2">
          <div className="text-muted-foreground mb-2 text-[13px]">当前协作者（{pendingMemberIds.length} 人）</div>
          {pendingMemberIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {pendingMemberIds.map((uid) => {
                const u = users.find((u) => u.id === uid);
                return (
                  <Badge key={uid} variant="secondary" className="gap-1">
                    {u?.realName || uid}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`移除 ${u?.realName || uid}`}
                      className="hover:text-destructive cursor-pointer"
                      onClick={() => setPendingMemberIds(pendingMemberIds.filter((id) => id !== uid))}
                    >
                      ×
                    </span>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground text-[13px]">暂无协作者，从下方搜索添加</div>
          )}
        </div>

        {/* 搜索添加 */}
        <div>
          <div className="text-muted-foreground mb-2 text-[13px]">添加成员</div>
          <Input
            placeholder="搜索姓名或用户名..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="mb-2"
          />
          <div className="max-h-[220px] overflow-y-auto">
            {candidates.map((u) => (
              <div
                key={u.id}
                onClick={() => {
                  setPendingMemberIds([...pendingMemberIds, u.id]);
                  setMemberSearch('');
                }}
                className="hover:bg-accent flex cursor-pointer items-center justify-between rounded-md px-2 py-[7px] transition-colors"
              >
                <span>
                  <span className="font-medium">{u.realName}</span>
                  {u.username && <span className="text-muted-foreground ml-1.5 text-[13px]">{u.username}</span>}
                </span>
                <Plus className="text-muted-foreground size-3" />
              </div>
            ))}
            {candidates.length === 0 && (
              <div className="text-muted-foreground py-3 text-center text-[13px]">
                {memberSearch ? '无匹配用户' : '所有用户已添加'}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button onClick={() => onOk(pendingMemberIds)} disabled={loading}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MembersModal;
