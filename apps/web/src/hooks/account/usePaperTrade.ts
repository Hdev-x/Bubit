import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPaperAccount, placePaperOrder, cancelPaperOrder, closePaperPosition, resetPaper,
  type PaperAccount,
} from '../../api/server/paperApi';

const EMPTY: PaperAccount = { balance: 0, peakEquity: 0, positions: [], orders: [] };

/** 미체결 주문이 있는 동안만 재조회하며 늦은 조회가 주문 응답을 덮지 않게 한다. */
export function usePaperTrade(enabled = true) {
  const [account, setAccount] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const mounted = useRef(false);
  const mutating = useRef(false);

  const refetch = useCallback(async () => {
    if (!enabled || !mounted.current || mutating.current) return;
    const version = ++request.current;
    try {
      const next = await fetchPaperAccount();
      if (!mounted.current || version !== request.current) return;
      setAccount(next);
      setReady(true);
      setError(null);
    } catch {
      if (mounted.current && version === request.current) {
        setError('모의계좌를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (enabled) void Promise.resolve().then(() => { if (!cancelled) void refetch(); });
    return () => { cancelled = true; if (!mutating.current) request.current += 1; };
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled || !account.orders.length) return;
    let stopped = false;
    let timer: number;
    const poll = async () => {
      await refetch();
      if (!stopped) timer = window.setTimeout(poll, 3000);
    };
    timer = window.setTimeout(poll, 3000);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [enabled, account.orders.length, refetch]);

  const mutate = useCallback(async (operation: () => Promise<PaperAccount>) => {
    if (!enabled || !mounted.current || mutating.current) return false;
    mutating.current = true;
    const version = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      if (!mounted.current || version !== request.current) return false;
      setAccount(next);
      setReady(true);
      return true;
    } catch {
      if (mounted.current) setError('요청을 처리하지 못했습니다. 잔고와 현재가를 확인한 뒤 다시 시도해 주세요.');
      return false;
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [enabled]);

  return {
    account, ready, busy, error, refetch,
    place: (order: Parameters<typeof placePaperOrder>[0]) => mutate(() => placePaperOrder(order)),
    cancel: (id: number) => mutate(() => cancelPaperOrder(id)),
    close: (id: number) => mutate(() => closePaperPosition(id)),
    reset: () => mutate(resetPaper),
  };
}
