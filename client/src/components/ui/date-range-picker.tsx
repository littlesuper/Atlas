import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = '选择起止日期',
  disabled,
  className,
  id,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const text = value?.from
    ? value.to
      ? `${dayjs(value.from).format('YYYY-MM-DD')} ~ ${dayjs(value.to).format('YYYY-MM-DD')}`
      : dayjs(value.from).format('YYYY-MM-DD')
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start text-left font-normal', !text && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          {text || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
