/**
 * Kleine Symbole für Explorer-Zeilen – im selben Bildstil wie die Zeichenfläche
 * (Farben aus der Netzpalette), damit man Stellen, Transitionen und Kanten
 * sofort wiedererkennt.
 */
import { Circle, Hexagon, Minus, MoveRight, Spline, Square, Type } from 'lucide-react';
import { memo } from 'react';
import type { Palette } from '../../editor/palette';
import type { ArcKind, TimingModel } from '../../model/types';
import type { DrawingShape } from './model';

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%deg]+\)|[a-z]{3,20})$/i;

/** Nur unbedenkliche Farbwerte durchlassen (Daten können aus fremden Dateien stammen). */
export function safeColor(c: string | null | undefined, fallback: string): string {
  return c && SAFE_COLOR.test(c.trim()) ? c.trim() : fallback;
}

export function timingColor(p: Palette, timing: TimingModel): string {
  if (timing === 'deterministic') return p.transTimed;
  if (timing === 'exponential' || timing === 'uniform') return p.transStochastic;
  return p.transImmediate;
}

export function arcColor(p: Palette, kind: ArcKind): string {
  return kind === 'inhibitor' ? p.arcInhibitor : kind === 'test' ? p.arcTest : p.arc;
}

export const PlaceGlyph = memo(function PlaceGlyph({ p, color, marked, size = 16 }: { p: Palette; color: string | null; marked: boolean; size?: number }) {
  const stroke = safeColor(color, p.placeStroke);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="ex-glyph">
      <circle cx="8" cy="8" r="6" fill={p.placeFill} stroke={stroke} strokeWidth="1.6" />
      {marked && <circle cx="8" cy="8" r="2.4" fill={p.token} />}
    </svg>
  );
});

export const TransitionGlyph = memo(function TransitionGlyph({ p, color, timing, size = 16 }: { p: Palette; color: string | null; timing: TimingModel; size?: number }) {
  const fill = safeColor(color, timingColor(p, timing));
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="ex-glyph">
      <rect x="5.5" y="1.5" width="5" height="13" rx="1" fill={fill} stroke={p.transStroke} strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
});

export const ArcGlyph = memo(function ArcGlyph({ p, kind, color, broken, size = 16 }: { p: Palette; kind: ArcKind; color: string | null; broken?: boolean; size?: number }) {
  const c = broken ? p.full : safeColor(color, arcColor(p, kind));
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="ex-glyph">
      {kind === 'inhibitor' ? (
        <>
          <line x1="1.5" y1="8" x2="9.6" y2="8" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="8" r="2.6" fill={p.placeFill} stroke={c} strokeWidth="1.5" />
        </>
      ) : (
        <>
          <line x1="1.5" y1="8" x2="10" y2="8" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={kind === 'test' ? '2.6 2' : undefined} />
          <polygon points="14.5,8 9.5,4.8 9.5,11.2" fill={kind === 'test' ? p.placeFill : c} stroke={c} strokeWidth="1.1" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
});

export function DrawingGlyph({ shape, size = 15 }: { shape: DrawingShape; size?: number }) {
  const props = { size, className: 'ex-glyph ex-glyph-muted', 'aria-hidden': true } as const;
  switch (shape) {
    case 'ellipse':
      return <Circle {...props} />;
    case 'line':
      return <Minus {...props} style={{ transform: 'rotate(-35deg)' }} />;
    case 'arrow':
      return <MoveRight {...props} />;
    case 'polyline':
      return <Spline {...props} />;
    case 'polygon':
      return <Hexagon {...props} />;
    case 'text':
      return <Type {...props} />;
    case 'rect':
      return <Square {...props} style={{ borderRadius: 0 }} />;
    case 'roundrect':
    default:
      return <Square {...props} />;
  }
}
