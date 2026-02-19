import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState, useRef } from 'react';

/**
 * 测试拖拽排序逻辑。
 *
 * ProjectDetail 组件依赖过多（router / API / store / Arco Table 等），
 * 因此这里用一个轻量的 Harness 组件来精确复刻拖拽状态机：
 *   mousedown（手柄）→ mousemove（行）→ mouseup（行）
 *   验证：源行高亮、目标线指示、排序结果。
 *
 * 使用 ref + forceRender 模式（与生产代码一致），确保首次 mousemove
 * 即可正确渲染 drag-source 和 drag-insert-* class。
 */

// ========== 复用 Detail/index.tsx 中的拖拽核心逻辑 ==========

interface Item {
  id: string;
  name: string;
  sortOrder: number;
}

function DragHarness({
  items: initialItems,
  onReorder,
}: {
  items: Item[];
  onReorder: (items: Item[]) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const dragIndexRef = useRef(-1);
  const isDraggingRef = useRef(false);
  const dragFromRef = useRef(-1);
  const dragOverRef = useRef(-1);
  const [, forceRender] = useState(0);

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragIndexRef.current = index;
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (dragIndexRef.current === -1) return;
    e.preventDefault();
    let needRender = false;
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      dragFromRef.current = dragIndexRef.current;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      needRender = true;
    }
    if (dragOverRef.current !== index) {
      dragOverRef.current = index;
      needRender = true;
    }
    if (needRender) forceRender((n) => n + 1);
  };

  const resetDragState = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isDraggingRef.current = false;
    dragFromRef.current = -1;
    dragOverRef.current = -1;
    dragIndexRef.current = -1;
    forceRender((n) => n + 1);
  };

  const handleMouseUp = (e: React.MouseEvent, targetIndex: number) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      dragIndexRef.current = -1;
      return;
    }
    const fromIndex = dragIndexRef.current;
    resetDragState();

    if (fromIndex === -1 || fromIndex === targetIndex) return;

    const newList = [...items];
    const [removed] = newList.splice(fromIndex, 1);
    newList.splice(targetIndex, 0, removed);
    const reordered = newList.map((a, i) => ({ ...a, sortOrder: (i + 1) * 10 }));
    setItems(reordered);
    onReorder(reordered);
  };

  return (
    <table data-testid="drag-table">
      <tbody>
        {items.map((item, index) => {
          const isSource = dragFromRef.current === index;
          const isTarget = dragOverRef.current === index && dragOverRef.current !== dragFromRef.current;
          const insertAbove = isTarget && dragFromRef.current > index;
          const insertBelow = isTarget && dragFromRef.current < index;
          const cls = [
            isSource ? 'drag-source' : '',
            insertAbove ? 'drag-insert-above' : '',
            insertBelow ? 'drag-insert-below' : '',
          ].filter(Boolean).join(' ');
          return (
            <tr
              key={item.id}
              data-testid={`row-${index}`}
              className={cls}
              onMouseMove={(e) => handleMouseMove(e, index)}
              onMouseUp={(e) => handleMouseUp(e, index)}
            >
              <td>
                <div
                  data-testid={`handle-${index}`}
                  onMouseDown={(e) => handleMouseDown(e, index)}
                  style={{ cursor: 'grab', userSelect: 'none' }}
                >
                  ⠿
                </div>
              </td>
              <td data-testid={`name-${index}`}>{item.name}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ========== 测试用例 ==========

const ITEMS: Item[] = [
  { id: '1', name: '活动A', sortOrder: 10 },
  { id: '2', name: '活动B', sortOrder: 20 },
  { id: '3', name: '活动C', sortOrder: 30 },
  { id: '4', name: '活动D', sortOrder: 40 },
];

describe('拖拽排序交互', () => {
  let onReorder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onReorder = vi.fn();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('渲染所有行', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);
    expect(screen.getByTestId('name-0')).toHaveTextContent('活动A');
    expect(screen.getByTestId('name-1')).toHaveTextContent('活动B');
    expect(screen.getByTestId('name-2')).toHaveTextContent('活动C');
    expect(screen.getByTestId('name-3')).toHaveTextContent('活动D');
  });

  it('mousedown 不触发拖拽（无 mousemove 时不进入拖拽状态）', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);
    fireEvent.mouseDown(screen.getByTestId('handle-1'));

    // 没有进入拖拽状态：无源行高亮
    expect(screen.getByTestId('row-1')).not.toHaveClass('drag-source');
    expect(document.body.style.cursor).toBe('');
  });

  it('mousedown + mousemove 进入拖拽状态：源行高亮 + grabbing 光标', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    // mousedown on handle of row 1
    fireEvent.mouseDown(screen.getByTestId('handle-1'));

    // mousemove to row 2 → 进入拖拽
    fireEvent.mouseMove(screen.getByTestId('row-2'));

    // 源行应有 drag-source class
    expect(screen.getByTestId('row-1')).toHaveClass('drag-source');
    // 目标行应有 drag-insert-below（从 index 1 拖到 index 2，向下）
    expect(screen.getByTestId('row-2')).toHaveClass('drag-insert-below');
    // body cursor 应为 grabbing
    expect(document.body.style.cursor).toBe('grabbing');
    // body userSelect 应为 none
    expect(document.body.style.userSelect).toBe('none');
  });

  it('mousedown on handle + mousemove + mouseup 在同一行 → 不排序', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    fireEvent.mouseDown(screen.getByTestId('handle-1'));
    fireEvent.mouseMove(screen.getByTestId('row-1'));
    fireEvent.mouseUp(screen.getByTestId('row-1'));

    // 未触发排序
    expect(onReorder).not.toHaveBeenCalled();
    // 状态已重置
    expect(document.body.style.cursor).toBe('');
  });

  it('mouseup 无 mousedown → 不触发排序', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    fireEvent.mouseUp(screen.getByTestId('row-2'));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('向下拖拽：A(0) → C(2) → 顺序变为 B C A D', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    // mousedown on row 0 handle
    fireEvent.mouseDown(screen.getByTestId('handle-0'));
    // mousemove to row 2
    fireEvent.mouseMove(screen.getByTestId('row-2'));

    // 源行高亮
    expect(screen.getByTestId('row-0')).toHaveClass('drag-source');
    // 目标在下方，显示 insert-below
    expect(screen.getByTestId('row-2')).toHaveClass('drag-insert-below');

    // mouseup on row 2 → 完成排序
    fireEvent.mouseUp(screen.getByTestId('row-2'));

    // 检查排序结果：B C A D → 从 [A,B,C,D] 移除 A，插入到 index 2
    expect(onReorder).toHaveBeenCalledTimes(1);
    const result = onReorder.mock.calls[0][0] as Item[];
    expect(result.map((i: Item) => i.name)).toEqual(['活动B', '活动C', '活动A', '活动D']);
    expect(result[0].sortOrder).toBe(10);
    expect(result[1].sortOrder).toBe(20);
    expect(result[2].sortOrder).toBe(30);
    expect(result[3].sortOrder).toBe(40);

    // 状态已重置
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('向上拖拽：D(3) → B(1) → 顺序变为 A D B C', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    fireEvent.mouseDown(screen.getByTestId('handle-3'));
    fireEvent.mouseMove(screen.getByTestId('row-1'));

    // 源行高亮
    expect(screen.getByTestId('row-3')).toHaveClass('drag-source');
    // 目标在上方，显示 insert-above
    expect(screen.getByTestId('row-1')).toHaveClass('drag-insert-above');

    fireEvent.mouseUp(screen.getByTestId('row-1'));

    const result = onReorder.mock.calls[0][0] as Item[];
    expect(result.map((i: Item) => i.name)).toEqual(['活动A', '活动D', '活动B', '活动C']);
  });

  it('拖拽过程中 mousemove 经过多行 → 插入线跟随最后 hover 的行', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    fireEvent.mouseDown(screen.getByTestId('handle-0'));
    // 先 hover row 1
    fireEvent.mouseMove(screen.getByTestId('row-1'));
    expect(screen.getByTestId('row-1')).toHaveClass('drag-insert-below');

    // 再 hover row 3
    fireEvent.mouseMove(screen.getByTestId('row-3'));
    expect(screen.getByTestId('row-3')).toHaveClass('drag-insert-below');
    // row 1 不应再有插入线
    expect(screen.getByTestId('row-1')).not.toHaveClass('drag-insert-below');
    expect(screen.getByTestId('row-1')).not.toHaveClass('drag-insert-above');

    // 最终放在 row 3
    fireEvent.mouseUp(screen.getByTestId('row-3'));
    const result = onReorder.mock.calls[0][0] as Item[];
    expect(result.map((i: Item) => i.name)).toEqual(['活动B', '活动C', '活动D', '活动A']);
  });

  it('不点手柄直接在行上 mousemove → 不进入拖拽', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    // 直接在行上 mousemove，没有先 mousedown 手柄
    fireEvent.mouseMove(screen.getByTestId('row-1'));
    fireEvent.mouseMove(screen.getByTestId('row-2'));

    expect(screen.getByTestId('row-1')).not.toHaveClass('drag-source');
    expect(document.body.style.cursor).toBe('');
  });

  it('手柄有 cursor:grab 和 userSelect:none 样式', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);
    const handle = screen.getByTestId('handle-0');
    expect(handle).toHaveStyle({ cursor: 'grab', userSelect: 'none' });
  });

  it('mousedown 调用 preventDefault 阻止文本选择', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);
    const handle = screen.getByTestId('handle-0');

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    handle.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('拖拽完成后 class 全部清除', () => {
    render(<DragHarness items={ITEMS} onReorder={onReorder} />);

    fireEvent.mouseDown(screen.getByTestId('handle-0'));
    fireEvent.mouseMove(screen.getByTestId('row-2'));

    // 拖拽中有 class
    expect(screen.getByTestId('row-0')).toHaveClass('drag-source');
    expect(screen.getByTestId('row-2')).toHaveClass('drag-insert-below');

    // 松手完成
    fireEvent.mouseUp(screen.getByTestId('row-2'));

    // 所有行 class 应清除
    const rows = screen.getAllByTestId(/^row-/);
    rows.forEach((row) => {
      expect(row).not.toHaveClass('drag-source');
      expect(row).not.toHaveClass('drag-insert-above');
      expect(row).not.toHaveClass('drag-insert-below');
    });
  });
});
