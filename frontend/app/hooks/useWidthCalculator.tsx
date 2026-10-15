import { useEffect, useRef, useState } from "react";

const useWidthCalculator = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(800); // fallback

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        setWidth(w);
      }
    });

    resizeObserver.observe(container);

    setWidth(container.getBoundingClientRect().width);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return {
    containerRef,
    width,
  };
};

export default useWidthCalculator;
