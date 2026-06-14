import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { PRODUCT_SPEC_TEMPLATES } from '../../utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    setParams([...params, { key: '', value: '' }]);
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
      toast.info('当前类别没有规格模板');
      return;
    }
    const existingKeys = new Set(params.map((p) => p.key));
    const newKeys = templateKeys.filter((k) => !existingKeys.has(k));
    if (newKeys.length === 0) {
      toast.info('模板参数已全部存在');
      return;
    }
    const newParams = [...params, ...newKeys.map((k) => ({ key: k, value: '' }))];
    setParams(newParams);
    onChange?.(paramsToObject(newParams));
    toast.success(`已加载 ${newKeys.length} 个模板参数`);
  };

  return (
    <div>
      {params.map((param, index) => (
        <div key={index} className="mb-2 flex gap-2">
          <Input
            placeholder="参数名"
            value={param.key}
            onChange={(e) => handleChange(index, 'key', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="参数值"
            value={param.value}
            onChange={(e) => handleChange(index, 'value', e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="删除参数"
            className="text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => handleRemove(index)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="border-dashed" onClick={handleAdd}>
          <Plus className="size-4" />
          添加参数
        </Button>
        {category && PRODUCT_SPEC_TEMPLATES[category]?.length > 0 && (
          <Button type="button" variant="outline" onClick={handleLoadTemplate}>
            加载模板
          </Button>
        )}
      </div>
    </div>
  );
};

export default ParamsEditor;
