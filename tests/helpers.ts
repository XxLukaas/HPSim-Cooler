import { createArc, createDoc, createPlace, createTransition } from '../src/model/defaults';
import { addElements } from '../src/model/ops';
import type { ArcEl, NetDoc, PlaceEl, TransitionEl } from '../src/model/types';

/**
 * Kleiner Baukasten für Testnetze:
 *   const b = new NetBuilder();
 *   b.place('P1', 1); b.trans('T1'); b.arc('P1', 'T1');
 */
export class NetBuilder {
  doc: NetDoc = createDoc('Test');
  private byName = new Map<string, PlaceEl | TransitionEl>();

  place(name: string, tokens = 0, capacity = 0): this {
    const p = createPlace(this.doc, { x: 0, y: 0 }, { name, tokens, capacity });
    addElements(this.doc, [p]);
    this.byName.set(name, p);
    return this;
  }

  trans(name: string, patch: Partial<TransitionEl> = {}): this {
    const t = createTransition(this.doc, { x: 0, y: 0 }, { name, ...patch });
    addElements(this.doc, [t]);
    this.byName.set(name, t);
    return this;
  }

  arc(from: string, to: string, weight = 1, kind: ArcEl['kind'] = 'normal'): this {
    const s = this.byName.get(from)!;
    const t = this.byName.get(to)!;
    addElements(this.doc, [createArc(s.id, t.id, { weight, kind })]);
    return this;
  }

  id(name: string): string {
    return this.byName.get(name)!.id;
  }
}
