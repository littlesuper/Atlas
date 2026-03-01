import React, { useState, useEffect } from 'react';
import {
  Button,
  Tag,
  Empty,
  Message,
  Modal,
  Input,
  Spin,
} from '@arco-design/web-react';
import { IconPlus, IconEye } from '@arco-design/web-react/icon';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../../../api';
import { useAuthStore } from '../../../store/authStore';
import dayjs from 'dayjs';

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

  const load = async () => {
    setLoading(true);
    try {
      const res = await projectsApi.listProjectArchives(projectId);
      setSnapshots(res.data || []);
    } catch {
      Message.error('加载快照列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await projectsApi.createSnapshot(projectId, remark || undefined);
      Message.success('快照创建成功');
      setCreateModalVisible(false);
      setRemark('');
      load();
    } catch {
      Message.error('创建快照失败');
    } finally {
      setCreating(false);
    }
  };

  const canManage = hasPermission('project', 'update') && isProjectManager(managerId ?? '', projectId);

  if (loading && snapshots.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
          共 {snapshots.length} 个快照
        </span>
        {canManage && (
          <Button type="primary" icon={<IconPlus />} onClick={() => setCreateModalVisible(true)}>
            创建快照
          </Button>
        )}
      </div>

      {/* 快照列表 */}
      {snapshots.length === 0 ? (
        <Empty description="暂无快照，点击「创建快照」保存项目当前状态" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {snapshots.map((s, index) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 20px',
                background: index % 2 === 0 ? 'var(--color-fill-1)' : 'transparent',
                borderRadius: 6,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-fill-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = index % 2 === 0 ? 'var(--color-fill-1)' : 'transparent'; }}
            >
              {/* 序号 */}
              <span style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--color-fill-3)',
                color: 'var(--color-text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {snapshots.length - index}
              </span>

              {/* 时间 */}
              <span style={{ marginLeft: 16, fontSize: 14, fontWeight: 500, color: 'var(--color-text-1)', minWidth: 160 }}>
                {dayjs(s.archivedAt).format('YYYY-MM-DD HH:mm')}
              </span>

              {/* 创建人 */}
              <Tag size="small" color="gray" style={{ marginLeft: 12 }}>
                {s.creator?.realName || '-'}
              </Tag>

              {/* 备注 */}
              <div style={{ flex: 1, marginLeft: 12 }}>
                {s.remark && (
                  <span style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
                    {s.remark}
                  </span>
                )}
              </div>

              {/* 操作 */}
              <Button
                type="text"
                icon={<IconEye />}
                size="small"
                onClick={() => navigate(`/projects/${projectId}/snapshot/${s.id}`)}
                style={{ flexShrink: 0 }}
              >
                查看
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 创建快照弹窗 */}
      <Modal
        title="创建项目快照"
        visible={createModalVisible}
        onCancel={() => { setCreateModalVisible(false); setRemark(''); }}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="创建"
      >
        <p style={{ color: 'var(--color-text-2)', marginBottom: 12 }}>
          快照将保存项目当前的所有数据（活动、产品、周报、风险评估），不会影响项目正常使用。
        </p>
        <Input.TextArea
          placeholder="备注（可选），例如：EVT阶段完成、里程碑M2达成..."
          value={remark}
          onChange={setRemark}
          maxLength={200}
          showWordLimit
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </Modal>
    </div>
  );
};

export default SnapshotsTab;
