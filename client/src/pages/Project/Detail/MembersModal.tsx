import React, { useState } from 'react';
import { Modal, Input, Tag } from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import { User } from '../../../types';

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

  return (
    <Modal
      title="管理协作者"
      visible={visible}
      onCancel={onCancel}
      onOk={() => onOk(pendingMemberIds)}
      okText="确定"
      cancelText="取消"
      confirmLoading={loading}
      style={{ maxWidth: 480 }}
    >
      {/* 已选成员标签 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>
          当前协作者（{pendingMemberIds.length} 人）
        </div>
        {pendingMemberIds.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pendingMemberIds.map((uid) => {
              const u = users.find((u) => u.id === uid);
              return (
                <Tag
                  key={uid}
                  closable
                  onClose={() => setPendingMemberIds(pendingMemberIds.filter((id) => id !== uid))}
                  style={{ margin: 0 }}
                >
                  {u?.realName || uid}
                </Tag>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-4)' }}>暂无协作者，从下方搜索添加</div>
        )}
      </div>

      {/* 搜索添加 */}
      <div>
        <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 8 }}>添加成员</div>
        <Input
          placeholder="搜索姓名或用户名..."
          allowClear
          value={memberSearch}
          onChange={setMemberSearch}
          style={{ marginBottom: 8 }}
        />
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {users
            .filter((u) => u.id !== managerId && !pendingMemberIds.includes(u.id))
            .filter((u) => {
              if (!memberSearch) return true;
              const kw = memberSearch.toLowerCase();
              return u.realName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
            })
            .map((u) => (
              <div
                key={u.id}
                onClick={() => { setPendingMemberIds([...pendingMemberIds, u.id]); setMemberSearch(''); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-fill-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>{u.realName}</span>
                  {u.username && <span style={{ color: 'var(--color-text-3)', marginLeft: 6, fontSize: 13 }}>{u.username}</span>}
                </span>
                <IconPlus style={{ color: 'var(--color-text-3)', fontSize: 12 }} />
              </div>
            ))}
          {users.filter((u) => u.id !== managerId && !pendingMemberIds.includes(u.id)).filter((u) => {
            if (!memberSearch) return true;
            const kw = memberSearch.toLowerCase();
            return u.realName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw);
          }).length === 0 && (
            <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--color-text-4)', fontSize: 13 }}>
              {memberSearch ? '无匹配用户' : '所有用户已添加'}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MembersModal;
