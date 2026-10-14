import { useEffect, useRef, useState } from 'react';
import { activeTab, useApp } from '../../store/appStore';
import { useSim, type SimSession } from '../../store/simStore';

/**
 * Liefert die Simulationssitzung des aktiven Tabs. Während eines Laufs werden
 * Aktualisierungen gedrosselt (Standard: höchstens alle 120 ms), damit Tabellen
 * und Diagramme die Simulation nicht ausbremsen.
 */
export function useLiveSession(throttleMs = 120): SimSession | undefined {
  const tabId = useApp((s) => activeTab(s)?.id);
  const live = useSim((s) => (tabId ? s.sessions[tabId] : undefined));
  const [shown, setShown] = useState(live);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!live || live.run === 'stopped' || live.tabId !== shown?.tabId) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      last.current = performance.now();
      setShown(live);
      return;
    }
    const now = performance.now();
    const wait = throttleMs - (now - last.current);
    if (wait <= 0) {
      last.current = now;
      setShown(live);
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        last.current = performance.now();
        setShown(useSim.getState().sessions[live.tabId]);
      }, wait);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, throttleMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return shown;
}
