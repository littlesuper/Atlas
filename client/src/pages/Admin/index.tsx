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
import dayjs from 'dayjs';

const AdminPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
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
    if (hasPermission('system', 'ai')) tabs.push('ai');
    if (hasPermission('system', 'ai')) tabs.push('wecom');
    if (hasPermission('system', 'account')) tabs.push('account');
    if (hasPermission('system', 'audit_log')) tabs.push('audit');
    return tabs;
  }, [hasPermission]);

  const urlTab = searchParams.get('tab') || '';
  const mainTab = visibleTabs.includes(urlTab) ? urlTab : (visibleTabs[0] || 'ai');

  // URL 上的 tab 不在可见列表中时，自动纠正 URL
  useEffect(() => {
    if (visibleTabs.length > 0 && urlTab !== mainTab) {
      setSearchParams({ tab: mainTab }, { replace: true });
    }
  }, [mainTab, urlTab, visibleTabs]);

  // 用户数据
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');

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
      const response = await usersApi.list({ keyword: userSearchKeyword || undefined });
      setUsers(response.data.data || []);
    } catch (error) {
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
    } catch (error) {
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
  }, [userSearchKeyword]);

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
      userForm.setFieldsValue({
        username: user.username,
        realName: user.realName,
        email: user.email,
        phone: user.phone,
        roleIds: user.roles || [],
        status: user.status,
      });
    } else {
      setEditingUser(null);
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
        const updateData: {
          email?: string;
          realName?: string;
          phone?: string;
          status?: string;
          roleIds?: string[];
        } = {
          email: values.email,
          realName: values.realName,
          phone: values.phone,
          status: values.status,
          roleIds,
        };

        if (values.password) {
          (updateData as typeof updateData & { password?: string }).password = values.password;
        }

        await usersApi.update(editingUser.id, updateData);
        Message.success('用户更新成功');
      } else {
        const createData = {
          username: values.username,
          email: values.email,
          password: values.password,
          realName: values.realName,
          phone: values.phone,
          roleIds,
        };

        await usersApi.create(createData);
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
          Message.success('用户删除成功');
          loadUsers();
        } catch (error) {
          Message.error('用户删除失败');
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
        } catch (error) {
          Message.error('角色删除失败');
        }
      },
    });
  };

  // 用户表格列配置
  const userColumns = [
    {
      title: '用户名',
      dataIndex: 'username',
      width: 150,
      sorter: (a: User, b: User) => a.username.localeCompare(b.username),
    },
    {
      title: '姓名',
      dataIndex: 'realName',
      width: 120,
      sorter: (a: User, b: User) => (a.realName || '').localeCompare(b.realName || ''),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 200,
    },
    {
      title: '手机',
      dataIndex: 'phone',
      width: 140,
      render: (phone?: string) => phone || '-',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 200,
      render: (roles: string[]) => (
        <Space wrap>
          {roles.map((role) => (
            <Tag key={role} color="blue">
              {role}
            </Tag>
          ))}
        </Space>
      ),
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
          {hasPermission('system', 'ai') && (
            <Tabs.TabPane key="ai" title="AI管理">
              <AiManagement />
            </Tabs.TabPane>
          )}

          {/* 企微配置 */}
          {hasPermission('system', 'ai') && (
            <Tabs.TabPane key="wecom" title="企微配置">
              <WecomManagement />
            </Tabs.TabPane>
          )}

          {/* 账号管理 */}
          {hasPermission('system', 'account') && (
            <Tabs.TabPane key="account" title="账号管理">
                <Tabs activeTab={accountTab} onChange={setAccountTab} type="text">
                  {/* 用户管理 */}
                  <Tabs.TabPane key="users" title="用户管理">
                    <div className="toolbar">
                      <div className="toolbar-left">
                        共 {users.length} 个用户
                      </div>
                      <Space>
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
                      scroll={{ x: 1300 }}
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
                </Tabs>
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
            label="用户名"
            field="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { minLength: 2, message: '用户名长度不能少于2位' },
            ]}
          >
            <Input
              placeholder="请输入用户名"
              disabled={!!editingUser}
            />
          </Form.Item>

          <Form.Item
            label="姓名"
            field="realName"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            field="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label={editingUser ? '密码（留空表示不修改）' : '密码'}
            field="password"
            rules={editingUser ? [{ minLength: 6, message: '密码长度不能少于6位' }] : [
              { required: true, message: '请输入密码' },
              { minLength: 6, message: '密码长度不能少于6位' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="手机号"
            field="phone"
            rules={[
              {
                validator: (value, callback) => {
                  if (value && !/^1[3-9]\d{9}$/.test(value)) {
                    callback('请输入有效的手机号码');
                  } else {
                    callback();
                  }
                },
              },
            ]}
          >
            <Input placeholder="请输入手机号" />
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

          <Form.Item
            label="状态"
            field="status"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              {Object.entries(USER_STATUS_MAP).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  <Tag color={value.color}>{value.label}</Tag>
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
