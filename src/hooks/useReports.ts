import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createReportsBackend,
  loadAdminToken,
  saveAdminToken,
  summarize,
  type NewReport,
  type Report,
} from '../lib/reports';

export function useReports() {
  const [backend] = useState(createReportsBackend);
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const [adminToken, setAdminToken] = useState(loadAdminToken);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const isAdmin = !!adminToken && verifiedToken === adminToken;

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
      off = backend.subscribe(
        (r) => setReports((prev) => (prev.some((p) => p.id === r.id) ? prev : [r, ...prev])),
        (id) => setReports((prev) => prev.filter((p) => p.id !== id)),
      );
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

  // 저장된 관리자 토큰이 있으면 유효한지 확인
  useEffect(() => {
    if (!adminToken) return;
    let alive = true;
    backend
      .checkAdmin(adminToken)
      .then((ok) => alive && ok && setVerifiedToken(adminToken))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, adminToken]);

  const add = useCallback(
    async (r: NewReport) => {
      const rec = await backend.add(r);
      setReports((prev) => (prev.some((p) => p.id === rec.id) ? prev : [rec, ...prev]));
      return rec;
    },
    [backend],
  );

  const remove = useCallback(
    async (id: string, asAdmin = false) => {
      if (asAdmin) await backend.removeAsAdmin(id, adminToken);
      else await backend.removeOwn(id);
      setReports((prev) => prev.filter((p) => p.id !== id));
    },
    [backend, adminToken],
  );

  const loginAdmin = useCallback(
    async (token: string) => {
      const ok = await backend.checkAdmin(token);
      if (ok) {
        saveAdminToken(token);
        setAdminToken(token);
        setVerifiedToken(token);
      }
      return ok;
    },
    [backend],
  );
  const logoutAdmin = useCallback(() => {
    saveAdminToken('');
    setAdminToken('');
  }, []);

  const summaries = useMemo(() => summarize(reports, now), [reports, now]);

  return {
    reports,
    add,
    remove,
    summaries,
    status,
    mode: backend.mode,
    localReason: backend.localReason,
    now,
    isAdmin,
    /** 확인된 관리자 비밀번호 (공유톡 관리용). 관리자가 아니면 '' */
    adminToken: isAdmin ? adminToken : '',
    loginAdmin,
    logoutAdmin,
  };
}
