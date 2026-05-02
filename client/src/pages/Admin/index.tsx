import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Modal,
  Drawer,
  Form,
  Select,
  Message,
  Tooltip,
  Checkbox,
  Divider,
  Switch,
} from '@arco-design/web-react';
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconDelete,
} from '@arco-design/web-react/icon';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import { usersApi, rolesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { User, Role, Permission } from '../../types';
import { USER_STATUS_MAP, PERMISSION_RESOURCE_MAP, PERMISSION_ACTION_MAP } from '../../utils/constants';
import AiManagement from './AiManagement';
import AuditLogTab from './AuditLog';
import WecomManagement from './WecomManagement';
import HolidayManagement from './HolidayManagement';
import RoleMembersTab from './RoleMembersTab';
import { FEATURE_FLAGS } from '../../featureFlags/flags';
import { useFeatureFlag } from '../../featureFlags/FeatureFlagProvider';
import dayjs from 'dayjs';
import { pinyin } from 'pinyin-pro';

// 内联角色编辑器：挂载后强制展开下拉，外部点击触发提交
interface InlineRoleEditorProps {
  roles: Role[];
  initialValue: string[];
  loading: boolean;
  onChange: (value: string[]) => void;
  onCommit: () => void;
}
const InlineRoleEditor: React.FC<InlineRoleEditorProps> = ({ roles, initialValue, loading, onChange, onCommit }) => {
  const [popupVisible, setPopupVisible] = React.useState(false);
  const [value, setValue] = React.useState<string[]>(initialValue);

  // 挂载后下一帧强制展开（避开 React 同步事件循环导致的关闭）
  React.useEffect(() => {
    const t = setTimeout(() => setPopupVisible(true), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <Select
      size="small"
      mode="multiple"
      showSearch
      allowClear
      popupVisible={popupVisible}
      onVisibleChange={(v) => {
        setPopupVisible(v);
        if (!v) onCommit();
      }}
      filterOption={(input, option) => {
        const label = String(option?.props?.value ?? '');
        return label.toLowerCase().includes(input.toLowerCase());
      }}
      value={value}
      onChange={(v) => {
        const arr = v as string[];
        setValue(arr);
        onChange(arr);
      }}
      loading={loading}
      disabled={loading}
      style={{ width: '100%' }}
      placeholder="搜索或选择角色"
    >
      {roles.map((r) => (
        <Select.Option key={r.id} value={r.name}>
          {r.name}
        </Select.Option>
      ))}
    </Select>
  );
};

const AdminPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const aiAssistanceEnabled = useFeatureFlag(FEATURE_FLAGS.AI_ASSISTANCE);
  const wecomLoginEnabled = useFeatureFlag(FEATURE_FLAGS.WECOM_LOGIN);
  const holidayManagementEnabled = useFeatureFlag(FEATURE_FLAGS.HOLIDAY_MANAGEMENT);
  const [userForm] = Form.useForm();
  const [roleForm] = Form.useForm();

  // Tab状态（从 URL 读取，刷新后保持）
  const [searchParams, setSearchParams] = useSearchParams();
  const setMainTab = useCallback((tab: string) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const [accountTab, setAccountTab] = useState('users');

  // 计算可见 Tab 列表，自动回退到第一个有权限的 Tab
  const visibleTabs = useMemo(() => {
    const tabs: string[] = [];
    if (aiAssistanceEnabled && hasPermission('system', 'ai')) tabs.push('ai');
    if (hasPermission('system', 'account')) tabs.push('account');
    if (holidayManagementEnabled && hasPermission('system', 'account')) tabs.push('holidays');
    if (hasPermission('system', 'audit_log')) tabs.push('audit');
    return tabs;
  }, [aiAssistanceEnabled, hasPermission, holidayManagementEnabled]);

  const urlTab = searchParams.get('tab') || '';
  const mainTab = visibleTabs.includes(urlTab) ? urlTab : (visibleTabs[0] || 'ai');

  // URL 上的 tab 不在可见列表中时，自动纠正 URL
  useEffect(() => {
    if (visibleTabs.length > 0 && urlTab !== mainTab) {
      setSearchParams({ tab: mainTab }, { replace: true });
    }
  }, [mainTab, setSearchParams, urlTab, visibleTabs]);

  useEffect(() => {
    if (!wecomLoginEnabled && accountTab === 'wecom') {
      setAccountTab('users');
    }
  }, [accountTab, wecomLoginEnabled]);

  // 用户数据
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [canLoginFilter, setCanLoginFilter] = useState<string>('');
  // 控制表单中「允许登录」和「状态」开关
  const [formCanLogin, setFormCanLogin] = useState(true);
  const [formStatus, setFormStatus] = useState<string>('ACTIVE');

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

  // 加载用户列表
  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const params: any = {};
      if (userSearchKeyword) params.keyword = userSearchKeyword;
      if (canLoginFilter) params.canLogin = canLoginFilter;
      const response = await usersApi.list(params);
      setUsers(response.data.data || []);
    } catch {
      Message.error('加载用户列表失败');
    } finally {
      setUsersLoading(false);
    }
  };

  // 加载角色列表
  const loadRoles = async () => {
    setRolesLoading(true);
    try {
      const response = await rolesApi.list();
      setRoles(response.data);
    } catch {
      Message.error('加载角色列表失败');
    } finally {
      setRolesLoading(false);
    }
  };

  // 加载权限列表
  const loadPermissions = async () => {
    try {
      const response = await rolesApi.getPermissions();
      setPermissions(response.data);
    } catch (error) {
      console.error('加载权限列表失败', error);
    }
  };

  useEffect(() => {
    if (mainTab === 'account') {
      loadUsers();
      loadRoles();
      loadPermissions();
    }
  }, [mainTab]);

  useEffect(() => {
    if (mainTab === 'account') {
      loadUsers();
    }
  }, [userSearchKeyword, canLoginFilter]);

  // 处理搜索
  const handleUserSearch = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setUserSearchKeyword(value);
      }, 300);
    };
  }, []);

  // 打开用户Modal
  const handleOpenUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormCanLogin(user.canLogin !== false);
      setFormStatus(user.status || 'ACTIVE');
      userForm.setFieldsValue({
        username: user.username,
        realName: user.realName,
        wecomUserId: user.wecomUserId,
        roleIds: user.roles || [],
      });
    } else {
      setEditingUser(null);
      setFormCanLogin(true);
      setFormStatus('ACTIVE');
      userForm.resetFields();
    }
    setUserModalVisible(true);
  };

  // 提交用户表单
  const handleSubmitUser = async () => {
    try {
      const values = await userForm.validate();

      // 获取角色ID列表
      const roleIds = values.roleIds?.map((roleName: string) => {
        const role = roles.find((r) => r.name === roleName);
        return role?.id;
      }).filter(Boolean) || [];

      if (editingUser) {
        const updateData: any = {
          realName: values.realName,
          wecomUserId: values.wecomUserId || null,
          canLogin: formCanLogin,
          status: formStatus,
          roleIds,
        };

        if (values.password) {
          updateData.password = values.password;
        }

        await usersApi.update(editingUser.id, updateData);
        Message.success('用户更新成功');
      } else {
        await usersApi.create({
          username: values.username,
          password: values.password,
          realName: values.realName,
          canLogin: formCanLogin,
          roleIds,
        });
        Message.success('用户创建成功');
      }

      setUserModalVisible(false);
      loadUsers();
    } catch (error) {
      console.error('提交失败', error);
    }
  };

  // 删除用户
  const handleDeleteUser = (user: User) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除用户"${user.realName}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await usersApi.delete(user.id);
          Message.success('删除成功');
          loadUsers();
        } catch {
          // 错误已由请求拦截器统一提示
        }
      },
    });
  };

  // 打开角色Modal
  const handleOpenRoleModal = (role?: Role) => {
    if (role) {
      setEditingRole(role);
      roleForm.setFieldsValue({
        name: role.name,
        description: role.description,
        permissionIds: role.permissions.map((p) => p.id),
      });
    } else {
      setEditingRole(null);
      roleForm.resetFields();
    }
    setRoleModalVisible(true);
  };

  // 提交角色表单
  const handleSubmitRole = async () => {
    try {
      const values = await roleForm.validate();
      const data = {
        name: values.name,
        description: values.description,
        permissionIds: values.permissionIds || [],
      };

      if (editingRole) {
        await rolesApi.update(editingRole.id, data);
        Message.success('角色更新成功');
      } else {
        await rolesApi.create(data);
        Message.success('角色创建成功');
      }

      setRoleModalVisible(false);
      loadRoles();
    } catch (error) {
      console.error('提交失败', error);
    }
  };

  // 删除角色
  const handleDeleteRole = (role: Role) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除角色"${role.name}"吗？此操作不可恢复。`,
      onOk: async () => {
        try {
          await rolesApi.delete(role.id);
          Message.success('角色删除成功');
          loadRoles();
        } catch {
          Message.error('角色删除失败');
        }
      },
    });
  };

  // 进入行内编辑
  const startInlineRoleEdit = (user: User) => {
    if (!hasPermission('user', 'update')) return;
    setInlineRoleUserId(user.id);
    setInlineRoleValue([...(user.roles || [])]);
  };

  // 提交行内编辑
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
      Message.success('角色已更新');
      await loadUsers();
    } catch {
      Message.error('角色更新失败');
    } finally {
      setInlineRoleSaving(false);
      setInlineRoleUserId(null);
    }
  };

  // 用户表格列配置
  const userColumns = [
    {
      title: '姓名',
      dataIndex: 'realName',
      width: 120,
      sorter: (a: User, b: User) => (a.realName || '').localeCompare(b.realName || ''),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 150,
      sorter: (a: User, b: User) => (a.username || '').localeCompare(b.username || ''),
      render: (username?: string) => username || '-',
    },
    {
      title: '允许登录',
      dataIndex: 'canLogin',
      width: 100,
      render: (canLogin: boolean) => (
        <Tag color={canLogin !== false ? 'green' : 'gray'}>
          {canLogin !== false ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 280,
      render: (userRoles: string[], record: User) => {
        const canEdit = hasPermission('user', 'update');
        if (inlineRoleUserId === record.id) {
          return (
            <InlineRoleEditor
              roles={roles}
              initialValue={inlineRoleValue}
              loading={inlineRoleSaving}
              onChange={setInlineRoleValue}
              onCommit={() => commitInlineRoleEdit(record)}
            />
          );
        }
        return (
          <div
            onClick={() => canEdit && startInlineRoleEdit(record)}
            style={{
              cursor: canEdit ? 'pointer' : 'default',
              minHeight: 22,
              padding: '2px 4px',
              borderRadius: 4,
            }}
            title={canEdit ? '单击编辑角色' : undefined}
          >
            <Space wrap>
              {userRoles.map((role) => (
                <Tag key={role} color="blue">
                  {role}
                </Tag>
              ))}
              {userRoles.length === 0 && (
                <span style={{ color: 'var(--color-text-4)' }}>-</span>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      sorter: (a: User, b: User) => a.status.localeCompare(b.status),
      render: (status: string) => {
        const config = USER_STATUS_MAP[status as keyof typeof USER_STATUS_MAP];
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      sorter: (a: User, b: User) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: User) => (
        <Space>
          {hasPermission('user', 'update') && (
            <Tooltip content="编辑">
              <Button
                type="text"
                icon={<IconEdit />}
                size="small"
                onClick={() => handleOpenUserModal(record)}
              />
            </Tooltip>
          )}
          {hasPermission('user', 'delete') && (
            <Tooltip content="删除">
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                size="small"
                onClick={() => handleDeleteUser(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // 角色表格列配置
  const roleColumns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      width: 200,
      sorter: (a: Role, b: Role) => a.name.localeCompare(b.name),
      render: (name: string) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 300,
      render: (desc?: string) => desc || '-',
    },
    {
      title: '权限列表',
      dataIndex: 'permissions',
      render: (permissions: Permission[]) => (
        <Space wrap>
          {permissions.slice(0, 5).map((perm) => (
            <Tag key={perm.id} color="cyan">
              {PERMISSION_RESOURCE_MAP[perm.resource] || perm.resource}:{PERMISSION_ACTION_MAP[perm.action] || perm.action}
            </Tag>
          ))}
          {permissions.length > 5 && <Tag>+{permissions.length - 5}</Tag>}
        </Space>
      ),
    },
    {
      title: '用户数',
      width: 100,
      sorter: (a: Role, b: Role) => {
        const countA = users.filter((user) => user.roles.includes(a.name)).length;
        const countB = users.filter((user) => user.roles.includes(b.name)).length;
        return countA - countB;
      },
      render: (_: unknown, record: Role) => {
        const count = users.filter((user) => user.roles.includes(record.name)).length;
        return count;
      },
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: Role) => (
        <Space>
          {hasPermission('role', 'update') && (
            <Tooltip content="编辑">
              <Button
                type="text"
                icon={<IconEdit />}
                size="small"
                onClick={() => handleOpenRoleModal(record)}
              />
            </Tooltip>
          )}
          {hasPermission('role', 'delete') && (
            <Tooltip content="删除">
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                size="small"
                onClick={() => handleDeleteRole(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // 按资源分组权限
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach((perm) => {
      if (!groups[perm.resource]) {
        groups[perm.resource] = [];
      }
      groups[perm.resource].push(perm);
    });
    return groups;
  }, [permissions]);

  return (
    <MainLayout>
      <Card>
        <Tabs activeTab={mainTab} onChange={setMainTab}>
          {/* AI管理 */}
          {aiAssistanceEnabled && hasPermission('system', 'ai') && (
            <Tabs.TabPane key="ai" title="AI管理">
              <AiManagement />
            </Tabs.TabPane>
          )}

          {/* 账号管理 */}
          {hasPermission('system', 'account') && (
            <Tabs.TabPane key="account" title="账号管理">
                <Tabs activeTab={accountTab} onChange={setAccountTab} type="text">
                  {/* 用户管理 */}
                  <Tabs.TabPane key="users" title="用户管理">
                    <div className="toolbar">
                      <div className="toolbar-left" />
                      <Space>
                        <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>共 {users.length} 个用户</span>
                        <Select
                          placeholder="全部"
                          value={canLoginFilter || undefined}
                          onChange={(value) => setCanLoginFilter(value || '')}
                          allowClear
                          style={{ width: 140 }}
                        >
                          <Select.Option value="true">允许登录</Select.Option>
                          <Select.Option value="false">不可登录</Select.Option>
                        </Select>
                        <Input
                          style={{ width: 240 }}
                          prefix={<IconSearch />}
                          placeholder="搜索用户..."
                          allowClear
                          onChange={handleUserSearch}
                        />
                        {hasPermission('user', 'create') && (
                          <Button
                            type="primary"
                            icon={<IconPlus />}
                            onClick={() => handleOpenUserModal()}
                          >
                            新建用户
                          </Button>
                        )}
                      </Space>
                    </div>

                    <Table
                      columns={userColumns}
                      data={users}
                      loading={usersLoading}
                      rowKey="id"
                      pagination={{ pageSize: 20, showTotal: true }}
                      scroll={{ x: 1400 }}
                    />
                  </Tabs.TabPane>

                  {/* 角色管理 */}
                  <Tabs.TabPane key="roles" title="角色管理">
                    <div className="toolbar">
                      <div className="toolbar-left">
                        共 {roles.length} 个角色
                      </div>
                      {hasPermission('role', 'create') && (
                        <Button
                          type="primary"
                          icon={<IconPlus />}
                          onClick={() => handleOpenRoleModal()}
                        >
                          新建角色
                        </Button>
                      )}
                    </div>

                    <Table
                      columns={roleColumns}
                      data={roles}
                      loading={rolesLoading}
                      rowKey="id"
                      pagination={false}
                      scroll={{ x: 1000 }}
                    />
                  </Tabs.TabPane>

                  {/* 企微配置 */}
                  {wecomLoginEnabled && (
                    <Tabs.TabPane key="wecom" title="企微配置">
                      <WecomManagement />
                    </Tabs.TabPane>
                  )}
                  <Tabs.TabPane key="roleMembers" title="角色成员">
                    <RoleMembersTab />
                  </Tabs.TabPane>
                </Tabs>
          </Tabs.TabPane>
          )}

          {/* 节假日 */}
          {holidayManagementEnabled && hasPermission('system', 'account') && (
            <Tabs.TabPane key="holidays" title="节假日">
              <HolidayManagement />
            </Tabs.TabPane>
          )}

          {/* 操作日志 */}
          {hasPermission('system', 'audit_log') && (
            <Tabs.TabPane key="audit" title="操作日志">
              <AuditLogTab />
            </Tabs.TabPane>
          )}
        </Tabs>
      </Card>

      {/* 用户抽屉 */}
      <Drawer
        width={600}
        title={editingUser ? '编辑用户' : '新建用户'}
        visible={userModalVisible}
        onCancel={() => setUserModalVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setUserModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleSubmitUser}>
                {editingUser ? '保存' : '创建'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form
          form={userForm}
          layout="vertical"
          initialValues={{
            status: 'ACTIVE',
          }}
        >
          <Form.Item
            label="姓名"
            field="realName"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input
              placeholder="请输入姓名"
              onChange={(value) => {
                if (!editingUser && value) {
                  const py = pinyin(value, { toneType: 'none', type: 'array' }).join('');
                  userForm.setFieldValue('username', py);
                }
              }}
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item label="允许登录">
              <Space>
                <Switch
                  checked={formCanLogin}
                  onChange={setFormCanLogin}
                />
                <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
                  {formCanLogin ? '可登录' : '不可登录'}
                </span>
              </Space>
            </Form.Item>
            <Form.Item label="账号状态">
              <Space>
                <Switch
                  checked={formStatus !== 'DISABLED'}
                  onChange={(checked) => setFormStatus(checked ? 'ACTIVE' : 'DISABLED')}
                />
                <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
                  {formStatus !== 'DISABLED' ? '启用' : '已禁用'}
                </span>
              </Space>
            </Form.Item>
          </div>

          <Form.Item
            label="用户名"
            field="username"
            rules={[
              { minLength: 2, message: '用户名长度不能少于2位' },
            ]}
            extra={!editingUser ? '根据姓名自动生成拼音，可手动修改' : '用户名创建后不可修改'}
          >
            <Input
              placeholder="请输入用户名"
              disabled={!!editingUser}
            />
          </Form.Item>

          <Form.Item
            label="密码"
            field="password"
            rules={[{ minLength: 6, message: '密码长度不能少于6位' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="企微UserID"
            field="wecomUserId"
            extra="关联企业微信账号，用于企微扫码登录"
          >
            <Input placeholder="请输入企微UserID（选填）" allowClear />
          </Form.Item>

          <Form.Item
            label="角色"
            field="roleIds"
            rules={[{ required: true, message: '请选择至少一个角色' }]}
          >
            <Select
              placeholder="请选择角色"
              mode="multiple"
              allowClear
            >
              {roles.map((role) => (
                <Select.Option key={role.id} value={role.name}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Drawer>

      {/* 角色抽屉 */}
      <Drawer
        width={700}
        title={editingRole ? '编辑角色' : '新建角色'}
        visible={roleModalVisible}
        onCancel={() => setRoleModalVisible(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setRoleModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleSubmitRole}>
                {editingRole ? '保存' : '创建'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item
            label="角色名称"
            field="name"
            rules={[
              { required: true, message: '请输入角色名称' },
              { minLength: 2, message: '角色名称长度不能少于2位' },
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>

          <Form.Item label="角色描述" field="description">
            <Input.TextArea
              placeholder="请输入角色描述"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            label="权限配置"
            field="permissionIds"
            rules={[{ required: true, message: '请选择至少一个权限' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              {Object.entries(groupedPermissions).map(([resource, perms]) => (
                <div key={resource} style={{ marginBottom: 16 }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>
                    {PERMISSION_RESOURCE_MAP[resource] || resource}
                  </div>
                  <Space wrap>
                    {perms.map((perm) => (
                      <Checkbox key={perm.id} value={perm.id}>
                        {PERMISSION_ACTION_MAP[perm.action] || perm.action}{perm.description ? `（${perm.description}）` : ''}
                      </Checkbox>
                    ))}
                  </Space>
                  <Divider />
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Drawer>
    </MainLayout>
  );
};

export default AdminPage;
