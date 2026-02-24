import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Select,
  Input,
  Button,
  Tag,
  Space,
  DatePicker,
} from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import { auditLogsApi } from '../../api';
import { AuditLog } from '../../types';
import { AUDIT_ACTION_MAP, AUDIT_RESOURCE_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const AuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [userId, setUserId] = useState<string>();
  const [action, setAction] = useState<string>();
  const [resourceType, setResourceType] = useState<string>();
  const [dateRange, setDateRange] = useState<string[]>();
  const [keyword, setKeyword] = useState<string>();

  // User dropdown options
  const [userOptions, setUserOptions] = useState<Array<{ userId: string; userName: string }>>([]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await auditLogsApi.getUsers();
      setUserOptions(res.data || []);
    } catch {
      // silent
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (userId) params.userId = userId;
      if (action) params.action = action;
      if (resourceType) params.resourceType = resourceType;
      if (dateRange && dateRange[0]) params.startDate = dateRange[0];
      if (dateRange && dateRange[1]) params.endDate = dateRange[1];
      if (keyword) params.keyword = keyword;

      const res = await auditLogsApi.list(params as any);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, userId, action, resourceType, dateRange, keyword]);

  useEffect(() => {
    loadLogs();
    loadUsers();
  }, [loadLogs, loadUsers]);

  const handleReset = () => {
    setUserId(undefined);
    setAction(undefined);
    setResourceType(undefined);
    setDateRange(undefined);
    setKeyword(undefined);
    setPage(1);
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      dataIndex: 'userName',
      width: 100,
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 80,
      render: (val: string) => {
        const cfg = AUDIT_ACTION_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : val;
      },
    },
    {
      title: '资源类型',
      dataIndex: 'resourceType',
      width: 90,
      render: (val: string) => {
        const cfg = AUDIT_RESOURCE_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : val;
      },
    },
    {
      title: '资源名称',
      dataIndex: 'resourceName',
      width: 200,
      render: (val?: string) => val || '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      width: 140,
      render: (val?: string) => val || '-',
    },
  ];

  const expandedRowRender = (record: AuditLog) => {
    if (!record.changes || Object.keys(record.changes).length === 0) {
      return <span style={{ color: 'var(--color-text-3)' }}>无变更详情</span>;
    }

    const changeData = Object.entries(record.changes).map(([field, change]) => ({
      field,
      from: change.from,
      to: change.to,
    }));

    const changeColumns = [
      {
        title: '字段',
        dataIndex: 'field',
        width: 150,
      },
      {
        title: '变更前',
        dataIndex: 'from',
        render: (val: unknown) => (
          <span style={{ color: 'var(--color-text-3)' }}>
            {val === null || val === undefined ? '-' : String(val)}
          </span>
        ),
      },
      {
        title: '变更后',
        dataIndex: 'to',
        render: (val: unknown) => (
          <span style={{ fontWeight: 500 }}>
            {val === null || val === undefined ? '-' : String(val)}
          </span>
        ),
      },
    ];

    return (
      <Table
        columns={changeColumns}
        data={changeData}
        rowKey="field"
        pagination={false}
        size="small"
        border={false}
      />
    );
  };

  return (
    <div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Select
            placeholder="用户"
            style={{ width: 140 }}
            allowClear
            value={userId}
            onChange={setUserId}
          >
            {userOptions.map((u) => (
              <Select.Option key={u.userId} value={u.userId}>
                {u.userName}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="操作类型"
            style={{ width: 120 }}
            allowClear
            value={action}
            onChange={setAction}
          >
            {Object.entries(AUDIT_ACTION_MAP).map(([key, cfg]) => (
              <Select.Option key={key} value={key}>
                {cfg.label}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="资源类型"
            style={{ width: 120 }}
            allowClear
            value={resourceType}
            onChange={setResourceType}
          >
            {Object.entries(AUDIT_RESOURCE_MAP).map(([key, cfg]) => (
              <Select.Option key={key} value={key}>
                {cfg.label}
              </Select.Option>
            ))}
          </Select>
          <RangePicker
            style={{ width: 240 }}
            value={dateRange}
            onChange={(_, dateString) => setDateRange(dateString.map(String))}
          />
          <Input
            placeholder="搜索用户/资源名称"
            style={{ width: 180 }}
            allowClear
            value={keyword}
            onChange={setKeyword}
          />
          <Button icon={<IconRefresh />} onClick={handleReset}>
            重置
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        data={logs}
        loading={loading}
        rowKey="id"
        expandedRowRender={expandedRowRender}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: true,
          sizeCanChange: true,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        scroll={{ x: 900 }}
      />
    </div>
  );
};

export default AuditLogTab;
