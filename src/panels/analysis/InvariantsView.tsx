/** P- und T-Invarianten als verständliche Formeln mit Hervorhebung im Netz. */
import { Info } from 'lucide-react';
import type { AnalysisReport } from '../../analysis/analyze';
import { setSelection, setUi } from '../../store/appStore';

const highlight = (ids: string[]) => setUi({ highlight: ids });

const nonZero = (v: number[]) => v.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);

function term(coef: number, name: string, fn: string) {
  return (
    <span className="inv-term">
      {coef !== 1 && <span className="inv-coef">{coef}·</span>}
      {fn}(<b>{name}</b>)
    </span>
  );
}

export function InvariantsView({ report }: { report: AnalysisReport }) {
  const { net, pInv, tInv } = report;
  const P = net.placeIds.length;
  const T = net.transitions.length;
  const coveredP = new Array<boolean>(P).fill(false);
  for (const v of pInv.vectors) v.forEach((x, p) => x > 0 && (coveredP[p] = true));
  const uncoveredP = net.placeNames.filter((_, p) => !coveredP[p]);
  const coveredT = new Array<boolean>(T).fill(false);
  for (const v of tInv.vectors) v.forEach((x, t) => x > 0 && (coveredT[t] = true));

  return (
    <div className="analysis-scroll" data-testid="analysis-invariants">
      <div className="panel-section">
        <div className="section-title">P-Invarianten (Erhaltungssätze)</div>
        <div className="muted small">
          Die gewichtete Summe der Marken bleibt bei jedem Schalten gleich – egal, was passiert. Typisch: „Es gibt immer genau eine Ressource“.
        </div>
        {pInv.vectors.length === 0 ? (
          <div className="callout">
            <Info size={16} />
            <span>Keine P-Invarianten – Marken können im Netz entstehen oder verschwinden.</span>
          </div>
        ) : (
          pInv.vectors.map((v, i) => {
            const ids = v.map((x, p) => (x > 0 ? net.placeIds[p] : '')).filter(Boolean);
            const constant = v.reduce((sum, x, p) => sum + x * net.initial[p], 0);
            return (
              <button
                key={i}
                type="button"
                className="inv-card"
                onMouseEnter={() => highlight(ids)}
                onMouseLeave={() => highlight([])}
                onClick={() => setSelection(ids)}
                title="Klick wählt die beteiligten Stellen aus"
                data-testid="pinv"
              >
                <span className="inv-index">P{i + 1}</span>
                <span className="inv-formula">
                  {nonZero(v).map((p, k) => (
                    <span key={p} className="inv-part">
                      {k > 0 && <span className="inv-plus">+</span>}
                      {term(v[p], net.placeNames[p], 'M')}
                    </span>
                  ))}
                  <span className="inv-eq">= {constant}</span>
                </span>
              </button>
            );
          })
        )}
        {pInv.incomplete && <div className="callout warning">Die Berechnung wurde wegen der Netzgröße abgebrochen – es kann weitere Invarianten geben.</div>}
        {pInv.vectors.length > 0 && (
          <div className={`muted small${uncoveredP.length ? '' : ' ok'}`}>
            {uncoveredP.length
              ? `Nicht überdeckt: ${uncoveredP.slice(0, 8).join(', ')}${uncoveredP.length > 8 ? ' …' : ''} – für diese Stellen garantiert keine Invariante eine Obergrenze.`
              : '✓ Alle Stellen sind überdeckt: Das Netz ist strukturell beschränkt.'}
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="section-title">T-Invarianten (Zyklen)</div>
        <div className="muted small">
          Schaltet jede Transition so oft wie angegeben, ist die Markierung danach wieder dieselbe wie vorher – das beschreibt die wiederkehrenden Abläufe des Systems.
        </div>
        {tInv.vectors.length === 0 ? (
          <div className="callout">
            <Info size={16} />
            <span>Keine T-Invarianten – das Netz kann nie zu einer früheren Markierung zurückkehren.</span>
          </div>
        ) : (
          tInv.vectors.map((v, i) => {
            const ids = v.map((x, t) => (x > 0 ? net.transitions[t].id : '')).filter(Boolean);
            return (
              <button
                key={i}
                type="button"
                className="inv-card"
                onMouseEnter={() => highlight(ids)}
                onMouseLeave={() => highlight([])}
                onClick={() => setSelection(ids)}
                title="Klick wählt die beteiligten Transitionen aus"
                data-testid="tinv"
              >
                <span className="inv-index t">T{i + 1}</span>
                <span className="inv-formula">
                  {nonZero(v).map((t, k) => (
                    <span key={t} className="inv-part">
                      {k > 0 && <span className="inv-plus">,</span>}
                      <span className="inv-term">
                        <span className="inv-coef">{v[t]}×</span>
                        <b>{net.transitions[t].name}</b>
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            );
          })
        )}
        {tInv.incomplete && <div className="callout warning">Die Berechnung wurde wegen der Netzgröße abgebrochen – es kann weitere Invarianten geben.</div>}
        {tInv.vectors.length > 0 && (
          <div className="muted small">
            {coveredT.every(Boolean) ? '✓ Alle Transitionen gehören zu einem Zyklus.' : `${coveredT.filter((c) => !c).length} Transition(en) gehören zu keinem Zyklus.`}
          </div>
        )}
      </div>
      <div className="panel-section">
        <div className="muted small">
          Test- und Inhibitorkanten verändern keine Marken und gehen nicht in die Invarianten ein. Eine T-Invariante sagt nur, dass ein Zyklus rechnerisch möglich ist –
          ob er tatsächlich schalten kann, zeigt der Zustandsgraph.
        </div>
      </div>
    </div>
  );
}
