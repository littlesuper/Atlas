import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  Message,
  Select,
  Space,
  Spin,
  Tag,
  Grid,
} from '@arco-design/web-react';
import { IconSave, IconUser } from '@arco-design/web-react/icon';
import dayjs from 'dayjs';
import { projectsApi, usersApi, templatesApi } from '../../../api';
import { FEATURE_FLAGS } from '../../../featureFlags/flags';
import { useFeatureFlag } from '../../../featureFlags/FeatureFlagProvider';
import { Project, User, ProjectTemplate } from '../../../types';
import {
  STATUS_MAP,
  PRIORITY_MAP,
  PRODUCT_LINE_MAP,
  PROJECT_MEMBER_ROLE_MAP,
  PROJECT_MEMBER_ROLE_KEYS,
} from '../../../utils/constants';

const { RangePicker } = DatePicker;
const { Row, Col } = Grid;

type RoleKey = keyof typeof PROJECT_MEMBER_ROLE_MAP;

interface ProjectFormDrawerProps {
  visible: boolean;
  projectId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ProjectFormDrawer: React.FC<ProjectFormDrawerProps> = ({
  visible,
  projectId,
  onClose,
  onSuccess,
}) => {
  const isCreate = !projectId;
  const [form] = Form.useForm();
  const projectTemplatesEnabled = useFeatureFlag(FEATURE_FLAGS.PROJECT_TEMPLATES);

  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [managerId, setManagerId] = useState<string>('');
  const [memberRoleMap, setMemberRoleMap] = useState<Record<RoleKey, string[]>>(() => {
    const init = {} as Record<RoleKey, string[]>;
    PROJECT_MEMBER_ROLE_KEYS.forEach((k) => {
      init[k] = [];
    });
    return init;
  });

  const memberCount = useMemo(() => {
    const set = new Set<string>();
    Object.values(memberRoleMap).forEach((ids) => ids.forEach((id) => set.add(id)));
    return set.size;
  }, [memberRoleMap]);

  const resetState = () => {
    form.resetFields();
    setManagerId('');
    const init = {} as Record<RoleKey, string[]>;
    PROJECT_MEMBER_ROLE_KEYS.forEach((k) => {
      init[k] = [];
    });
    setMemberRoleMap(init);
  };

  const loadUsers = async () => {
    const res = await usersApi.list();
    setUsers(
      (res.data.data || []).filter((u) => u.canLogin !== false || u.status !== 'DISABLED'),
    );
  };

  const loadTemplates = async () => {
    if (!isCreate || !projectTemplatesEnabled) return;
    try {
      const res = await templatesApi.list();
      setTemplates(res.data || []);
    } catch {
      // ignore
    }
  };

  const loadProject = async () => {
    if (isCreate || !projectId) return;
    setLoading(true);
    try {
      const res = await projectsApi.get(projectId);
      const project: Project = res.data;
      form.setFieldsValue({
        name: project.name,
        description: project.description,
        productLine: project.productLine,
        status: project.status,
        priority: project.priority,
        managerId: project.managerId,
        dateRange: [
          dayjs(project.startDate),
          project.endDate ? dayjs(project.endDate) : undefined,
        ],
      });
      setManagerId(project.managerId);

      const mres = await projectsApi.getMembers(projectId);
      const next = {} as Record<RoleKey, string[]>;
      PROJECT_MEMBER_ROLE_KEYS.forEach((k) => {
        next[k] = [];
      });
      for (const m of mres.data) {
        const role = (PROJECT_MEMBER_ROLE_KEYS as string[]).includes(m.role)
          ? (m.role as RoleKey)
          : 'OTHER';
        if (!next[role].includes(m.userId)) {
          next[role].push(m.userId);
        }
      }
      setMemberRoleMap(next);
    } catch {
      Message.error('加载项目信息失败');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    resetState();
    loadUsers();
    loadTemplates();
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, projectId]);

  const handleManagerChange = (newManagerId?: string) => {
    setManagerId(newManagerId || '');
  };

  const handleRoleMembersChange = (role: RoleKey, ids: string[]) => {
    setMemberRoleMap((prev) => ({ ...prev, [role]: ids }));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const data = {
        name: values.name,
        description: values.description,
        productLine: values.productLine,
        status: values.status,
        priority: values.priority,
        startDate: dayjs(values.dateRange[0]).format('YYYY-MM-DD'),
        endDate: values.dateRange[1]
          ? dayjs(values.dateRange[1]).format('YYYY-MM-DD')
          : undefined,
        managerId: values.managerId,
      };

      const memberPayload: Array<{ userId: string; role: string }> = [];
      for (const role of PROJECT_MEMBER_ROLE_KEYS) {
        for (const uid of memberRoleMap[role]) {
          if (uid === values.managerId) continue;
          memberPayload.push({ userId: uid, role });
        }
      }

      let savedId = projectId;
      if (isCreate) {
        const res = await projectsApi.create(data);
        savedId = res.data.id;

        if (projectTemplatesEnabled && values.templateId) {
          try {
            const inst = await templatesApi.instantiate(values.templateId, {
              projectId: savedId,
              startDate: data.startDate,
            });
            Message.success(`项目已创建，并从模板生成 ${inst.data.count} 个活动`);
          } catch {
            Message.warning('项目已创建，但模板实例化失败');
          }
        } else {
          Message.success('项目创建成功');
        }
      } else {
        await projectsApi.update(projectId!, data);
        Message.success('项目更新成功');
      }

      if (savedId) {
        await projectsApi.replaceMembers(savedId, memberPayload);
      }

      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('保存失败', e);
    } finally {
      setSaving(false);
    }
  };

  const availableUsers = (_role: RoleKey) => users.filter((u) => u.id !== managerId);

  const userLabel = (u: User) => u.realName || u.username || u.id.slice(0, 8);

  return (
    <Drawer
      width={720}
      title={isCreate ? '新建项目' : '编辑项目'}
      visible={visible}
      onCancel={onClose}
      maskClosable={false}
      unmountOnExit
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              icon={<IconSave />}
              loading={saving}
              onClick={handleSubmit}
            >
              {isCreate ? '创建项目' : '保存修改'}
            </Button>
          </Space>
        </div>
      }
    >
      <Spin loading={loading} style={{ width: '100%' }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            productLine: 'DANDELION',
          }}
        >
          <Card title="基础信息" style={{ marginBottom: 16 }} bordered>
            <Row gutter={12}>
              <Col span={16}>
                <Form.Item
                  label="项目名称"
                  field="name"
                  rules={[{ required: true, message: '请输入项目名称' }]}
                >
                  <Input placeholder="请输入项目名称" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="产品线"
                  field="productLine"
                  rules={[{ required: true, message: '请选择产品线' }]}
                >
                  <Select placeholder="产品线">
                    {Object.entries(PRODUCT_LINE_MAP).map(([key, value]) => (
                      <Select.Option key={key} value={key}>
                        <Tag color={value.color}>{value.label}</Tag>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="项目描述" field="description">
              <Input.TextArea
                placeholder="请输入项目描述"
                rows={3}
                showWordLimit
                maxLength={500}
              />
            </Form.Item>

            {isCreate && projectTemplatesEnabled && templates.length > 0 && (
              <Form.Item
                label="项目模板"
                field="templateId"
                extra="选择模板后，创建项目时将自动生成活动计划"
              >
                <Select placeholder="选择模板（可选）" allowClear>
                  {templates.map((t) => (
                    <Select.Option key={t.id} value={t.id}>
                      {t.name}
                      {t._count?.activities ? ` (${t._count.activities} 个活动)` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            )}

            <Row gutter={12}>
              <Col span={6}>
                <Form.Item
                  label="状态"
                  field="status"
                  rules={[{ required: true, message: '请选择状态' }]}
                >
                  <Select placeholder="状态">
                    {Object.entries(STATUS_MAP)
                      .filter(([key]) => key !== 'ARCHIVED')
                      .map(([key, value]) => (
                        <Select.Option key={key} value={key}>
                          <Tag color={value.color}>{value.label}</Tag>
                        </Select.Option>
                      ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="优先级"
                  field="priority"
                  rules={[{ required: true, message: '请选择优先级' }]}
                >
                  <Select placeholder="优先级">
                    {Object.entries(PRIORITY_MAP).map(([key, value]) => (
                      <Select.Option key={key} value={key}>
                        <Tag color={value.color}>{value.label}</Tag>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="计划周期"
                  field="dateRange"
                  rules={[
                    { required: true, message: '请选择起止时间' },
                    {
                      validator: (value, cb) => {
                        if (
                          value &&
                          value[0] &&
                          value[1] &&
                          dayjs(value[1]).isBefore(dayjs(value[0]))
                        ) {
                          cb('结束日期不能早于开始日期');
                        } else {
                          cb();
                        }
                      },
                    },
                  ]}
                >
                  <RangePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title={
              <Space>
                <IconUser />
                <span>项目成员（按角色分组）</span>
                <Tag color="arcoblue">{memberCount} 人</Tag>
              </Space>
            }
            bordered
            bodyStyle={{ paddingBottom: 8 }}
          >
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="项目经理"
                  field="managerId"
                  rules={[{ required: true, message: '请选择项目经理' }]}
                  extra="项目经理拥有项目的最高权限"
                >
                  <Select
                    placeholder="选择项目经理"
                    showSearch
                    filterOption={(input, option) =>
                      ((option?.props?.children as string) || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    onChange={(v) => {
                      handleManagerChange(v);
                      if (v) {
                        setMemberRoleMap((prev) => {
                          const next = { ...prev };
                          for (const k of PROJECT_MEMBER_ROLE_KEYS) {
                            if (next[k].includes(v)) {
                              next[k] = next[k].filter((id) => id !== v);
                            }
                          }
                          return next;
                        });
                      }
                    }}
                  >
                    {users.map((u) => (
                      <Select.Option key={u.id} value={u.id}>
                        {userLabel(u)}
                        {u.username && (
                          <span style={{ color: 'var(--color-text-3)', marginLeft: 6 }}>
                            ({u.username})
                          </span>
                        )}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label={
                    <span>
                      项目协作者
                      <span
                        style={{
                          color: 'var(--color-text-3)',
                          fontSize: 12,
                          marginLeft: 8,
                        }}
                      >
                        {memberRoleMap.COLLABORATOR.length} 人
                      </span>
                    </span>
                  }
                  extra="可选，跨角色的项目协作成员"
                >
                  <Select
                    mode="multiple"
                    placeholder="选择项目协作者"
                    value={memberRoleMap.COLLABORATOR}
                    onChange={(ids) => handleRoleMembersChange('COLLABORATOR', ids)}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount={2}
                    filterOption={(input, option) =>
                      ((option?.props?.children as string) || '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                  >
                    {availableUsers('COLLABORATOR').map((u) => (
                      <Select.Option key={u.id} value={u.id}>
                        {userLabel(u)}
                        {u.username && (
                          <span style={{ color: 'var(--color-text-3)', marginLeft: 6 }}>
                            ({u.username})
                          </span>
                        )}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <div
              style={{
                borderTop: '1px solid var(--color-border-2)',
                marginTop: 8,
                paddingTop: 16,
              }}
            >
              <Row gutter={[12, 12]}>
                {PROJECT_MEMBER_ROLE_KEYS.filter((k) => k !== 'COLLABORATOR').map((roleKey) => {
                  const meta = PROJECT_MEMBER_ROLE_MAP[roleKey];
                  const value = memberRoleMap[roleKey];
                  return (
                    <Col key={roleKey} span={12}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Tag
                          color={meta.color}
                          style={{ minWidth: 90, textAlign: 'center' }}
                        >
                          {meta.label}
                        </Tag>
                        <span
                          style={{ color: 'var(--color-text-3)', fontSize: 12 }}
                        >
                          {value.length} 人
                        </span>
                      </div>
                      <Select
                        mode="multiple"
                        placeholder={`选择${meta.label}`}
                        value={value}
                        onChange={(ids) => handleRoleMembersChange(roleKey, ids)}
                        allowClear
                        showSearch
                        style={{ width: '100%' }}
                        maxTagCount={2}
                        filterOption={(input, option) =>
                          ((option?.props?.children as string) || '')
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                      >
                        {availableUsers(roleKey).map((u) => (
                          <Select.Option key={u.id} value={u.id}>
                            {userLabel(u)}
                            {u.username && (
                              <span
                                style={{
                                  color: 'var(--color-text-3)',
                                  marginLeft: 6,
                                }}
                              >
                                ({u.username})
                              </span>
                            )}
                          </Select.Option>
                        ))}
                      </Select>
                    </Col>
                  );
                })}
              </Row>
            </div>
          </Card>
        </Form>
      </Spin>
    </Drawer>
  );
};

export default ProjectFormDrawer;
