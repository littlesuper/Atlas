import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Notification,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Alert,
  Spin,
} from '@arco-design/web-react';
import { IconPlus, IconEdit, IconDelete, IconRefresh } from '@arco-design/web-react/icon';
import dayjs from 'dayjs';
import { holidaysApi, Holiday, HolidaySource, SourceStatusResult } from '../../api';

const HOLIDAY_TYPE_MAP: Record<Holiday['type'], { label: string; color: string }> = {
  HOLIDAY: { label: '放假', color: 'red' },
  MAKEUP: { label: '调休补班', color: 'orange' },
};

const SOURCE_TAG_MAP: Record<HolidaySource, { label: string; color: string }> = {
  OFFICIAL_API: { label: '官方源', color: 'arcoblue' },
  BUILT_IN: { label: '系统内置', color: 'gray' },
  ALGORITHM: { label: '⚠ 算法推算', color: 'orange' },
  MANUAL_INPUT: { label: '手动录入', color: 'green' },
};

export const computeYearOptions = (
  currentYear: number,
  knownYears: number[],
  data: Holiday[],
): number[] => {
  const years = new Set<number>();
  for (let y = currentYear - 1; y <= currentYear + 5; y++) years.add(y);
  knownYears.forEach((y) => years.add(y));
  data.forEach((d) => years.add(d.year));
  return Array.from(years).sort((a, b) => a - b);
};

export const formatHolidayDate = (date: string | dayjs.Dayjs): string =>
  typeof date === 'string' ? date : dayjs(date).format('YYYY-MM-DD');

const HolidayManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [generateForm] = Form.useForm();

  const currentYear = dayjs().year();
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [data, setData] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [knownYears, setKnownYears] = useState<number[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatusResult | null>(null);
  const [sourceStatusLoading, setSourceStatusLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);

  const [generateVisible, setGenerateVisible] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await holidaysApi.list({ year: yearFilter });
      setData(res.data);
    } catch {
      // 错误已由请求拦截器统一提示
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const loadKnownYears = async () => {
    try {
      const res = await holidaysApi.knownYears();
      setKnownYears(res.data.knownYears);
    } catch {
      // ignore
    }
  };

  const loadSourceStatus = useCallback(async () => {
    setSourceStatusLoading(true);
    try {
      const res = await holidaysApi.sourceStatus(yearFilter);
      setSourceStatus(res.data);
    } catch {
      setSourceStatus(null);
    } finally {
      setSourceStatusLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    loadKnownYears();
  }, []);

  useEffect(() => {
    load();
    loadSourceStatus();
  }, [yearFilter, load, loadSourceStatus]);

  const yearOptions = useMemo(() => {
    return computeYearOptions(currentYear, knownYears, data);
  }, [currentYear, knownYears, data]);

  const handleOpenModal = (holiday?: Holiday) => {
    if (holiday) {
      setEditing(holiday);
      form.setFieldsValue({
        date: holiday.date,
        name: holiday.name,
        type: holiday.type,
      });
    } else {
      setEditing(null);
      form.resetFields();
      form.setFieldValue('type', 'HOLIDAY');
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      const payload = {
        date: formatHolidayDate(values.date),
        name: values.name,
        type: values.type,
      };

      if (editing) {
        await holidaysApi.update(editing.id, payload);
        Message.success('节假日已更新');
      } else {
        await holidaysApi.create(payload);
        Message.success('节假日已新增');
      }
      setModalVisible(false);
      load();
    } catch {
      // Form validate error or API error already handled by interceptor
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    try {
      await holidaysApi.delete(holiday.id);
      Message.success('已删除');
      load();
    } catch {
      // ignore
    }
  };

  const handleGenerate = async (year: number) => {
    const existing = data.length;
    if (existing > 0) {
      return new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '确认覆盖',
          content: `${year} 年已有 ${existing} 条数据，确认覆盖吗？手动添加的记录也会被清除。`,
          okText: '确认覆盖',
          onOk: async () => {
            const result = await doGenerate(year, true);
            resolve(result);
          },
          onCancel: () => resolve(false),
        });
      });
    } else {
      return doGenerate(year, false);
    }
  };

  const doGenerate = async (year: number, overwrite: boolean): Promise<boolean> => {
    setGenerating(true);
    try {
      const res = await holidaysApi.generate(year, overwrite, true);
      const result = res.data;

      if (result.source === 'OFFICIAL_API') {
        Message.success(`已从官方源生成 ${result.count} 条数据`);
      } else {
        Message.warning(`已使用系统内置数据生成 ${result.count} 条`);
      }

      if (result.warning) {
        Notification.warning({
          title: '数据源回退',
          content: result.warning,
          duration: 0,
          closable: true,
        });
      }

      setGenerateVisible(false);
      generateForm.resetFields();
      setYearFilter(year);
      loadKnownYears();
      load();
      return true;
    } catch {
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const handleClearYear = async () => {
    try {
      await holidaysApi.deleteYear(yearFilter);
      Message.success(`${yearFilter} 年节假日已清空`);
      load();
      loadSourceStatus();
    } catch {
      // ignore
    }
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      width: 140,
      sorter: (a: Holiday, b: Holiday) => a.date.localeCompare(b.date),
      render: (date: string) => (
        <span>
          {date} <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>{dayjs(date).format('ddd')}</span>
        </span>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (type: Holiday['type']) => {
        const cfg = HOLIDAY_TYPE_MAP[type];
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 140,
      render: (source: HolidaySource, record: Holiday) => {
        const cfg = SOURCE_TAG_MAP[source] || { label: source, color: 'gray' };
        const tag = <Tag color={cfg.color}>{cfg.label}</Tag>;
        if (record.sourceUrl) {
          return (
            <Tooltip content={<span>点击查看原文<br />{record.sourceUrl}</span>}>
              <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                {tag}
              </a>
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: Holiday) => (
        <Space>
          <Tooltip content="编辑">
            <Button type="text" size="small" icon={<IconEdit />} onClick={() => handleOpenModal(record)} />
          </Tooltip>
          <Popconfirm
            title="确认删除该节假日？"
            onOk={() => handleDelete(record)}
          >
            <Button type="text" size="small" status="danger" icon={<IconDelete />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderBanner = () => {
    if (sourceStatusLoading) {
      return <Spin dot style={{ marginRight: 8 }} />;
    }
    if (!sourceStatus) return null;

    const { officialAvailable, officialPapers, builtInAvailable, existing } = sourceStatus;

    if (officialAvailable) {
      return (
        <Alert
          type="success"
          showIcon
          closable={false}
          style={{ marginBottom: 16 }}
          content={
            <span>
              已检测到 {yearFilter} 年官方数据（holiday-cn，共 {sourceStatus.officialDaysCount} 天）
              {officialPapers.length > 0 && (
                <>
                  {' '}依据：
                  <a href={officialPapers[0]} target="_blank" rel="noopener noreferrer">
                    查看原文
                  </a>
                </>
              )}
              {existing > 0 && (
                <span style={{ color: 'var(--color-text-3)', marginLeft: 8 }}>
                  （当前已有 {existing} 条数据）
                </span>
              )}
            </span>
          }
        />
      );
    }

    if (builtInAvailable || existing > 0) {
      return (
        <Alert
          type="warning"
          showIcon
          closable={false}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={loadSourceStatus}>
              重试
            </Button>
          }
          content="暂时无法连接官方数据源，可使用系统内置数据生成"
        />
      );
    }

    return (
      <Alert
        type="info"
        showIcon
        closable={false}
        style={{ marginBottom: 16 }}
        content={`${yearFilter} 年数据暂未发布（国务院通常于每年 11 月公布次年安排），可手动新增`}
      />
    );
  };

  return (
    <div>
      {renderBanner()}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <Space>
          <span>年份：</span>
          <Select
            style={{ width: 120 }}
            value={yearFilter}
            onChange={setYearFilter}
          >
            {yearOptions.map((y) => (
              <Select.Option key={y} value={y}>
                {y}
              </Select.Option>
            ))}
          </Select>
          <span style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
            共 {data.length} 条
          </span>
        </Space>
        <Space>
          <Button icon={<IconRefresh />} onClick={() => setGenerateVisible(true)}>
            按年生成
          </Button>
          <Popconfirm
            title={`确认清空 ${yearFilter} 年所有节假日？`}
            onOk={handleClearYear}
          >
            <Button status="danger">清空当年</Button>
          </Popconfirm>
          <Button type="primary" icon={<IconPlus />} onClick={() => handleOpenModal()}>
            新增节假日
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        data={data}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 50, showTotal: true }}
      />

      {/* 编辑/新增 */}
      <Modal
        title={editing ? '编辑节假日' : '新增节假日'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="日期"
            field="date"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            label="名称"
            field="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：春节、劳动节调休补班" />
          </Form.Item>
          <Form.Item
            label="类型"
            field="type"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select>
              <Select.Option value="HOLIDAY">放假（HOLIDAY）</Select.Option>
              <Select.Option value="MAKEUP">调休补班（MAKEUP）</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 按年生成 */}
      <Modal
        title="按年生成节假日"
        visible={generateVisible}
        onCancel={() => setGenerateVisible(false)}
        footer={null}
      >
        <Alert
          type="info"
          showIcon
          closable={false}
          style={{ marginBottom: 16 }}
          content="优先从 holiday-cn 获取官方数据。若该年已有数据，生成前需确认覆盖。"
        />
        <Form form={generateForm} layout="vertical" initialValues={{ year: currentYear }}>
          <Form.Item
            label="年份"
            field="year"
            rules={[
              { required: true, message: '请输入年份' },
              { type: 'number', min: 2020, max: 2100, message: '年份须在 2020 ~ 2100 之间' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="如 2026" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setGenerateVisible(false)}>取消</Button>
            <Button
              type="primary"
              loading={generating}
              onClick={async () => {
                try {
                  const values = await generateForm.validate();
                  await handleGenerate(values.year);
                } catch {
                  // validation error
                }
              }}
            >
              生成
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default HolidayManagement;
