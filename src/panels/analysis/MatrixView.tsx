/** Vorbereichs-, Nachbereichs- und Inzidenzmatrix als Tabelle. */
import { Copy, FileText } from 'lucide-react';
import { useState } from 'react';
import type { AnalysisReport } from '../../analysis/analyze';
import { runAction } from '../../app/actions';
import { Segmented } from '../../components/ui';
import { setUi, toast } from '../../store/appStore';

type Which = 'c' | 'pre' | 'post' | 'test' | 'inhibitor';

const INFO: Record<Which, { label: string; text: string }> = {
  c: { label: 'Inzidenz C', text: 'C = Post − Pre: Wie verändert das Schalten einer Transition (Spalte) die Marken einer Stelle (Zeile)?' },
  pre: { label: 'Pre (W⁻)', text: 'Wie viele Marken verbraucht eine Transition (Spalte) beim Schalten aus jeder Stelle (Zeile)?' },
  post: { label: 'Post (W⁺)', text: 'Wie viele Marken erzeugt eine Transition (Spalte) beim Schalten in jeder Stelle (Zeile)?' },
  test: { label: 'Test', text: 'Testkanten: Mindestanzahl an Marken, die vorhanden sein muss – sie wird nicht verbraucht.' },
  inhibitor: { label: 'Inhibitor', text: 'Inhibitorkanten: Die Transition kann nur schalten, wenn die Stelle weniger Marken enthält als angegeben.' },
};

export function MatrixView({ report }: { report: AnalysisReport }) {
  const { net, matrices } = report;
  const hasTest = matrices.test.some((r) => r.some((v) => v !== 0));
  const hasInh = matrices.inhibitor.some((r) => r.some((v) => v !== 0));
  const [which, setWhich] = useState<Which>('c');
  const [hover, setHover] = useState<{ p: number | null; t: number | null }>({ p: null, t: null });
  const m = matrices[which];
  const options = (['c', 'pre', 'post', 'test', 'inhibitor'] as Which[])
    .filter((w) => (w === 'test' ? hasTest : w === 'inhibitor' ? hasInh : true))
    .map((w) => ({ value: w, label: INFO[w].label }));

  const enter = (p: number | null, t: number | null) => {
    setHover({ p, t });
    const ids: string[] = [];
    if (p !== null) ids.push(net.placeIds[p]);
    if (t !== null) ids.push(net.transitions[t].id);
    setUi({ highlight: ids });
  };
  const leave = () => {
    setHover({ p: null, t: null });
    setUi({ highlight: [] });
  };

  const copyCsv = async () => {
    const head = ['', ...net.transitions.map((t) => t.name)].join(';');
    const rows = m.map((row, p) => [net.placeNames[p], ...row].join(';'));
    try {
      await navigator.clipboard.writeText([head, ...rows].join('\n'));
      toast('success', 'Matrix kopiert', 'Als Tabelle (mit Semikolon getrennt) in der Zwischenablage – z. B. in Excel einfügen.');
    } catch {
      toast('error', 'Kopieren nicht möglich', 'Der Browser hat den Zugriff auf die Zwischenablage verweigert.');
    }
  };

  if (!net.placeIds.length || !net.transitions.length) {
    return <div className="empty-state">Für Matrizen braucht das Netz mindestens eine Stelle und eine Transition.</div>;
  }

  return (
    <div className="matrixview" data-testid="analysis-matrix">
      <div className="matrix-bar">
        <Segmented value={which} options={options} onChange={setWhich} />
      </div>
      <div className="muted small matrix-info">{INFO[which].text}</div>
      <div className="matrix-scroll">
        <table className="matrix" onMouseLeave={leave}>
          <thead>
            <tr>
              <th className="corner" />
              {net.transitions.map((t, i) => (
                <th key={t.id} className={hover.t === i ? 'hl' : ''} onMouseEnter={() => enter(null, i)} title={t.name}>
                  <span className="vert">{t.name}</span>
                </th>
              ))}
              {which === 'c' && (
                <th className="m0" title="Anfangsmarkierung">
                  M₀
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {m.map((row, p) => (
              <tr key={p}>
                <th className={hover.p === p ? 'hl' : ''} onMouseEnter={() => enter(p, null)} title={net.placeNames[p]}>
                  {net.placeNames[p]}
                </th>
                {row.map((v, t) => (
                  <td
                    key={t}
                    className={`${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}${hover.p === p || hover.t === t ? ' cross' : ''}`}
                    onMouseEnter={() => enter(p, t)}
                  >
                    {v === 0 ? '·' : v > 0 && which === 'c' ? `+${v}` : v}
                  </td>
                ))}
                {which === 'c' && <td className="m0">{net.initial[p]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="matrix-actions">
        <button type="button" className="btn sm" onClick={copyCsv}>
          <Copy size={13} /> Als Tabelle kopieren
        </button>
        <button type="button" className="btn sm ghost" onClick={() => runAction('file.exportText')} title="Textexport im Format des Original-HPSim („Export Net“)">
          <FileText size={13} /> Textexport (HPSim 1.1)
        </button>
      </div>
    </div>
  );
}
