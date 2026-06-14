import React, { useState } from 'react';
import { MoreVertical, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ColumnDef {
  key: string;
  label: string;
  removable: boolean; // false = always visible, checkbox disabled
}

export interface ColumnPrefs {
  visible: string[];
  order: string[];
  widths?: Record<string, number>;
}

interface ColumnSettingsProps {
  columnDefs: ColumnDef[];
  prefs: ColumnPrefs;
  onChange: (prefs: ColumnPrefs) => void;
  defaultPrefs: ColumnPrefs;
  extraActions?: React.ReactNode;
}

export function buildOrderedDefs(order: string[], columnDefs: ColumnDef[]): ColumnDef[] {
  return order.map((key) => columnDefs.find((d) => d.key === key)).filter((d): d is ColumnDef => !!d);
}

export function toggleColumnVisible(visible: string[], key: string, checked: boolean): string[] {
  return checked ? [...visible, key] : visible.filter((k) => k !== key);
}

const ColumnSettings: React.FC<ColumnSettingsProps> = ({ columnDefs, prefs, onChange, defaultPrefs, extraActions }) => {
  const [popoverVisible, setPopoverVisible] = useState(false);

  const orderedDefs = buildOrderedDefs(prefs.order, columnDefs);

  const handleToggle = (key: string, checked: boolean) => {
    const newVisible = toggleColumnVisible(prefs.visible, key, checked);
    onChange({ ...prefs, visible: newVisible });
  };

  const handleReset = () => {
    onChange({ ...defaultPrefs });
    toast.success('已恢复默认列配置');
  };

  // Reorder via up/down arrows
  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const newOrder = [...prefs.order];
    // Only reorder among items that are in orderedDefs (have labels)
    const orderableKeys = orderedDefs.map((d) => d.key);
    const fromKey = orderableKeys[fromIndex];
    const toKey = orderableKeys[toIndex];

    const fromPos = newOrder.indexOf(fromKey);
    const toPos = newOrder.indexOf(toKey);
    if (fromPos < 0 || toPos < 0) return;

    newOrder.splice(fromPos, 1);
    newOrder.splice(toPos, 0, fromKey);
    onChange({ ...prefs, order: newOrder });
  };

  const content = (
    <div className="w-[220px]">
      <div className="text-foreground mb-2 text-[13px] font-medium">列显示设置</div>
      <div className="max-h-[360px] overflow-y-auto">
        {orderedDefs.map((def, index) => {
          const isVisible = prefs.visible.includes(def.key);
          const checkboxId = `col-${def.key}`;

          return (
            <div key={def.key} className="flex select-none items-center gap-1.5 py-1">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-4"
                  aria-label={`上移 ${def.label}`}
                  disabled={index === 0}
                  onClick={() => moveColumn(index, index - 1)}
                >
                  <ChevronUp className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-4"
                  aria-label={`下移 ${def.label}`}
                  disabled={index === orderedDefs.length - 1}
                  onClick={() => moveColumn(index, index + 1)}
                >
                  <ChevronDown className="size-3" />
                </Button>
              </div>
              <Checkbox
                id={checkboxId}
                checked={isVisible}
                disabled={!def.removable}
                onCheckedChange={(checked) => handleToggle(def.key, checked === true)}
              />
              <Label htmlFor={checkboxId} className="flex-1 text-[13px] font-normal">
                {def.label}
              </Label>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleReset}>
          <RotateCcw className="size-4" />
          恢复默认
        </Button>
        {extraActions}
      </div>
    </div>
  );

  return (
    <Popover open={popoverVisible} onOpenChange={setPopoverVisible}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" aria-label="列设置">
          <MoreVertical className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        {content}
      </PopoverContent>
    </Popover>
  );
};

export default ColumnSettings;
