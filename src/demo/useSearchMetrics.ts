import { useCallback, useMemo, useRef, useState } from "react";

type Metrics = {
  lastMs: number | null;
  lastCount: number | null;
  success: number;
  aborted: number;
};

export function useSearchMetrics() {
  const startRef = useRef<number | null>(null);

  const [metrics, setMetrics] = useState<Metrics>({
    lastMs: null,
    lastCount: null,
    success: 0,
    aborted: 0,
  });

  const onStart = useCallback(() => {
    startRef.current = performance.now();
  }, []);

  const onSuccess = useCallback((resultCount: number) => {
    const end = performance.now();
    const start = startRef.current;

    setMetrics((m) => ({
      lastMs: start ? Math.round(end - start) : null,
      lastCount: resultCount,
      success: m.success + 1,
      aborted: m.aborted,
    }));
  }, []);

  const onAbort = useCallback(() => {
    setMetrics((m) => ({ ...m, aborted: m.aborted + 1 }));
  }, []);

  const reset = useCallback(() => {
    setMetrics({
      lastMs: null,
      lastCount: null,
      success: 0,
      aborted: 0,
    });
  }, []);

  // optional: stable return shape
  return useMemo(
    () => ({ metrics, onStart, onSuccess, onAbort, reset }),
    [metrics, onStart, onSuccess, onAbort, reset]
  );
}
