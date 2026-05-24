import type { ReactNode } from 'react';

type SelectOptionLike = {
  props?: {
    children?: ReactNode;
    value?: unknown;
  };
};

const nodeToText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }

  return '';
};

export const getSelectOptionText = (option: unknown): string =>
  nodeToText((option as SelectOptionLike | undefined)?.props?.children);

export const getSelectOptionValue = (option: unknown): unknown =>
  (option as SelectOptionLike | undefined)?.props?.value;

export const selectOptionIncludesInput = (input: string, option: unknown): boolean =>
  getSelectOptionText(option).toLowerCase().includes(input.toLowerCase());
