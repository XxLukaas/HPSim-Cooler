/**
 * Markierungsverlauf für Diagramme und CSV-Export.
 * Bei sehr langen Läufen wird automatisch ausgedünnt (jeder zweite Wert),
 * damit der Speicherverbrauch begrenzt bleibt.
 */
export class MarkingHistory {
  steps: number[] = [];
  times: number[] = [];
  /** markings[i] = Markierung nach Schritt steps[i] */
  markings: Int32Array[] = [];
  fired: (number[] | null)[] = [];
  private stride = 1;
  private counter = 0;

  constructor(public readonly maxSamples = 20000) {}

  clear(): void {
    this.steps = [];
    this.times = [];
    this.markings = [];
    this.fired = [];
    this.stride = 1;
    this.counter = 0;
  }

  get length(): number {
    return this.steps.length;
  }

  get decimated(): boolean {
    return this.stride > 1;
  }

  push(step: number, time: number, marking: number[], fired: number[] | null, force = false): void {
    this.counter++;
    if (!force && this.counter % this.stride !== 0 && this.steps.length > 0) return;
    this.steps.push(step);
    this.times.push(time);
    this.markings.push(Int32Array.from(marking, (v) => Math.min(v, 2147483647)));
    this.fired.push(fired);
    if (this.steps.length > this.maxSamples) this.halve();
  }

  /** Entfernt alle Einträge mit Schritt > step (für „Schritt zurück“). */
  truncateAfter(step: number): void {
    let n = this.steps.length;
    while (n > 0 && this.steps[n - 1] > step) n--;
    this.steps.length = n;
    this.times.length = n;
    this.markings.length = n;
    this.fired.length = n;
  }

  private halve(): void {
    const keep = (_: unknown, i: number) => i % 2 === 0 || i === this.steps.length - 1;
    this.steps = this.steps.filter(keep);
    this.times = this.times.filter(keep);
    this.markings = this.markings.filter(keep);
    this.fired = this.fired.filter(keep);
    this.stride *= 2;
  }

  toCsv(placeNames: string[], transitionNames: string[], sep = ';'): string {
    const esc = (s: string) => (/[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const header = ['Schritt', 'Zeit', ...placeNames.map(esc), 'Geschaltet'];
    const lines = [header.join(sep)];
    for (let i = 0; i < this.steps.length; i++) {
      const fired = this.fired[i]?.map((t) => transitionNames[t]).join(' ') ?? '';
      lines.push(
        [String(this.steps[i]), formatCsvNumber(this.times[i]), ...Array.from(this.markings[i], String), esc(fired)].join(sep),
      );
    }
    return lines.join('\r\n') + '\r\n';
  }
}

function formatCsvNumber(v: number): string {
  // Komma als Dezimaltrennzeichen, damit Excel (deutsch) die Werte erkennt
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6).replace('.', ',');
}
