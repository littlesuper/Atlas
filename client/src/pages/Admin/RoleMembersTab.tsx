import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Select,
  Message,
  Spin,
  Typography,
} from '@arco-design/web-react';
import {
  IconPlus,
  IconDelete,
} from '@arco-design/web-react/icon';
import { roleMembersApi, usersApi, rolesApi } from '../../api';
import { RoleMember, User, Role } from '../../types';

const { Text } = Typography;

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
      const members = (membersRes as any)?.data || membersRes;
      setRoleMembers(Array.isArray(members) ? members : []);
      setRoles(Array.isArray(rolesRes) ? rolesRes : []);
    } catch {
      Message.error('加载角色成员失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersApi.list({ pageSize: 1000 });
      setUsers((res as any)?.data || res.data || []);
    } catch {
      Message.error('加载用户列表失败');
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
      Message.success('添加成功');
      setAddModalVisible(null);
      setSelectedUserIds([]);
      loadData();
    } catch {
      Message.error('添加失败');
    }
  };

  const handleRemoveMember = async () => {
    if (!deleteModalVisible) return;
    try {
      await roleMembersApi.delete(deleteModalVisible.id, {
        cascadeMode,
      });
      Message.success('移除成功');
      setDeleteModalVisible(null);
      setCascadeMode('keep');
      loadData();
    } catch {
      Message.error('移除失败');
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

  if (loading && roleMembers.length === 0) {
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  }

  return (
    <div>
      {groupedByRole.map(({ role, members }) => (
        <div key={role.id} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text bold style={{ fontSize: 14 }}>
              {role.name} ({members.length} 人)
            </Text>
            <Space>
              <Button
                size="small"
                type="text"
                icon={<IconPlus />}
                onClick={() => { setAddModalVisible(role.id); setSelectedUserIds([]); }}
              >
                添加成员
              </Button>
            </Space>
          </div>
          <Table
            size="small"
            border={false}
            data={members}
            pagination={false}
            columns={[
              {
                title: '排序',
                dataIndex: 'sortOrder',
                width: 60,
                render: (val: number, _: RoleMember, idx: number) => (
                  idx === 0 ? <Tag color="blue" size="small">主负责人</Tag> : val
                ),
              },
              {
                title: '姓名',
                dataIndex: 'user',
                render: (user: any) => (
                  <span>
                    {user.realName}
                    {user.canLogin === false && (
                      <Tag size="small" style={{ marginLeft: 4 }} color="orange">仅联系人</Tag>
                    )}
                  </span>
                ),
              },
              {
                title: '操作',
                width: 60,
                render: (_: unknown, record: RoleMember) => (
                  <Button
                    size="small"
                    type="text"
                    status="danger"
                    icon={<IconDelete />}
                    onClick={() => setDeleteModalVisible(record)}
                  />
                ),
              },
            ]}
          />
        </div>
      ))}

      {groupedByRole.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-3)' }}>
          暂无角色成员配置。请先添加角色成员。
        </div>
      )}

      <Modal
        title="添加成员"
        visible={!!addModalVisible}
        onOk={handleAddMembers}
        onCancel={() => setAddModalVisible(null)}
        okButtonProps={{ disabled: selectedUserIds.length === 0 }}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="选择要添加的用户"
          value={selectedUserIds}
          onChange={setSelectedUserIds}
          showSearch
          filterOption={(input, option) =>
            (option?.props?.children as string)?.toLowerCase().includes(input.toLowerCase())
          }
        >
          {users
            .filter(u => u.status === 'ACTIVE')
            .filter(u => !existingUserIds.has(u.id))
            .map(u => (
              <Select.Option key={u.id} value={u.id}>
                {u.realName}{u.username ? ` (${u.username})` : ''}{!u.canLogin ? ' [仅联系人]' : ''}
              </Select.Option>
            ))}
        </Select>
      </Modal>

      <Modal
        title={`确认从「${deleteModalVisible?.role?.name || ''}」角色移除 ${deleteModalVisible?.user?.realName || ''}?`}
        visible={!!deleteModalVisible}
        onOk={handleRemoveMember}
        onCancel={() => { setDeleteModalVisible(null); setCascadeMode('keep'); }}
        okText="确认移除"
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8 }}>是否同时从进行中的活动中移除该执行人？</p>
          <Space direction="vertical">
            <label>
              <input
                type="radio"
                name="cascade"
                checked={cascadeMode === 'keep'}
                onChange={() => setCascadeMode('keep')}
              />
              <span style={{ marginLeft: 4 }}>仅停止以后的自动指派</span>
            </label>
            <label>
              <input
                type="radio"
                name="cascade"
                checked={cascadeMode === 'removeAll'}
                onChange={() => setCascadeMode('removeAll')}
              />
              <span style={{ marginLeft: 4 }}>全部移除（离职场景常用）</span>
            </label>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default RoleMembersTab;
