/**
 * Die mitgelieferten Beispielnetze. Jedes Netz wird bei jedem Aufruf neu erzeugt.
 */
import type { NetDoc } from '../model/types';
import { ExampleBuilder } from './build';

const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREEN = '#22c55e';

/** Glücksspielautomat (nach der Idee aus dem Tutorial des Original-HPSim). */
export function gamblingMachine(): NetDoc {
  const b = new ExampleBuilder(
    'Erstes Netz: Glücksspielautomat',
    'Ein kleiner Spielautomat: Eine Münze wird eingeworfen, dann entscheidet der Zufall über Gewinn (2 Münzen zurück) oder Verlust. ' +
      'Das Netz zeigt Kantengewichte, einen Konflikt (Gewinn oder Verlust) und eine mögliche Verklemmung („pleite“). ' +
      'Die Summe der Münzen bleibt immer gleich – das ist eine P-Invariante.',
  );
  b.title('Glücksspielautomat', 80, 20);
  const coins = b.place('Münzen', 140, 220, 3);
  const insert = b.trans('Einwurf', 280, 220);
  const running = b.place('Spiel läuft', 420, 220);
  const win = b.trans('Gewinn', 560, 140);
  const lose = b.trans('Verlust', 560, 300);
  const bank = b.place('Kasse', 700, 220, 2, { capacity: 1000, showCapacity: true });
  b.arc(coins, insert);
  b.arc(insert, running);
  b.arc(running, win);
  b.arc(running, lose);
  b.arc(lose, bank);
  b.arc(bank, win);
  b.route(win, coins, [
    { x: 560, y: 80 },
    { x: 140, y: 80 },
  ], { weight: 2, showWeight: true });
  b.text('Gewinn zahlt 2 Münzen aus:\neine eigene + eine aus der Kasse.', 600, 60, { fontSize: 12.5 });
  b.text('Tipp: Schalte in die Analyse (F6) –\nfindest du die Verklemmung „pleite“?', 80, 340, { fontSize: 12.5 });
  return b.done();
}

export function producerConsumer(): NetDoc {
  const b = new ExampleBuilder(
    'Erzeuger–Verbraucher mit Puffer',
    'Ein Erzeuger stellt alle 2 Zeiteinheiten ein Teil her und legt es in einen Puffer mit Platz für 3 Teile. ' +
      'Der Verbraucher braucht 3 Zeiteinheiten pro Teil. Weil er langsamer ist, läuft der Puffer voll – dann muss der Erzeuger warten (Kapazität).',
  );
  b.title('Erzeuger–Verbraucher', 60, 0);
  b.frame(50, 50, 400, 210);
  b.frame(530, 50, 370, 290);
  b.text('Erzeuger', 70, 220, { fontSize: 15, bold: true });
  b.text('Verbraucher', 750, 300, { fontSize: 15, bold: true });
  const eReady = b.place('bereit', 100, 160, 1);
  const produce = b.trans('produzieren', 200, 160, { timing: 'deterministic', delay: 2 });
  const eDone = b.place('fertig', 300, 160);
  const put = b.trans('ablegen', 400, 160);
  const buffer = b.place('Puffer', 490, 160, 0, { capacity: 3 });
  const take = b.trans('entnehmen', 600, 160);
  const vReady = b.place('frei', 600, 270, 1);
  const vHas = b.place('hat Teil', 700, 160);
  const consume = b.trans('verbrauchen', 800, 160, { timing: 'deterministic', delay: 3 });
  b.arc(eReady, produce);
  b.arc(produce, eDone);
  b.arc(eDone, put);
  b.route(put, eReady, [
    { x: 400, y: 90 },
    { x: 100, y: 90 },
  ]);
  b.arc(put, buffer);
  b.arc(buffer, take);
  b.arc(vReady, take);
  b.arc(take, vHas);
  b.arc(vHas, consume);
  b.route(consume, vReady, [{ x: 800, y: 270 }]);
  return b.done();
}

export function mutex(): NetDoc {
  const b = new ExampleBuilder(
    'Wechselseitiger Ausschluss (Mutex)',
    'Zwei Prozesse wollen abwechselnd in einen kritischen Bereich (z. B. einen Drucker benutzen). Die Stelle „frei“ wirkt als Semaphor: ' +
      'Es ist immer höchstens ein Prozess im kritischen Bereich. Die Analyse zeigt: sicher, lebendig, verklemmungsfrei.',
  );
  b.title('Wechselseitiger Ausschluss', 60, 0);
  const procs = [
    { x: 160, side: -1, n: 'A' },
    { x: 520, side: 1, n: 'B' },
  ];
  const sem = b.place('frei', 340, 250, 1, { color: GREEN });
  for (const p of procs) {
    const idle = b.place(`wartet ${p.n}`, p.x, 100, 1);
    const enter = b.htrans(`betritt ${p.n}`, p.x, 180);
    const crit = b.place(`kritisch ${p.n}`, p.x, 260, 0, { color: RED });
    const leave = b.htrans(`verlässt ${p.n}`, p.x, 340);
    const back = p.x + p.side * 90;
    b.arc(idle, enter);
    b.arc(enter, crit);
    b.arc(crit, leave);
    b.route(leave, idle, [
      { x: back, y: 340 },
      { x: back, y: 100 },
    ]);
    b.arc(sem, enter);
    b.arc(leave, sem);
    b.text(`Prozess ${p.n}`, p.x - 36, 400, { fontSize: 15, bold: true });
  }
  b.text('Semaphor', 306, 300, { fontSize: 12.5, italic: true });
  return b.done();
}

export function philosophers(): NetDoc {
  const b = new ExampleBuilder(
    'Speisende Philosophen',
    'Fünf Philosophen sitzen an einem runden Tisch, zwischen je zwei liegt eine Gabel. Jeder nimmt erst die linke, dann die rechte Gabel. ' +
      'Nehmen alle gleichzeitig ihre linke Gabel, entsteht eine Verklemmung (Deadlock). Die Analyse findet die Schaltfolge dorthin – probiere „Nachspielen“!',
  );
  b.title('Speisende Philosophen', 30, -10);
  const N = 5;
  const X0 = 150;
  const DX = 210;
  // Gabeln liegen zwischen den Philosophen, etwas unterhalb von „nimmt rechts“, damit Beschriftungen Platz haben
  const FY = 390;
  const forks = Array.from({ length: N }, (_, i) => b.place(`Gabel ${i + 1}`, X0 + i * DX - 105, FY, 1, { color: AMBER, nameOffset: { x: -50, y: 0 } }));
  for (let i = 0; i < N; i++) {
    const x = X0 + i * DX;
    const think = b.place(`denkt ${i + 1}`, x, 100, 1);
    const takeL = b.htrans(`nimmt links ${i + 1}`, x, 180);
    const hasL = b.place(`hat links ${i + 1}`, x, 260);
    const takeR = b.htrans(`nimmt rechts ${i + 1}`, x, 340);
    const eats = b.place(`isst ${i + 1}`, x, 420, 0, { color: GREEN });
    const done = b.htrans(`legt ab ${i + 1}`, x, 500, { timing: 'deterministic', delay: 2 });
    const left = forks[i];
    const right = forks[(i + 1) % N];
    b.arc(think, takeL);
    b.arc(takeL, hasL);
    b.arc(hasL, takeR);
    b.arc(takeR, eats);
    b.arc(eats, done);
    b.route(done, think, [
      { x: x + 55, y: 500 },
      { x: x + 55, y: 100 },
    ]);
    b.arc(left, takeL);
    b.arc(done, left);
    if (i < N - 1) {
      b.arc(right, takeR);
      b.arc(done, right);
    } else {
      // Die rechte Gabel des letzten Philosophen ist Gabel 1 (runder Tisch)
      b.route(right, takeR, [
        { x: forks[0].x + 8, y: 590 },
        { x: x + 30, y: 590 },
        { x: x + 30, y: 340 },
      ]);
      b.route(done, right, [
        { x: x, y: 610 },
        { x: forks[0].x - 8, y: 610 },
      ]);
    }
  }
  b.text('Gabel 1 liegt zwischen Philosoph 5 und 1 (runder Tisch)', 40, 650, { fontSize: 12.5, italic: true });
  return b.done();
}

export function trafficLights(): NetDoc {
  const b = new ExampleBuilder(
    'Ampelkreuzung',
    'Zwei Ampeln (Nord–Süd und Ost–West) wechseln zeitgesteuert zwischen Rot, Grün und Gelb. Die Stellen „A ist dran“ und „B ist dran“ sorgen dafür, ' +
      'dass nie beide gleichzeitig Grün haben und sich die Richtungen abwechseln. Grünphase 5, Gelbphase 2 Zeiteinheiten.',
  );
  b.title('Ampelkreuzung', 40, -10);
  const lights = [
    { x: 160, side: -1, n: 'A', label: 'Ampel A (Nord–Süd)' },
    { x: 560, side: 1, n: 'B', label: 'Ampel B (Ost–West)' },
  ];
  const turnA = b.place('A ist dran', 360, 140, 1);
  const turnB = b.place('B ist dran', 360, 420);
  lights.forEach((l, i) => {
    const red = b.place(`Rot ${l.n}`, l.x, 100, 1, { color: RED });
    // Namen außen, Zeiten innen unterhalb – so kreuzen sich Beschriftungen und Kanten nicht
    const labels = { nameOffset: { x: l.side * 64, y: 0 }, delayOffset: { x: -l.side * 34, y: 16 } };
    const toGreen = b.htrans(`wird grün ${l.n}`, l.x, 180, { timing: 'deterministic', delay: 1, ...labels });
    const green = b.place(`Grün ${l.n}`, l.x, 260, 0, { color: GREEN });
    const toYellow = b.htrans(`wird gelb ${l.n}`, l.x, 340, { timing: 'deterministic', delay: 5, ...labels });
    const yellow = b.place(`Gelb ${l.n}`, l.x, 420, 0, { color: AMBER });
    const toRed = b.htrans(`wird rot ${l.n}`, l.x, 500, { timing: 'deterministic', delay: 2, ...labels, nameOffset: { x: 0, y: 24 } });
    const back = l.x + l.side * 125;
    b.arc(red, toGreen);
    b.arc(toGreen, green);
    b.arc(green, toYellow);
    b.arc(toYellow, yellow);
    b.arc(yellow, toRed);
    b.route(toRed, red, [
      { x: back, y: 500 },
      { x: back, y: 100 },
    ]);
    b.arc(i === 0 ? turnA : turnB, toGreen);
    b.arc(toRed, i === 0 ? turnB : turnA);
    b.text(l.label, l.x - 70, 570, { fontSize: 14, bold: true });
  });
  return b.done();
}

export function machineWithFailures(): NetDoc {
  const b = new ExampleBuilder(
    'Fertigungsmaschine mit Ausfällen',
    'Werkstücke kommen zufällig an (exponentialverteilt, im Mittel alle 4 Zeiteinheiten) und warten in einer Warteschlange (max. 10). ' +
      'Die Maschine bearbeitet ein Teil 2 bis 4 Zeiteinheiten lang (gleichverteilt). Im Leerlauf fällt sie gelegentlich aus (exponentiell, Mittel 30) ' +
      'und wird in 6 Zeiteinheiten repariert. Beobachte im Diagramm, wie die Warteschlange wächst und schrumpft!',
  );
  b.title('Fertigungsmaschine mit Ausfällen', 40, 0);
  const arrive = b.trans('Ankunft', 100, 160, { timing: 'exponential', delay: 4 });
  const queue = b.place('Warteschlange', 220, 160, 0, { capacity: 10 });
  const start = b.trans('starten', 340, 160);
  const busy = b.place('in Bearbeitung', 460, 160);
  const finish = b.trans('fertig', 580, 160, { timing: 'uniform', delay: 2, delayMax: 4 });
  const done = b.place('Fertigteile', 700, 160);
  const idle = b.place('Maschine frei', 460, 300, 1, { color: GREEN, nameOffset: { x: -72, y: 0 } });
  const fail = b.htrans('Ausfall', 380, 400, { timing: 'exponential', delay: 30 });
  const broken = b.place('defekt', 460, 480, 0, { color: RED });
  const repair = b.htrans('Reparatur', 540, 400, { timing: 'deterministic', delay: 6 });
  b.arc(arrive, queue);
  b.arc(queue, start);
  b.arc(start, busy);
  b.arc(busy, finish);
  b.arc(finish, done);
  b.arc(idle, start);
  b.arc(finish, idle);
  b.arc(idle, fail);
  b.arc(fail, broken);
  b.arc(broken, repair);
  b.arc(repair, idle);
  b.text('Ankunft hat keine Eingänge –\nsie ist eine „Quelle“.', 40, 210, { fontSize: 12.5, italic: true });
  return b.done();
}

export function testInhibitor(): NetDoc {
  const b = new ExampleBuilder(
    'Test- und Inhibitorkanten',
    'Links: Eine Testkante (gestrichelt) prüft, ob Licht an ist – sie verbraucht die Marke aber nicht. ' +
      'Rechts: Eine Inhibitorkante (mit Kreis) verhindert das Schalten, solange „Not-Aus“ eine Marke enthält.',
  );
  b.title('Test- und Inhibitorkanten', 40, -10);
  b.frame(30, 40, 400, 340);
  b.frame(470, 40, 400, 340);
  b.text('Testkante: lesen nur mit Licht', 50, 340, { fontSize: 14, bold: true });
  b.text('Inhibitorkante: Not-Aus stoppt das Band', 490, 340, { fontSize: 14, bold: true });
  // Testkante
  const light = b.place('Licht an', 230, 110, 1, { color: AMBER });
  const off = b.htrans('ausschalten', 330, 110);
  const dark = b.place('dunkel', 380, 200);
  const on = b.htrans('einschalten', 330, 270);
  b.arc(light, off);
  b.route(off, dark, [{ x: 380, y: 110 }]);
  b.route(dark, on, [{ x: 380, y: 270 }]);
  b.route(on, light, [{ x: 270, y: 270 }, { x: 270, y: 160 }]);
  const unread = b.place('ungelesen', 90, 200, 3);
  const read = b.trans('lesen', 180, 200, { timing: 'deterministic', delay: 2 });
  const done = b.place('gelesen', 180, 300);
  b.arc(unread, read);
  b.route(read, done, [{ x: 180, y: 260 }]);
  b.arc(light, read, { kind: 'test' });
  // Inhibitor
  const parts = b.place('Teile', 530, 200, 5);
  const move = b.trans('transportieren', 650, 200, { timing: 'deterministic', delay: 1, delayOffset: { x: 24, y: -26 } });
  const target = b.place('Ziel', 770, 200);
  const stop = b.place('Not-Aus', 650, 90);
  const button = b.place('Knopf', 820, 90, 1);
  const press = b.htrans('drücken', 740, 70);
  const release = b.htrans('entriegeln', 740, 120, { timing: 'deterministic', delay: 4 });
  b.arc(parts, move);
  b.arc(move, target);
  b.arc(stop, move, { kind: 'inhibitor' });
  b.arc(button, press);
  b.arc(press, stop);
  b.arc(stop, release);
  b.arc(release, button);
  return b.done();
}

export function readersWriters(): NetDoc {
  const b = new ExampleBuilder(
    'Leser–Schreiber-Problem',
    'Drei Leser und zwei Schreiber teilen sich eine Datei. Lesen dürfen bis zu drei gleichzeitig (je 1 Zugriffsrecht), ' +
      'Schreiben braucht alle 3 Zugriffsrechte auf einmal (Kantengewicht 3) – dann darf niemand sonst zugreifen.',
  );
  b.title('Leser–Schreiber', 40, -10);
  const rIdle = b.place('Leser bereit', 120, 100, 3);
  const rStart = b.htrans('beginnt Lesen', 120, 180, { timing: 'exponential', delay: 3 });
  const reading = b.place('liest', 120, 260);
  const rEnd = b.htrans('beendet Lesen', 120, 340, { timing: 'deterministic', delay: 2 });
  b.arc(rIdle, rStart);
  b.arc(rStart, reading);
  b.arc(reading, rEnd);
  b.route(rEnd, rIdle, [{ x: 0, y: 340 }, { x: 0, y: 100 }]);
  const wIdle = b.place('Schreiber bereit', 520, 100, 2);
  const wStart = b.htrans('beginnt Schreiben', 520, 180, { timing: 'exponential', delay: 6 });
  const writing = b.place('schreibt', 520, 260, 0, { color: RED });
  const wEnd = b.htrans('beendet Schreiben', 520, 340, { timing: 'deterministic', delay: 3 });
  b.arc(wIdle, wStart);
  b.arc(wStart, writing);
  b.arc(writing, wEnd);
  b.route(wEnd, wIdle, [{ x: 640, y: 340 }, { x: 640, y: 100 }]);
  const rights = b.place('Zugriffsrechte', 320, 260, 3, { color: GREEN });
  b.arc(rights, rStart);
  b.arc(rEnd, rights);
  b.arc(rights, wStart, { weight: 3 });
  b.arc(wEnd, rights, { weight: 3 });
  b.text('Gewicht 3: Schreiben braucht\nalle Rechte gleichzeitig', 250, 400, { fontSize: 12.5, italic: true });
  return b.done();
}

export function vendingMachine(): NetDoc {
  const b = new ExampleBuilder(
    'Getränkeautomat',
    'Münzen wandern aus dem Geldbeutel in den Automaten (Guthaben, höchstens 3). Eine Cola kostet 2 Münzen (Gewinn 2), ein Wasser 1 Münze. ' +
      'Ist ein Fach leer, kann dieses Getränk nicht mehr gekauft werden. Mit „Geld zurück“ bekommst du dein Guthaben wieder.',
  );
  b.title('Getränkeautomat', 40, -10);
  const wallet = b.place('Geldbeutel', 100, 220, 5);
  const insert = b.trans('einwerfen', 220, 220);
  const credit = b.place('Guthaben', 340, 220, 0, { capacity: 3 });
  const back = b.htrans('Geld zurück', 220, 340, { priority: -1 });
  const buyCola = b.trans('Cola kaufen', 480, 140);
  const buyWater = b.trans('Wasser kaufen', 480, 300);
  const cola = b.place('Cola-Fach', 480, 40, 2);
  const water = b.place('Wasser-Fach', 480, 400, 3);
  const gotCola = b.place('Cola bekommen', 620, 140);
  const gotWater = b.place('Wasser bekommen', 620, 300);
  b.arc(wallet, insert);
  b.arc(insert, credit);
  b.route(credit, back, [{ x: 340, y: 340 }]);
  b.route(back, wallet, [{ x: 100, y: 340 }]);
  b.arc(credit, buyCola, { weight: 2 });
  b.arc(credit, buyWater);
  b.arc(cola, buyCola);
  b.arc(water, buyWater);
  b.arc(buyCola, gotCola);
  b.arc(buyWater, gotWater);
  return b.done();
}
