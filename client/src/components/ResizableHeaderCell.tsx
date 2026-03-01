import React, { useCallback, useRef } from 'react';

interface ResizableHeaderCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  onResize?: (key: string, width: number) => void;
  /** Keys of columns that should NOT be resizable (e.g. checkbox, drag, actions) */
  fixedKeys?: Set<string>;
}

const MIN_WIDTH = 40;

const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
  onResize,
  fixedKeys,
  children,
  style,
  ...rest
}) => {
  const thRef = useRef<HTMLTableCellElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const columnKey = (rest as Record<string, unknown>)['data-column-key'] as string | undefined;
  const isResizable = !!columnKey && !!onResize && !(fixedKeys?.has(columnKey));

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!thRef.current || !columnKey || !onResize) return;

    startXRef.current = e.clientX;
    startWidthRef.current = thRef.current.getBoundingClientRect().width;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      const newWidth = Math.max(MIN_WIDTH, startWidthRef.current + delta);
      onResize(columnKey, newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [columnKey, onResize]);

  return (
    <th
      ref={thRef}
      {...rest}
      style={{ ...style, ...(isResizable ? { position: 'relative' as const } : {}) }}
    >
      {children}
      {isResizable && (
        <div
          className="column-resize-handle"
          onMouseDown={handleMouseDown}
        />
      )}
    </th>
  );
};

export default ResizableHeaderCell;
