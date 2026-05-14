import { useLayoutEffect, useState, type RefObject } from "react";

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ height: 0, width: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ height: Math.round(rect.height), width: Math.round(rect.width) });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
