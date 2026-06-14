import React from 'react';
import { Loader2 } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
import type { Role } from '../../types';

interface InlineRoleEditorProps {
  roles: Role[];
  initialValue: string[];
  loading: boolean;
  onChange: (value: string[]) => void;
  onCommit: () => void;
}

const InlineRoleEditor: React.FC<InlineRoleEditorProps> = ({
  roles,
  initialValue,
  loading,
  onChange,
  onCommit,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // 进入编辑态自动聚焦选择器（替代 Arco Select 的 ref 自动 focus）
  React.useEffect(() => {
    containerRef.current?.querySelector<HTMLButtonElement>('button[role="combobox"]')?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1"
      onBlur={(e) => {
        // 焦点移出整个编辑器（含下拉浮层）时提交（替代 Arco Select 的 onBlur）
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onCommit();
        }
      }}
    >
      <MultiSelect
        options={roles.map((role) => ({ value: role.name, label: role.name }))}
        value={initialValue}
        onChange={onChange}
        placeholder="请选择角色"
        className="min-w-[200px]"
      />
      {loading && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
    </div>
  );
};

export default InlineRoleEditor;
