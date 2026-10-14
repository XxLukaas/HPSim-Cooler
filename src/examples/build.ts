/**
 * Kleiner Baukasten für Beispielnetze mit sauberem Raster-Layout.
 */
import { createArc, createDoc, createPlace, createRect, createText, createTransition } from '../model/defaults';
import { addElements } from '../model/ops';
import type { ArcEl, NetDoc, PlaceEl, Point, RectEl, TextEl, TransitionEl } from '../model/types';

export class ExampleBuilder {
  doc: NetDoc;
  constructor(title: string, description: string) {
    this.doc = createDoc(title);
    this.doc.meta.description = description;
    this.doc.meta.author = 'HPSim Studio';
  }

  place(name: string, x: number, y: number, tokens = 0, patch: Partial<PlaceEl> = {}): PlaceEl {
    const el = createPlace(this.doc, { x, y }, { name, tokens, ...patch });
    if (el.capacity > 0 && patch.showCapacity === undefined) el.showCapacity = true;
    addElements(this.doc, [el]);
    return el;
  }

  /** Senkrechte Transition (Standard) */
  trans(name: string, x: number, y: number, patch: Partial<TransitionEl> = {}): TransitionEl {
    const el = createTransition(this.doc, { x, y }, { name, ...patch });
    addElements(this.doc, [el]);
    return el;
  }

  /** Waagerechte Transition */
  htrans(name: string, x: number, y: number, patch: Partial<TransitionEl> = {}): TransitionEl {
    return this.trans(name, x, y, { w: 36, h: 12, ...patch });
  }

  arc(from: { id: string }, to: { id: string }, patch: Partial<ArcEl> = {}): ArcEl {
    const el = createArc(from.id, to.id, patch);
    addElements(this.doc, [el]);
    return el;
  }

  /** Kante mit Knickpunkten */
  route(from: { id: string }, to: { id: string }, points: Point[], patch: Partial<ArcEl> = {}): ArcEl {
    return this.arc(from, to, { points, ...patch });
  }

  text(text: string, x: number, y: number, patch: Partial<TextEl> = {}): TextEl {
    const el = createText(x, y, text, { fontSize: 14, ...patch });
    addElements(this.doc, [el]);
    return el;
  }

  title(text: string, x: number, y: number): TextEl {
    return this.text(text, x, y, { fontSize: 20, bold: true });
  }

  frame(x: number, y: number, w: number, h: number, patch: Partial<RectEl> = {}): RectEl {
    const el = createRect(x, y, w, h, { shape: 'roundrect', radius: 14, dash: 'dashed', strokeWidth: 1.4, ...patch });
    // Rahmen liegen im Hintergrund
    this.doc.elements[el.id] = el;
    this.doc.order.unshift(el.id);
    return el;
  }

  done(): NetDoc {
    return this.doc;
  }
}
