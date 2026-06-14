import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface SelectOption {
  value: string;
  label: string;
  /** 次要说明（如用户名），参与搜索但样式弱化 */
  sublabel?: string;
}

interface MultiSelectProps {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  maxTagCount?: number;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '请选择',
  searchPlaceholder = '搜索…',
  emptyText = '无匹配项',
  maxTagCount = 2,
  disabled,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('hover:bg-background h-auto min-h-9 w-full justify-between font-normal', className)}
        >
          <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
            {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {selected.slice(0, maxTagCount).map((o) => (
              <Badge key={o.value} variant="secondary" className="gap-1">
                {o.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`移除 ${o.label}`}
                  className="hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                >
                  <X className="size-3" />
                </span>
              </Badge>
            ))}
            {selected.length > maxTagCount && <Badge variant="secondary">+{selected.length - maxTagCount}</Badge>}
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = value.includes(o.value);
                return (
                  <CommandItem key={o.value} value={`${o.label} ${o.sublabel ?? ''}`} onSelect={() => toggle(o.value)}>
                    <Check className={cn('mr-2 size-4', checked ? 'opacity-100' : 'opacity-0')} />
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-muted-foreground ml-1.5 text-xs">{o.sublabel}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
