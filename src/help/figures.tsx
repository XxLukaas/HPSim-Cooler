/** Kleine Abbildungen für die Hilfe: Stellen, Transitionen und Kanten als SVG. */
import type { ReactNode } from 'react';

const C = {
  stroke: 'var(--text)',
  muted: 'var(--muted)',
  token: 'var(--token)',
  enabled: 'var(--success)',
};

export function Fig({ w, h, children, caption }: { w: number; h: number; children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="help-fig">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={typeof caption === 'string' ? caption : undefined}>
        <defs>
          <marker id="hf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" style={{ fill: C.stroke }} />
          </marker>
        </defs>
        {children}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function tokenPos(n: number, r: number): [number, number][] {
  const d = r * 0.42;
  switch (n) {
    case 1:
      return [[0, 0]];
    case 2:
      return [
        [-d, 0],
        [d, 0],
      ];
    case 3:
      return [
        [0, -d],
        [-d, d * 0.8],
        [d, d * 0.8],
      ];
    case 4:
      return [
        [-d, -d],
        [d, -d],
        [-d, d],
        [d, d],
      ];
    default:
      return [];
  }
}

export function P({ x, y, tokens = 0, label, cap, r = 18 }: { x: number; y: number; tokens?: number; label?: string; cap?: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} style={{ fill: 'var(--panel)', stroke: C.stroke }} strokeWidth={2} />
      {tokens <= 4 ? (
        tokenPos(tokens, r).map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={y + dy} r={r * 0.2} style={{ fill: C.token }} />)
      ) : (
        <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={700} style={{ fill: C.token }}>
          {tokens}
        </text>
      )}
      {label && (
        <text x={x} y={y - r - 7} textAnchor="middle" fontSize={11} style={{ fill: C.muted }}>
          {label}
        </text>
      )}
      {cap !== undefined && (
        <text x={x + r + 3} y={y + r} fontSize={10} style={{ fill: C.muted }}>
          K={cap}
        </text>
      )}
    </g>
  );
}

export function T({ x, y, label, enabled, timed, h = 40 }: { x: number; y: number; label?: string; enabled?: boolean; timed?: boolean; h?: number }) {
  return (
    <g>
      {enabled && <rect x={x - 9} y={y - h / 2 - 5} width={18} height={h + 10} rx={5} fill="none" style={{ stroke: C.enabled }} strokeWidth={2.5} />}
      <rect x={x - 5} y={y - h / 2} width={10} height={h} rx={2} style={{ fill: timed ? 'var(--accent-soft)' : C.stroke, stroke: timed ? 'var(--accent)' : 'none' }} strokeWidth={2} />
      {label && (
        <text x={x} y={y + h / 2 + 15} textAnchor="middle" fontSize={11} style={{ fill: C.muted }}>
          {label}
        </text>
      )}
    </g>
  );
}

export function A({
  x1,
  y1,
  x2,
  y2,
  w,
  kind = 'normal',
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w?: number;
  kind?: 'normal' | 'test' | 'inhibitor';
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const ex = kind === 'inhibitor' ? x2 - Math.cos(ang) * 6 : x2;
  const ey = kind === 'inhibitor' ? y2 - Math.sin(ang) * 6 : y2;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={ex}
        y2={ey}
        style={{ stroke: C.stroke }}
        strokeWidth={1.8}
        strokeDasharray={kind === 'test' ? '5 4' : undefined}
        markerEnd={kind === 'inhibitor' ? undefined : 'url(#hf-arrow)'}
      />
      {kind === 'inhibitor' && <circle cx={x2 - Math.cos(ang) * 3} cy={y2 - Math.sin(ang) * 3} r={4.5} style={{ fill: 'var(--panel)', stroke: C.stroke }} strokeWidth={1.8} />}
      {w !== undefined && w !== 1 && (
        <text x={mx} y={my - 6} textAnchor="middle" fontSize={12} fontWeight={700} style={{ fill: C.stroke }}>
          {w}
        </text>
      )}
    </g>
  );
}

/** Pfeil zwischen „vorher“ und „nachher“. */
export function Then({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M ${x - 18} ${y} L ${x + 8} ${y}`} style={{ stroke: 'var(--accent)' }} strokeWidth={3} strokeLinecap="round" />
      <path d={`M ${x + 4} ${y - 7} L ${x + 16} ${y} L ${x + 4} ${y + 7} z`} style={{ fill: 'var(--accent)' }} />
      <text x={x - 2} y={y - 10} textAnchor="middle" fontSize={10} style={{ fill: 'var(--accent)' }}>
        schaltet
      </text>
    </g>
  );
}
