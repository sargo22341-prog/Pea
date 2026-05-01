import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

type ContainerSize = {
  height: number;
  width: number;
};

export function SafeResponsiveContainer({ children }: { children: ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ContainerSize | null>(null);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const nextSize = { height: Math.round(rect.height), width: Math.round(rect.width) };
      setSize(nextSize.width > 0 && nextSize.height > 0 ? nextSize : null);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full min-h-px w-full min-w-0" ref={containerRef}>
      {size ? (
        <ResponsiveContainer height="100%" initialDimension={size} minHeight={1} minWidth={1} width="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
