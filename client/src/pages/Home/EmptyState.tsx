import React from 'react';
import { Bot } from 'lucide-react';

const EXAMPLES = [
  '把项目甲的硬件打样推迟两周',
  '把项目甲优先级改成高',
  '给项目甲加一条高风险：电源散热',
  '项目甲现在有几个高风险？',
];

interface Props {
  onPick: (text: string) => void;
}

const EmptyState: React.FC<Props> = ({ onPick }) => (
  <div className="mx-auto flex max-w-[640px] flex-col items-center px-4 py-16 text-center">
    <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
      <Bot className="size-6" />
    </div>
    <h2 className="mt-4 text-xl font-semibold">用一句话使用系统</h2>
    <p className="text-muted-foreground mt-1 text-sm">排期、项目字段、风险项——直接说，AI 帮你理解并预览，确认后才写入</p>
    <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="hover:border-primary/40 hover:bg-muted/50 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
        >
          {ex}
        </button>
      ))}
    </div>
  </div>
);

export default EmptyState;
