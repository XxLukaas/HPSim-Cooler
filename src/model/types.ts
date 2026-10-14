/**
 * Datenmodell von HPSim Studio.
 *
 * Ein Dokument (NetDoc) enthält alle Elemente eines Petri-Netzes plus
 * dekorative Zeichenobjekte. Elemente werden über ihre ID in `elements`
 * abgelegt, `order` legt die Zeichenreihenfolge (unten → oben) fest.
 */

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zeitmodell einer Transition (wie im Original-HPSim). */
export type TimingModel = 'immediate' | 'deterministic' | 'exponential' | 'uniform';

/** Kantentyp: normale Kante, Testkante (liest nur) oder Inhibitorkante (verbietet). */
export type ArcKind = 'normal' | 'test' | 'inhibitor';

export type DashStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot';

interface BaseElement {
  id: Id;
  /** Elemente mit gleicher Gruppen-ID werden gemeinsam ausgewählt und bewegt. */
  groupId: string | null;
}

export interface PlaceEl extends BaseElement {
  type: 'place';
  name: string;
  /** Mittelpunkt */
  x: number;
  y: number;
  /** Radius in Pixel */
  r: number;
  /** Anfangsmarkierung */
  tokens: number;
  /** Kapazität, 0 = unbegrenzt */
  capacity: number;
  showName: boolean;
  showCapacity: boolean;
  /** Versatz der Namensbeschriftung relativ zum Mittelpunkt, null = automatisch */
  nameOffset: Point | null;
  capOffset: Point | null;
  color: string | null;
  note: string;
}

export interface TransitionEl extends BaseElement {
  type: 'transition';
  name: string;
  x: number;
  y: number;
  /** Breite und Höhe des Balkens */
  w: number;
  h: number;
  timing: TimingModel;
  /** Verzögerung (deterministisch), Mittelwert (exponentiell) bzw. Untergrenze (gleichverteilt) */
  delay: number;
  /** Obergrenze für die Gleichverteilung */
  delayMax: number;
  /** Priorität für die Konfliktlösung (höher gewinnt) */
  priority: number;
  showName: boolean;
  showDelay: boolean;
  nameOffset: Point | null;
  delayOffset: Point | null;
  color: string | null;
  note: string;
}

export interface ArcEl extends BaseElement {
  type: 'arc';
  source: Id;
  target: Id;
  weight: number;
  kind: ArcKind;
  /** Stützpunkte (Knickpunkte) zwischen Quelle und Ziel */
  points: Point[];
  /** Gewicht immer anzeigen (sonst nur, wenn ≠ 1) */
  showWeight: boolean;
  labelOffset: Point | null;
  color: string | null;
  note: string;
}

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  dash: DashStyle;
  fill: string;
  filled: boolean;
  opacity: number;
}

export interface RectEl extends BaseElement, ShapeStyle {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'roundrect' | 'ellipse';
  radius: number;
}

export interface LineEl extends BaseElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  dash: DashStyle;
  arrowEnd: boolean;
  arrowStart: boolean;
  opacity: number;
}

export interface PolyEl extends BaseElement, ShapeStyle {
  type: 'poly';
  points: Point[];
  closed: boolean;
}

export interface TextEl extends BaseElement {
  type: 'text';
  /** linke obere Ecke */
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  background: string | null;
}

export type NodeEl = PlaceEl | TransitionEl;
export type DecorEl = RectEl | LineEl | PolyEl | TextEl;
export type Element = PlaceEl | TransitionEl | ArcEl | DecorEl;
export type ElementType = Element['type'];

export type ConflictPolicy = 'random' | 'priority' | 'classic';
export type CapacityRule = 'strong' | 'weak';

export interface SimSettings {
  /** Zeitbasis: Simulationszeit pro Schritt */
  timeStep: number;
  /** Einheit der Zeit (nur Anzeige) */
  timeUnit: string;
  /** Automatischer Stopp bei Simulationszeit (0 = aus) */
  maxTime: number;
  /** Automatischer Stopp nach Schritten (0 = aus) */
  maxSteps: number;
  conflict: ConflictPolicy;
  capacityRule: CapacityRule;
  /** Startwert des Zufallsgenerators, null = zufällig */
  seed: number | null;
}

export interface DocSettings {
  background: string | null;
  grid: {
    visible: boolean;
    size: number;
    snapNet: boolean;
    snapDecor: boolean;
  };
  sim: SimSettings;
}

export interface DocMeta {
  title: string;
  description: string;
  author: string;
  created: string;
  modified: string;
}

export interface NetDoc {
  format: 'hpsim-studio';
  version: 1;
  meta: DocMeta;
  elements: Record<Id, Element>;
  order: Id[];
  settings: DocSettings;
}

export function isNode(el: Element | undefined): el is NodeEl {
  return !!el && (el.type === 'place' || el.type === 'transition');
}

export function isDecor(el: Element | undefined): el is DecorEl {
  return !!el && (el.type === 'rect' || el.type === 'line' || el.type === 'poly' || el.type === 'text');
}
