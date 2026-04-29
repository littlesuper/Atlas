import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Alert,
} from '@arco-design/web-react';
import { IconPlus, IconEdit, IconDelete, IconRefresh } from '@arco-design/web-react/icon';
import dayjs from 'dayjs';
import { holidaysApi, Holiday } from '../../api';

const HOLIDAY_TYPE_MAP: Record<Holiday['type'], { label: string; color: string }> = {
  HOLIDAY: { label: '放假', color: 'red' },
  MAKEUP: { label: '调休补班', color: 'orange' },
};

const HolidayManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [generateForm] = Form.useForm();

  const currentYear = dayjs().year();
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [data, setData] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [knownYears, setKnownYears] = useState<number[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);

  const [generateVisible, setGenerateVisible] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await holidaysApi.list({ year: yearFilter });
      setData(res.data);
    } catch {
      // 错误已由请求拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  const loadKnownYears = async () => {
    try {
      const res = await holidaysApi.knownYears();
      setKnownYears(res.data.knownYears);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadKnownYears();
  }, []);

  useEffect(() => {
    load();
  }, [yearFilter]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (let y = currentYear - 1; y <= currentYear + 5; y++) years.add(y);
    knownYears.forEach((y) => years.add(y));
    data.forEach((d) => years.add(d.year));
    return Array.from(years).sort((a, b) => a - b);
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
        date: typeof values.date === 'string' ? values.date : dayjs(values.date).format('YYYY-MM-DD'),
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

  const handleGenerate = async () => {
    try {
      const values = await generateForm.validate();
      setGenerating(true);
      const res = await holidaysApi.generate(values.year, true);
      Message.success(res.data.message);
      setGenerateVisible(false);
      generateForm.resetFields();
      setYearFilter(values.year);
      loadKnownYears();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleClearYear = async () => {
    try {
      await holidaysApi.deleteYear(yearFilter);
      Message.success(`${yearFilter} 年节假日已清空`);
      load();
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
      width: 120,
      render: (source: string) => (
        <Tag color={source === 'generated' ? 'arcoblue' : 'gray'}>
          {source === 'generated' ? '自动生成' : '手动添加'}
        </Tag>
      ),
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

  const isYearKnown = knownYears.includes(yearFilter);

  return (
    <div>
      <Alert
        type={isYearKnown ? 'success' : 'warning'}
        showIcon
        closable={false}
        style={{ marginBottom: 16 }}
        content={
          isYearKnown
            ? `${yearFilter} 年为系统内置已收录年份，可一键生成完整节假日数据（含调休）。`
            : `${yearFilter} 年暂未收录国务院公告，"生成"按钮仅会创建固定日期节假日（元旦/劳动节/国庆），春节、清明、端午、中秋等农历相关日期需手动补录。`
        }
      />

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
                {knownYears.includes(y) && (
                  <Tag size="small" color="green" style={{ marginLeft: 4 }}>
                    已收录
                  </Tag>
                )}
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
        onOk={handleGenerate}
        confirmLoading={generating}
      >
        <Alert
          type="warning"
          showIcon
          closable={false}
          style={{ marginBottom: 16 }}
          content="此操作会先清空所选年份的全部节假日数据，然后批量插入。手动添加的记录也会被一并清除。"
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
          <div style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
            已收录年份：{knownYears.join('、') || '无'}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default HolidayManagement;
