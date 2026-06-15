import React from 'react';
import { Bot } from 'lucide-react';

const EXAMPLES = [
  '把项目甲的硬件打样推迟两周',
  '把项目甲优先级改成高',
  '给项目甲加一条高风险：电源散热',
  '项目甲现在有几个高风险？',
];

/** 空态问候（图标 + 标题 + 副标题）；示例 chips 拆到 ExampleChips，便于排在输入框下方 */
const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center text-center">
    <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
      <Bot className="size-6" />
    </div>
    <h2 className="mt-4 text-xl font-semibold">用一句话使用系统</h2>
    <p className="text-muted-foreground mt-1 text-sm">排期、项目字段、风险项——直接说，AI 帮你理解并预览，确认后才写入</p>
  </div>
);

/** 示例提示：轻量小标签，点击仅「填入输入框」（含「项目甲」等占位，需改成真实项目后再发送），不直接发起对话 */
export const ExampleChips: React.FC<{ onPick: (text: string) => void }> = ({ onPick }) => (
  <div className="flex flex-wrap justify-center gap-1.5">
    {EXAMPLES.map((ex) => (
      <button
        key={ex}
        type="button"
        onClick={() => onPick(ex)}
        title="点击填入输入框后可修改再发送"
        className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full border px-2.5 py-1 text-xs transition-colors"
      >
        {ex}
      </button>
    ))}
  </div>
);

export default EmptyState;
