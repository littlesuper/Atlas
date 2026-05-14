import React, { useState } from 'react';
import { Button, Input, Space, Message } from '@arco-design/web-react';
import { PRODUCT_SPEC_TEMPLATES } from '../../utils/constants';

export function paramsToObject(params: Array<{ key: string; value: string }>): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((p) => {
    if (p.key) obj[p.key] = p.value;
  });
  return obj;
}

interface ParamsEditorProps {
  value?: Record<string, unknown>;
  onChange?: (value: Record<string, unknown>) => void;
  category?: string;
}

const ParamsEditor: React.FC<ParamsEditorProps> = ({ value = {}, onChange, category }) => {
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    Object.entries(value).map(([key, val]) => ({ key, value: String(val) }))
  );

  const handleAdd = () => {
    const newParams = [...params, { key: '', value: '' }];
    setParams(newParams);
  };

  const handleChange = (index: number, field: 'key' | 'value', val: string) => {
    const newParams = [...params];
    newParams[index][field] = val;
    setParams(newParams);

    onChange?.(paramsToObject(newParams));
  };

  const handleRemove = (index: number) => {
    const newParams = params.filter((_, i) => i !== index);
    setParams(newParams);

    onChange?.(paramsToObject(newParams));
  };

  const handleLoadTemplate = () => {
    if (!category) return;
    const templateKeys = PRODUCT_SPEC_TEMPLATES[category] || [];
    if (templateKeys.length === 0) {
      Message.info('当前类别没有规格模板');
      return;
    }
    const existingKeys = new Set(params.map((p) => p.key));
    const newKeys = templateKeys.filter((k) => !existingKeys.has(k));
    if (newKeys.length === 0) {
      Message.info('模板参数已全部存在');
      return;
    }
    const newParams = [...params, ...newKeys.map((k) => ({ key: k, value: '' }))];
    setParams(newParams);
    onChange?.(paramsToObject(newParams));
    Message.success(`已加载 ${newKeys.length} 个模板参数`);
  };

  return (
    <div>
      {params.map((param, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input
            placeholder="参数名"
            value={param.key}
            onChange={(val) => handleChange(index, 'key', val)}
            style={{ flex: 1 }}
          />
          <Input
            placeholder="参数值"
            value={param.value}
            onChange={(val) => handleChange(index, 'value', val)}
            style={{ flex: 1 }}
          />
          <Button
            status="danger"
            onClick={() => handleRemove(index)}
          >
            删除
          </Button>
        </div>
      ))}
      <Space>
        <Button type="dashed" onClick={handleAdd}>
          添加参数
        </Button>
        {category && PRODUCT_SPEC_TEMPLATES[category]?.length > 0 && (
          <Button type="outline" onClick={handleLoadTemplate}>
            加载模板
          </Button>
        )}
      </Space>
    </div>
  );
};

export default ParamsEditor;
