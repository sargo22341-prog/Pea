import { type ReactElement, useLayoutEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

export function SafeResponsiveContainer({ children }: { children: ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateReady = () => {
      const rect = node.getBoundingClientRect();
      setReady(rect.width > 0 && rect.height > 0);
    };

    updateReady();
    const observer = new ResizeObserver(updateReady);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full min-h-px w-full min-w-0" ref={containerRef}>
      {ready ? (
        <ResponsiveContainer height="100%" minHeight={1} minWidth={1} width="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
