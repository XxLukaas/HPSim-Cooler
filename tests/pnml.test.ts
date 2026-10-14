import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { exportPnml, importPnml, PnmlFormatError, pnmlExportNotes } from '../src/io/pnml';
import { parseXml, pathText } from '../src/io/xml';
import { compileNet } from '../src/sim/engine';
import type { NetDoc } from '../src/model/types';

const build = (id: string) => EXAMPLES.find((e) => e.id === id)!.build();

function signature(doc: NetDoc) {
  const net = compileNet(doc);
  const byName = (i: number) => net.placeNames[i];
  return {
    places: net.placeNames.map((n, i) => `${n}:${net.initial[i]}:${net.capacity[i]}`).sort(),
    transitions: net.transitions
      .map((t) => {
        const ins = t.inputs.map((a) => `${byName(a.place)}*${a.weight}/${a.kind}`).sort().join(',');
        const outs = t.outputs.map((a) => `${byName(a.place)}*${a.weight}`).sort().join(',');
        return `${t.name}|${t.timing}|${t.delay}|${t.priority}|${ins}|${outs}`;
      })
      .sort(),
  };
}

describe('XML-Parser', () => {
  it('liest Elemente, Attribute, Entities, CDATA und Namensräume', () => {
    const root = parseXml(`<?xml version="1.0"?><!-- Kommentar --><!DOCTYPE x [<!ENTITY a "b">]>
      <p:root xmlns:p="urn:x" a="1 &amp; 2"><p:item id='i1'>A &lt; B</p:item><item><![CDATA[<roh>]]></item><leer/></p:root>`);
    const r = root.children[0];
    expect(r.name).toBe('root');
    expect(r.attrs.a).toBe('1 & 2');
    expect(r.children.map((c) => c.name)).toEqual(['item', 'item', 'leer']);
    expect(r.children[0].attrs.id).toBe('i1');
    expect(r.children[0].text).toBe('A < B');
    expect(r.children[1].text).toBe('<roh>');
    expect(pathText(root, 'root', 'item')).toBe('A < B');
  });

  it('ist tolerant gegenüber falsch verschachtelten Tags', () => {
    const root = parseXml('<a><b><c>x</b><d/></a>');
    expect(root.children[0].children[0].name).toBe('b');
    expect(root.children[0].children.map((c) => c.name)).toEqual(['b', 'd']);
  });
});

describe('PNML', () => {
  it.each(['erstes-netz', 'test-inhibitor', 'getraenkeautomat', 'fertigung', 'original-zeitverhalten'])('Rundlauf ohne Verlust: %s', (id) => {
    const doc = build(id);
    const xml = exportPnml(doc);
    const back = importPnml(xml).doc;
    expect(signature(back)).toEqual(signature(doc));
    expect(back.meta.title).toBe(doc.meta.title);
    expect(back.settings.sim).toEqual(doc.settings.sim);
    // Positionen bleiben erhalten
    const pos = (d: NetDoc) =>
      d.order
        .map((i) => d.elements[i])
        .filter((e) => e.type === 'place' || e.type === 'transition')
        .map((e) => `${'name' in e ? e.name : ''}@${Math.round((e as { x: number }).x)},${Math.round((e as { y: number }).y)}`)
        .sort();
    expect(pos(back)).toEqual(pos(doc));
    // Zeichenobjekte kommen mit
    const decor = (d: NetDoc) => d.order.filter((i) => !['place', 'transition', 'arc'].includes(d.elements[i].type)).length;
    expect(decor(back)).toBe(decor(doc));
  });

  it('erzeugt standardkonformes PNML für P/T-Netze', () => {
    const xml = exportPnml(build('mutex'));
    const root = parseXml(xml);
    const net = root.children[0].children[0];
    expect(net.attrs.type).toBe('http://www.pnml.org/version-2009/grammar/ptnet');
    const page = net.children.find((c) => c.name === 'page')!;
    expect(page.children.filter((c) => c.name === 'place')).toHaveLength(5);
    expect(page.children.filter((c) => c.name === 'transition')).toHaveLength(4);
    expect(page.children.filter((c) => c.name === 'arc')).toHaveLength(12);
  });

  it('meldet Sonderfunktionen, die der Standard nicht kennt', () => {
    expect(pnmlExportNotes(build('mutex'))).toEqual([]);
    expect(pnmlExportNotes(build('test-inhibitor')).join(' ')).toMatch(/Inhibitor/);
  });

  it('liest PNML anderer Werkzeuge (PIPE-Stil mit Kapazität, Inhibitor, Rate)', () => {
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<pnml><net id="Net-One" type="P/T net">
  <place id="P0"><graphics><position x="105.0" y="120.0"/></graphics><name><value>Puffer</value></name>
    <initialMarking><value>Default,2</value></initialMarking><capacity><value>5</value></capacity></place>
  <place id="P1"><graphics><position x="300.0" y="120.0"/></graphics><name><value>Sperre</value></name><initialMarking><value>Default,0</value></initialMarking></place>
  <transition id="T0"><graphics><position x="200.0" y="120.0"/></graphics><name><value>T0</value></name>
    <rate><value>0.5</value></rate><timed><value>true</value></timed></transition>
  <arc id="A0" source="P0" target="T0"><inscription><value>Default,2</value></inscription><type value="normal"/></arc>
  <arc id="A1" source="P1" target="T0"><inscription><value>Default,1</value></inscription><type value="inhibitor"/></arc>
</net></pnml>`;
    const { doc } = importPnml(xml, 'pipe');
    const net = compileNet(doc);
    expect(net.placeNames.sort()).toEqual(['Puffer', 'Sperre']);
    const p = net.placeIndex.get(doc.order.find((id) => (doc.elements[id] as { name?: string }).name === 'Puffer')!)!;
    expect(net.initial[p]).toBe(2);
    expect(net.capacity[p]).toBe(5);
    const t = net.transitions[0];
    expect(t.timing).toBe('exponential');
    expect(t.delay).toBe(2);
    expect(t.inputs.find((a) => a.kind === 2)).toBeTruthy();
    expect(t.inputs.find((a) => a.kind === 0)!.weight).toBe(2);
  });

  it('ordnet Netze ohne Koordinaten automatisch an', () => {
    const xml = `<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml"><net id="n" type="http://www.pnml.org/version-2009/grammar/ptnet"><page id="pg">
      <place id="a"><initialMarking><text>1</text></initialMarking></place><place id="b"/><place id="c"/>
      <transition id="t1"/><transition id="t2"/>
      <arc id="x1" source="a" target="t1"/><arc id="x2" source="t1" target="b"/><arc id="x3" source="b" target="t2"/><arc id="x4" source="t2" target="c"/>
    </page></net></pnml>`;
    const { doc, warnings } = importPnml(xml, 'ohne Koordinaten');
    expect(warnings.join(' ')).toMatch(/automatisch angeordnet/);
    const xs = new Set(doc.order.map((id) => doc.elements[id]).filter((e) => e.type === 'place' || e.type === 'transition').map((e) => (e as { x: number }).x));
    expect(xs.size).toBe(5); // a → t1 → b → t2 → c nebeneinander
  });

  it('löst Referenzknoten über Seiten hinweg auf', () => {
    const xml = `<pnml><net id="n" type="ptnet"><page id="p1"><place id="a"><graphics><position x="0" y="0"/></graphics></place>
      <page id="p2"><referencePlace id="ra" ref="a"/><transition id="t"><graphics><position x="100" y="0"/></graphics></transition>
      <arc id="e" source="ra" target="t"/></page></page></net></pnml>`;
    const { doc } = importPnml(xml);
    const arcs = doc.order.filter((id) => doc.elements[id].type === 'arc');
    expect(arcs).toHaveLength(1);
  });

  it('lehnt Unsinn mit verständlicher Meldung ab', () => {
    expect(() => importPnml('<html><body>Hallo</body></html>')).toThrow(PnmlFormatError);
    expect(() => importPnml('<pnml></pnml>')).toThrow(/kein Netz/);
    expect(() => importPnml('<pnml><net id="x"><page id="p"/></net></pnml>')).toThrow(/keine Stellen/);
  });

  it('übersteht beschädigte Dateien ohne Absturz', () => {
    const xml = exportPnml(build('philosophen'));
    for (let cut = 200; cut < xml.length; cut += 977) {
      const part = xml.slice(0, cut);
      try {
        const { doc } = importPnml(part);
        expect(doc.order.length).toBeGreaterThan(0);
      } catch (err) {
        expect(err).toBeInstanceOf(PnmlFormatError);
      }
    }
  });
});
