import React, { useState, useRef, useCallback } from 'react';
import { Button, Popover, Checkbox, Message } from '@arco-design/web-react';
import { IconMoreVertical, IconDragDotVertical, IconRefresh } from '@arco-design/web-react/icon';

export interface ColumnDef {
  key: string;
  label: string;
  removable: boolean; // false = always visible, checkbox disabled
}

export interface ColumnPrefs {
  visible: string[];
  order: string[];
}

interface ColumnSettingsProps {
  columnDefs: ColumnDef[];
  prefs: ColumnPrefs;
  onChange: (prefs: ColumnPrefs) => void;
  defaultPrefs: ColumnPrefs;
  extraActions?: React.ReactNode;
}

const ColumnSettings: React.FC<ColumnSettingsProps> = ({ columnDefs, prefs, onChange, defaultPrefs, extraActions }) => {
  const [popoverVisible, setPopoverVisible] = useState(false);

  // Drag state
  const dragIndexRef = useRef<number>(-1);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const draggingRef = useRef(false);

  // Build ordered list of column defs (only those with labels, i.e., excluding drag handle)
  const orderedDefs = prefs.order
    .map((key) => columnDefs.find((d) => d.key === key))
    .filter((d): d is ColumnDef => !!d);

  const handleToggle = (key: string, checked: boolean) => {
    const newVisible = checked
      ? [...prefs.visible, key]
      : prefs.visible.filter((k) => k !== key);
    onChange({ ...prefs, visible: newVisible });
  };

  const handleReset = () => {
    onChange({ ...defaultPrefs });
    Message.success('已恢复默认列配置');
  };

  // Mouse-based drag reorder
  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
    draggingRef.current = true;
    setDragOverIndex(-1);

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const target = (ev.target as HTMLElement).closest('[data-col-index]');
      if (target) {
        const targetIndex = parseInt(target.getAttribute('data-col-index') || '-1', 10);
        if (targetIndex >= 0) {
          setDragOverIndex(targetIndex);
        }
      }
    };

    const onMouseUp = () => {
      if (draggingRef.current && dragIndexRef.current >= 0 && dragOverIndex >= 0) {
        // We need to use the latest dragOverIndex, but since event handlers capture stale state,
        // we use a ref-based approach
      }
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleItemMouseMove = useCallback((_e: React.MouseEvent, index: number) => {
    if (draggingRef.current && dragIndexRef.current >= 0 && index !== dragIndexRef.current) {
      setDragOverIndex(index);
    }
  }, []);

  const handleItemMouseUp = useCallback((_e: React.MouseEvent, index: number) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = -1;
    setDragOverIndex(-1);

    if (fromIndex < 0 || fromIndex === index) return;

    const newOrder = [...prefs.order];
    // Only reorder among items that are in orderedDefs (have labels)
    const orderableKeys = orderedDefs.map((d) => d.key);
    const fromKey = orderableKeys[fromIndex];
    const toKey = orderableKeys[index];

    const fromPos = newOrder.indexOf(fromKey);
    const toPos = newOrder.indexOf(toKey);
    if (fromPos < 0 || toPos < 0) return;

    newOrder.splice(fromPos, 1);
    newOrder.splice(toPos, 0, fromKey);
    onChange({ ...prefs, order: newOrder });
  }, [prefs, orderedDefs, onChange]);

  const content = (
    <div style={{ width: 220 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-1)' }}>
        列显示设置
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {orderedDefs.map((def, index) => {
          const isVisible = prefs.visible.includes(def.key);
          const isDragSource = dragIndexRef.current === index && draggingRef.current;
          const isDragTarget = dragOverIndex === index && draggingRef.current && dragIndexRef.current !== index;
          const insertAbove = isDragTarget && dragIndexRef.current > index;
          const insertBelow = isDragTarget && dragIndexRef.current < index;

          return (
            <div
              key={def.key}
              data-col-index={index}
              onMouseMove={(e) => handleItemMouseMove(e, index)}
              onMouseUp={(e) => handleItemMouseUp(e, index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 0',
                opacity: isDragSource ? 0.4 : 1,
                borderTop: insertAbove ? '2px solid #165DFF' : '2px solid transparent',
                borderBottom: insertBelow ? '2px solid #165DFF' : '2px solid transparent',
                userSelect: 'none',
              }}
            >
              <span
                style={{ cursor: 'grab', marginRight: 6, display: 'flex', alignItems: 'center' }}
                onMouseDown={(e) => handleMouseDown(e, index)}
              >
                <IconDragDotVertical style={{ color: 'var(--color-text-3)', fontSize: 16 }} />
              </span>
              <Checkbox
                checked={isVisible}
                disabled={!def.removable}
                onChange={(checked) => handleToggle(def.key, checked)}
                style={{ flex: 1 }}
              >
                <span style={{ fontSize: 13 }}>{def.label}</span>
              </Checkbox>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button
          size="small"
          type="text"
          icon={<IconRefresh />}
          onClick={handleReset}
          style={{ width: '100%' }}
        >
          恢复默认
        </Button>
        {extraActions}
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      position="br"
      content={content}
      popupVisible={popoverVisible}
      onVisibleChange={setPopoverVisible}
    >
      <Button icon={<IconMoreVertical />} />
    </Popover>
  );
};

export default ColumnSettings;
