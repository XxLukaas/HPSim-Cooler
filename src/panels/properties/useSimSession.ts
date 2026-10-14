/**
 * Abonniert die Simulationssitzung eines Tabs. Während die Simulation läuft,
 * wird die Aktualisierung gedrosselt (der Schnelllauf erzeugt sonst bis zu
 * 60 Neuzeichnungen pro Sekunde im Eigenschaftenbereich).
 */
import { useEffect, useState } from 'react';
import { useSim, type SimSession } from '../../store/simStore';

export function useSimSession(tabId: string | null | undefined, throttleMs = 120): SimSession | undefined {
  const read = () => (tabId ? useSim.getState().sessions[tabId] : undefined);
  const [sess, setSess] = useState<SimSession | undefined>(read);

  useEffect(() => {
    if (!tabId) {
      setSess(undefined);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const get = () => useSim.getState().sessions[tabId];
    setSess(get());
    const unsub = useSim.subscribe((st, prev) => {
      const cur = st.sessions[tabId];
      if (cur === prev.sessions[tabId]) return;
      const now = performance.now();
      if (!cur || cur.run === 'stopped' || now - last >= throttleMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        setSess(cur);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = performance.now();
          setSess(get());
        }, Math.max(16, throttleMs - (now - last)));
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [tabId, throttleMs]);

  return sess;
}
