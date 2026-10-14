/** Verzeichnis aller Beispielnetze (Startseite, URL-Parameter ?beispiel=…). */
import { importLegacyHps } from '../io/legacyHps';
import type { NetDoc } from '../model/types';
import { LEGACY_EXAMPLES } from './legacyData';
import {
  gamblingMachine,
  machineWithFailures,
  mutex,
  philosophers,
  producerConsumer,
  readersWriters,
  testInhibitor,
  trafficLights,
  vendingMachine,
} from './nets';

export interface ExampleInfo {
  id: string;
  title: string;
  description: string;
  category: 'Grundlagen' | 'Klassiker' | 'Zeit & Zufall' | 'Original-HPSim';
  build: () => NetDoc;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function legacy(key: string, title: string, description: string): () => NetDoc {
  return () => {
    const { doc } = importLegacyHps(base64ToBytes(LEGACY_EXAMPLES[key]), title);
    doc.meta.title = title;
    doc.meta.description = description;
    doc.meta.author = 'Henryk Anschütz (Original-HPSim 1.1)';
    return doc;
  };
}

export const EXAMPLES: ExampleInfo[] = [
  {
    id: 'erstes-netz',
    title: 'Glücksspielautomat',
    description: 'Der perfekte Einstieg: Münzen, Zufall, Kantengewichte – und eine Verklemmung, wenn das Geld ausgeht.',
    category: 'Grundlagen',
    build: gamblingMachine,
  },
  {
    id: 'test-inhibitor',
    title: 'Test- und Inhibitorkanten',
    description: 'Lesen nur bei Licht, Förderband mit Not-Aus: die beiden Sonderkanten anschaulich erklärt.',
    category: 'Grundlagen',
    build: testInhibitor,
  },
  {
    id: 'getraenkeautomat',
    title: 'Getränkeautomat',
    description: 'Guthaben mit Kapazität, Preise als Kantengewichte, leere Fächer und Geld zurück.',
    category: 'Grundlagen',
    build: vendingMachine,
  },
  {
    id: 'mutex',
    title: 'Wechselseitiger Ausschluss',
    description: 'Zwei Prozesse, ein Semaphor: Nie sind beide gleichzeitig im kritischen Bereich.',
    category: 'Klassiker',
    build: mutex,
  },
  {
    id: 'philosophen',
    title: 'Speisende Philosophen',
    description: 'Der Klassiker zum Thema Verklemmung – die Analyse findet den Deadlock und spielt ihn vor.',
    category: 'Klassiker',
    build: philosophers,
  },
  {
    id: 'leser-schreiber',
    title: 'Leser–Schreiber',
    description: 'Viele dürfen lesen, nur einer schreiben: Zugriffsrechte als Marken mit Gewicht 3.',
    category: 'Klassiker',
    build: readersWriters,
  },
  {
    id: 'erzeuger-verbraucher',
    title: 'Erzeuger–Verbraucher',
    description: 'Ein schneller Erzeuger, ein langsamer Verbraucher und ein Puffer mit Kapazität 3.',
    category: 'Zeit & Zufall',
    build: producerConsumer,
  },
  {
    id: 'ampel',
    title: 'Ampelkreuzung',
    description: 'Zwei Ampeln mit Grün-, Gelb- und Rotphasen, die sich zeitgesteuert abwechseln.',
    category: 'Zeit & Zufall',
    build: trafficLights,
  },
  {
    id: 'fertigung',
    title: 'Fertigungsmaschine mit Ausfällen',
    description: 'Zufällige Ankünfte, Warteschlange, Bearbeitungszeiten und Maschinenausfälle – ideal fürs Diagramm.',
    category: 'Zeit & Zufall',
    build: machineWithFailures,
  },
  {
    id: 'original-zeitverhalten',
    title: 'Zeitverhalten & Watchdog',
    description: 'Original-Beispiel aus HPSim 1.1: Erzeuger/Verbraucher, deterministische und exponentielle Zeiten, Watchdog mit Testkante.',
    category: 'Original-HPSim',
    build: legacy(
      'time_sample',
      'Zeitverhalten & Watchdog (Original)',
      'Original-Beispiel „time_sample.hps“ aus HPSim 1.1: Erzeuger/Verbraucher mit Puffer, ein überwachter Prozess mit exponentieller Bearbeitungszeit und ein Watchdog, der per Testkante einen Fehler meldet, wenn der Prozess zu lange dauert.',
    ),
  },
  {
    id: 'original-feldbus',
    title: 'Feldbus mit zwei SPSen',
    description: 'Original-Beispiel aus HPSim 1.1: zwei Steuerungen kommunizieren über einen gemeinsamen Feldbus.',
    category: 'Original-HPSim',
    build: legacy(
      'demo_net',
      'Feldbus mit zwei SPSen (Original)',
      'Original-Beispiel „demo_net.hps“ aus HPSim 1.1: Zwei speicherprogrammierbare Steuerungen (SPS) senden und empfangen über einen Feldbus; zwei Prozessbeobachtungen visualisieren die Daten.',
    ),
  },
  {
    id: 'original-prozess',
    title: 'Prozesskopplung',
    description: 'Original-Beispiel aus HPSim 1.1: gekoppelte Prozesse mit vielen Zuständen.',
    category: 'Original-HPSim',
    build: legacy(
      'prozess_connect',
      'Prozesskopplung (Original)',
      'Original-Beispiel „prozess_connect.hps“ aus HPSim 1.1.',
    ),
  },
  {
    id: 'original-prozess-einfach',
    title: 'Prozesskopplung (einfach)',
    description: 'Original-Beispiel aus HPSim 1.1: die vereinfachte Variante der Prozesskopplung.',
    category: 'Original-HPSim',
    build: legacy(
      'prozess_simple_connect',
      'Prozesskopplung einfach (Original)',
      'Original-Beispiel „prozess_simple_connect.hps“ aus HPSim 1.1.',
    ),
  },
];
