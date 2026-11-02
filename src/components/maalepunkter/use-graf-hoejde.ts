import { useEffect, useRef } from "react";

/** Remember the settled content height, but reserve it only during this graph's fetch. */
export function useGrafHoejde(henter: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const hoejde = useRef<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (!element || henter) return;
    const maal = () => { hoejde.current = element.getBoundingClientRect().height; };
    maal();
    const observer = new ResizeObserver(maal);
    observer.observe(element);
    return () => observer.disconnect();
  }, [henter]);
  return { ref, style: henter ? { minHeight: hoejde.current } : undefined };
}