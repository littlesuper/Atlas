// 把 Arco 色名映射到 Tailwind 语义徽标样式（明/暗）。
// 常量表（STATUS_MAP / PRIORITY_MAP / PRODUCT_LINE_MAP / *_ROLE_MAP 等）里存的是 Arco 色名，
// shadcn 迁移后统一经此表转成 Badge 的 className。
export const badgeColorClass: Record<string, string> = {
  green: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  red: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  orange: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  orangered: 'border-transparent bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  gold: 'border-transparent bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
  lime: 'border-transparent bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-400',
  blue: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  arcoblue: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  cyan: 'border-transparent bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  purple: 'border-transparent bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  pinkpurple: 'border-transparent bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  magenta: 'border-transparent bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400',
  gray: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  default: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
};

export const arcoBadgeClass = (color?: string): string =>
  badgeColorClass[color ?? 'default'] ?? badgeColorClass.default;
