/**
 * Legende der grafischen Notation – gezeichnet mit derselben Farbpalette wie
 * die Zeichenfläche, damit Symbole und Netz exakt übereinstimmen.
 */
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Palette } from '../../editor/palette';
import { ArcGlyph, CollapsibleSection, PlaceGlyph, TransGlyph } from './widgets';

function Row({ symbol, title, children }: { symbol: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="pp-legend-row">
      <span className="pp-legend-symbol">{symbol}</span>
      <span className="pp-legend-text">
        <b>{title}</b>
        <span>{children}</span>
      </span>
    </li>
  );
}

function SimStateGlyph({ p, kind }: { p: Palette; kind: 'enabled' | 'waiting' }) {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <rect x={6} y={1.5} width={16} height={25} rx={4} fill="none" stroke={kind === 'enabled' ? p.enabled : p.waiting} strokeWidth={2} opacity={0.85} />
      <rect x={10} y={3} width={8} height={22} rx={2} fill={p.placeFill} stroke={p.transTimed} strokeWidth={1.8} />
      {kind === 'waiting' && <rect x={11.5} y={13} width={5} height={10.5} fill={p.waiting} opacity={0.85} />}
    </svg>
  );
}

function FullPlaceGlyph({ p }: { p: Palette }) {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx={14} cy={14} r={10} fill={p.placeFill} stroke={p.full} strokeWidth={2.4} />
      <circle cx={10.5} cy={14} r={2.3} fill={p.token} />
      <circle cx={17.5} cy={14} r={2.3} fill={p.token} />
    </svg>
  );
}

export function Legend({ p, withSim = true }: { p: Palette; withSim?: boolean }) {
  return (
    <CollapsibleSection id="legend" title="Legende – so liest du das Netz" icon={<BookOpen size={13} />}>
      <ul className="pp-legend" data-testid="prop-legend">
        <Row symbol={<PlaceGlyph p={p} />} title="Stelle">
          Ein Zustand oder Vorrat, z. B. „Lager“ oder „Maschine frei“.
        </Row>
        <Row symbol={<PlaceGlyph p={p} tokens={3} />} title="Marken">
          Die Punkte in einer Stelle – sie zählen Dinge oder Ressourcen.
        </Row>
        <Row symbol={<TransGlyph p={p} timing="immediate" />} title="Sofortige Transition">
          Gefüllter Balken: schaltet ohne Wartezeit, sobald sie aktiviert ist.
        </Row>
        <Row symbol={<TransGlyph p={p} timing="deterministic" />} title="Zeitbehaftete Transition">
          Blau umrandet: schaltet nach einer festen Verzögerung.
        </Row>
        <Row symbol={<TransGlyph p={p} timing="exponential" />} title="Stochastische Transition">
          Violett: Die Wartezeit ist zufällig (exponentiell oder gleichverteilt).
        </Row>
        <Row symbol={<ArcGlyph p={p} kind="normal" width={30} />} title="Normale Kante">
          Pfeil: nimmt bzw. legt beim Schalten so viele Marken, wie das Gewicht angibt.
        </Row>
        <Row symbol={<ArcGlyph p={p} kind="test" width={30} />} title="Testkante">
          Gestrichelt mit hohler Spitze: prüft nur, ob genug Marken da sind.
        </Row>
        <Row symbol={<ArcGlyph p={p} kind="inhibitor" width={30} />} title="Inhibitorkante">
          Kreis am Ende: verbietet das Schalten, solange die Stelle zu viele Marken hat.
        </Row>
        <Row symbol={<FullPlaceGlyph p={p} />} title="Kapazität erreicht">
          Rot umrandet: Die Stelle ist voll und nimmt keine weiteren Marken auf.
        </Row>
        {withSim && (
          <>
            <Row symbol={<SimStateGlyph p={p} kind="enabled" />} title="Aktiviert (Simulation)">
              Grüner Rahmen: Die Transition kann schalten.
            </Row>
            <Row symbol={<SimStateGlyph p={p} kind="waiting" />} title="Wartet (Simulation)">
              Blauer Füllstand: Die Verzögerung läuft gerade ab.
            </Row>
          </>
        )}
      </ul>
    </CollapsibleSection>
  );
}
