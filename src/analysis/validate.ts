/**
 * „Netz prüfen“: findet typische Modellierungsfehler und gibt Hinweise.
 */
import type { Id, NetDoc } from '../model/types';

export interface Issue {
  level: 'error' | 'warning' | 'info';
  message: string;
  ids: Id[];
}

export function validateNet(doc: NetDoc): Issue[] {
  const issues: Issue[] = [];
  const degreeIn = new Map<Id, number>();
  const degreeOut = new Map<Id, number>();
  const names = new Map<string, Id[]>();
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'arc') {
      degreeOut.set(el.source, (degreeOut.get(el.source) ?? 0) + 1);
      degreeIn.set(el.target, (degreeIn.get(el.target) ?? 0) + 1);
    }
  }
  let places = 0;
  let transitions = 0;
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    if (el.type === 'place' || el.type === 'transition') {
      const key = el.name.trim();
      if (!key) {
        issues.push({ level: 'warning', message: `Ein${el.type === 'place' ? 'e Stelle' : 'e Transition'} hat keinen Namen.`, ids: [id] });
      } else {
        names.set(key, [...(names.get(key) ?? []), id]);
      }
      const din = degreeIn.get(id) ?? 0;
      const dout = degreeOut.get(id) ?? 0;
      if (din + dout === 0) {
        issues.push({
          level: 'warning',
          message: `„${el.name}“ ist mit nichts verbunden.`,
          ids: [id],
        });
      }
    }
    if (el.type === 'place') {
      places++;
      if (el.capacity > 0 && el.tokens > el.capacity) {
        issues.push({
          level: 'error',
          message: `Stelle „${el.name}“ enthält ${el.tokens} Marken, ihre Kapazität ist aber nur ${el.capacity}.`,
          ids: [id],
        });
      }
    }
    if (el.type === 'transition') {
      transitions++;
      const din = doc.order.some((aid) => {
        const a = doc.elements[aid];
        return a?.type === 'arc' && a.target === id && a.kind === 'normal';
      });
      const anyIn = degreeIn.get(id) ?? 0;
      if (anyIn === 0 && (degreeOut.get(id) ?? 0) > 0) {
        issues.push({
          level: 'info',
          message: `Transition „${el.name}“ hat keine Eingänge und ist damit immer aktiviert (Quelle). Das Netz kann dadurch unbeschränkt wachsen.`,
          ids: [id],
        });
      } else if (!din && anyIn > 0) {
        issues.push({
          level: 'info',
          message: `Transition „${el.name}“ hat nur Test-/Inhibitorkanten als Eingang und verbraucht keine Marken.`,
          ids: [id],
        });
      }
      if ((degreeOut.get(id) ?? 0) === 0 && anyIn > 0) {
        issues.push({
          level: 'info',
          message: `Transition „${el.name}“ hat keine Ausgänge – Marken verschwinden beim Schalten (Senke).`,
          ids: [id],
        });
      }
      if (el.timing === 'uniform' && el.delayMax < el.delay) {
        issues.push({
          level: 'warning',
          message: `Bei „${el.name}“ ist die Obergrenze (${el.delayMax}) kleiner als die Untergrenze (${el.delay}) der Gleichverteilung.`,
          ids: [id],
        });
      }
      if (el.timing === 'exponential' && el.delay <= 0) {
        issues.push({
          level: 'warning',
          message: `Bei „${el.name}“ ist der Mittelwert der Exponentialverteilung 0 – die Transition verhält sich wie „sofort“.`,
          ids: [id],
        });
      }
    }
    if (el.type === 'arc') {
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      if (!s || !t) {
        issues.push({ level: 'error', message: 'Eine Kante verweist auf ein gelöschtes Element.', ids: [id] });
      } else if (el.kind !== 'normal' && s.type !== 'place') {
        issues.push({ level: 'error', message: 'Test- und Inhibitorkanten müssen von einer Stelle zu einer Transition führen.', ids: [id] });
      }
    }
  }
  for (const [name, ids] of names) {
    if (ids.length > 1) {
      issues.push({ level: 'warning', message: `Der Name „${name}“ wird ${ids.length}-mal verwendet.`, ids });
    }
  }
  if (places === 0 && transitions === 0) {
    issues.push({ level: 'info', message: 'Das Netz ist noch leer. Lege Stellen und Transitionen an und verbinde sie mit Kanten.', ids: [] });
  }
  return issues;
}
