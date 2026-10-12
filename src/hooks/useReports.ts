import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createReportsBackend, summarize, type NewReport, type Report } from '../lib/reports';

export function useReports() {
  const backend = useRef(createReportsBackend()).current;
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    backend
      .list()
      .then((list) => {
        if (!alive) return;
        setReports(list);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    let off: () => void = () => {};
    try {
      off = backend.subscribe((r) => {
        setReports((prev) => (prev.some((p) => p.id === r.id) ? prev : [r, ...prev]));
      });
    } catch (e) {
      console.warn('[jamsil-lunch] 실시간 구독 실패:', e);
    }
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      alive = false;
      off();
      clearInterval(tick);
    };
  }, [backend]);

  const add = useCallback(
    async (r: NewReport) => {
      const rec = await backend.add(r);
      setReports((prev) => (prev.some((p) => p.id === rec.id) ? prev : [rec, ...prev]));
      return rec;
    },
    [backend],
  );

  const summaries = useMemo(() => summarize(reports, now), [reports, now]);

  return { reports, add, summaries, status, mode: backend.mode, localReason: backend.localReason, now };
}
