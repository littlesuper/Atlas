import React from 'react';
import { Select, Spin } from '@arco-design/web-react';
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Select
        mode="multiple"
        value={initialValue}
        onChange={(val: string[]) => onChange(val)}
        onBlur={onCommit}
        style={{ minWidth: 200 }}
        ref={(el) => el?.focus?.()}
      >
        {roles.map((role) => (
          <Select.Option key={role.name} value={role.name}>
            {role.name}
          </Select.Option>
        ))}
      </Select>
      {loading && <Spin size={16} />}
    </div>
  );
};

export default InlineRoleEditor;
