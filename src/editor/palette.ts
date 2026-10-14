/**
 * Farbpaletten für die Netzdarstellung. Die Zeichenfläche verwendet explizite
 * Farben (statt CSS-Variablen), damit Export (SVG/PNG) und Vorschaubilder
 * exakt gleich aussehen wie die Anzeige.
 */
export interface Palette {
  name: 'dark' | 'light';
  bg: string;
  grid: string;
  gridMajor: string;
  placeFill: string;
  placeStroke: string;
  transImmediate: string;
  transTimed: string;
  transStochastic: string;
  transStroke: string;
  arc: string;
  arcTest: string;
  arcInhibitor: string;
  token: string;
  tokenGlow: string;
  tokenText: string;
  label: string;
  labelMuted: string;
  labelBg: string;
  selection: string;
  selectionFill: string;
  enabled: string;
  ready: string;
  waiting: string;
  disabled: string;
  conflict: string;
  full: string;
  shapeStroke: string;
  text: string;
  highlight: string;
}

export const DARK: Palette = {
  name: 'dark',
  bg: '#0d1117',
  grid: 'rgba(148, 163, 184, 0.07)',
  gridMajor: 'rgba(148, 163, 184, 0.14)',
  placeFill: '#161d2b',
  placeStroke: '#9fb3d1',
  transImmediate: '#e2e8f0',
  transTimed: '#38bdf8',
  transStochastic: '#c084fc',
  transStroke: '#e2e8f0',
  arc: '#8b9ab5',
  arcTest: '#fbbf24',
  arcInhibitor: '#f87171',
  token: '#fbbf24',
  tokenGlow: 'rgba(251, 191, 36, 0.55)',
  tokenText: '#fde68a',
  label: '#dbe4f0',
  labelMuted: '#8b9ab5',
  labelBg: 'rgba(13, 17, 23, 0.72)',
  selection: '#60a5fa',
  selectionFill: 'rgba(96, 165, 250, 0.12)',
  enabled: '#34d399',
  ready: '#fbbf24',
  waiting: '#38bdf8',
  disabled: '#475569',
  conflict: '#fb923c',
  full: '#f87171',
  shapeStroke: '#64748b',
  text: '#dbe4f0',
  highlight: '#f472b6',
};

export const LIGHT: Palette = {
  name: 'light',
  bg: '#f8fafc',
  grid: 'rgba(15, 23, 42, 0.06)',
  gridMajor: 'rgba(15, 23, 42, 0.12)',
  placeFill: '#ffffff',
  placeStroke: '#1e293b',
  transImmediate: '#1e293b',
  transTimed: '#0284c7',
  transStochastic: '#9333ea',
  transStroke: '#1e293b',
  arc: '#334155',
  arcTest: '#b45309',
  arcInhibitor: '#dc2626',
  token: '#d97706',
  tokenGlow: 'rgba(217, 119, 6, 0.35)',
  tokenText: '#92400e',
  label: '#0f172a',
  labelMuted: '#64748b',
  labelBg: 'rgba(248, 250, 252, 0.8)',
  selection: '#2563eb',
  selectionFill: 'rgba(37, 99, 235, 0.1)',
  enabled: '#059669',
  ready: '#d97706',
  waiting: '#0284c7',
  disabled: '#94a3b8',
  conflict: '#ea580c',
  full: '#dc2626',
  shapeStroke: '#64748b',
  text: '#0f172a',
  highlight: '#db2777',
};

export function paletteFor(theme: 'dark' | 'light'): Palette {
  return theme === 'dark' ? DARK : LIGHT;
}

export const DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '8 5',
  dotted: '2 4',
  dashdot: '10 4 2 4',
};
