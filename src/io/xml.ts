/**
 * Kleiner, fehlertoleranter XML-Parser für den PNML-Import.
 * Unterstützt Elemente, Attribute, Text, CDATA, Kommentare, Verarbeitungs-
 * anweisungen und die üblichen Entities. Namensraum-Präfixe werden entfernt.
 * Läuft ohne DOM (auch in Tests und Workern).
 */

export interface XmlNode {
  /** lokaler Name ohne Namensraum-Präfix */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Steuerzeichen sind in XML 1.0 nicht erlaubt
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

const localName = (n: string) => {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
};

const MAX_DEPTH = 200;

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1].text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE o. Ä. (ggf. mit internem Subset in [...])
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) throw new XmlError('Unvollständiges schließendes Tag.');
      const name = localName(src.slice(lt + 2, end).trim());
      // Bis zum passenden offenen Element zurückgehen (tolerant gegenüber Fehlern)
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end + 1;
      continue;
    }
    // Start-Tag
    let j = lt + 1;
    let quote: string | null = null;
    for (; j < n; j++) {
      const c = src[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) throw new XmlError('Unvollständiges Tag am Dateiende.');
    let body = src.slice(lt + 1, j);
    const selfClosing = body.endsWith('/');
    if (selfClosing) body = body.slice(0, -1);
    const m = /^([^\s/>]+)/.exec(body);
    if (!m) throw new XmlError('Ungültiges Tag.');
    const node: XmlNode = { name: localName(m[1]), attrs: {}, children: [], text: '' };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = body.slice(m[1].length);
    while ((a = attrRe.exec(rest))) node.attrs[localName(a[1])] = decodeEntities(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      if (stack.length > MAX_DEPTH) throw new XmlError('Die Datei ist zu tief verschachtelt.');
      stack.push(node);
    }
    i = j + 1;
  }
  return root;
}

/** Erstes Kind mit dem Namen (oder undefined). */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** Text eines Pfads, z. B. path(place, 'name', 'text'). */
export function pathText(node: XmlNode | undefined, ...names: string[]): string | undefined {
  let cur = node;
  for (const nm of names) cur = child(cur, nm);
  return cur ? cur.text.trim() : undefined;
}

/** Alle Nachfahren mit Namen (Tiefensuche). */
export function descendants(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
