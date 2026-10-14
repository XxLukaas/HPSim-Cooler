/** Inhalte der Hilfe. Jedes Thema ist eine eigene Seite mit Abbildungen und Querverweisen. */
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  CircleHelp,
  Clock,
  FileUp,
  FlaskConical,
  GitFork,
  Hand,
  History,
  Info,
  Pencil,
  Play,
  Rocket,
  Spline,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { setUi } from '../store/appStore';
import { A, Fig, P, T, Then } from './figures';

export interface Topic {
  id: string;
  title: string;
  group: 'Erste Schritte' | 'Modellieren' | 'Programm' | 'Mehr';
  icon: LucideIcon;
  keywords: string;
  body: () => ReactNode;
}

export function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button type="button" className="help-link" onClick={() => setUi({ helpTopic: to })}>
      {children}
    </button>
  );
}

function K({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

function Tip({ children, kind = 'tip' }: { children: ReactNode; kind?: 'tip' | 'warn' }) {
  return <div className={`help-tip ${kind}`}>{children}</div>;
}

export const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Willkommen',
    group: 'Erste Schritte',
    icon: Rocket,
    keywords: 'start überblick einstieg modus',
    body: () => (
      <>
        <p className="lead">
          HPSim Studio ist ein Editor und Simulator für <b>Petri-Netze</b> – die moderne Neuauflage von HPSim 1.1. Du zeichnest ein Netz, lässt es laufen und
          siehst sofort, wie sich dein System verhält.
        </p>
        <h3>Die drei Modi</h3>
        <div className="help-cards">
          <div className="help-card">
            <Pencil size={18} />
            <b>Bearbeiten</b> <K>F2</K>
            <span>Stellen, Transitionen und Kanten zeichnen, Eigenschaften im rechten Bereich einstellen.</span>
          </div>
          <div className="help-card">
            <Play size={18} />
            <b>Simulieren</b> <K>F5</K>
            <span>Marken wandern durchs Netz – Schritt für Schritt, im Echtzeitlauf oder im Schnelldurchlauf mit Diagramm und Statistik.</span>
          </div>
          <div className="help-card">
            <FlaskConical size={18} />
            <b>Analysieren</b> <K>F6</K>
            <span>Verklemmungen, Beschränktheit, Lebendigkeit, Zustandsgraph und Invarianten – automatisch berechnet und erklärt.</span>
          </div>
        </div>
        <h3>So fängst du an</h3>
        <ol>
          <li>
            Öffne ein <b>Beispiel</b> auf der Startseite oder lege ein neues Netz an (<K>Strg</K>+<K>N</K>).
          </li>
          <li>
            Wähle links oben das Werkzeug <b>Stelle</b> (<K>P</K>) oder <b>Transition</b> (<K>T</K>) und klicke auf die Zeichenfläche.
          </li>
          <li>
            Wähle das Werkzeug <b>Kante</b> (<K>K</K>) und ziehe von einem Element zum anderen – schon sind sie verbunden.
          </li>
          <li>
            Wechsle mit <K>F5</K> in die Simulation und klicke auf eine grün umrandete Transition – sie schaltet.
          </li>
        </ol>
        <Tip>
          Neu bei Petri-Netzen? Lies zuerst <Go to="petri">Was sind Petri-Netze?</Go> oder starte das interaktive Tutorial über das Hilfe-Menü.
        </Tip>
        <Tip>
          Alle Befehle findest du auch über die <b>Befehlssuche</b> (<K>Strg</K>+<K>K</K>) – einfach lostippen, z. B. „ausrichten“ oder „csv“.
        </Tip>
      </>
    ),
  },
  {
    id: 'petri',
    title: 'Was sind Petri-Netze?',
    group: 'Erste Schritte',
    icon: BookOpen,
    keywords: 'grundlagen stelle transition kante marke token einführung',
    body: () => (
      <>
        <p className="lead">
          Ein Petri-Netz beschreibt Abläufe, bei denen Dinge <b>gleichzeitig</b>, <b>nacheinander</b> oder <b>im Wettbewerb</b> passieren – etwa Maschinen,
          Ampeln, Protokolle oder Geschäftsprozesse. Es besteht aus nur vier Bausteinen:
        </p>
        <Fig w={440} h={150} caption="Ein Teil wartet und die Maschine ist frei – also kann „bearbeiten“ schalten. Danach ist das Teil fertig und die Maschine wieder frei.">
          <P x={50} y={42} tokens={1} label="Teil wartet" />
          <P x={50} y={118} tokens={1} label="" />
          <text x={50} y={147} textAnchor="middle" fontSize={11} style={{ fill: 'var(--muted)' }}>
            Maschine frei
          </text>
          <A x1={69} y1={46} x2={200} y2={70} />
          <A x1={69} y1={114} x2={200} y2={90} />
          <T x={212} y={80} label="bearbeiten" enabled h={44} />
          <A x1={224} y1={80} x2={350} y2={80} />
          <P x={370} y={80} label="Teil fertig" />
          <path d="M 214 106 C 214 140, 120 150, 70 126" fill="none" style={{ stroke: 'var(--text)' }} strokeWidth={1.8} markerEnd="url(#hf-arrow)" />
        </Fig>
        <dl className="help-dl">
          <dt>Stellen (Kreise)</dt>
          <dd>Beschreiben Zustände oder Lager: „Maschine frei“, „Teile im Puffer“, „Ampel rot“.</dd>
          <dt>Marken (Punkte in den Stellen)</dt>
          <dd>Zeigen, was gerade vorhanden ist. Drei Marken in „Puffer“ heißt: drei Teile liegen dort.</dd>
          <dt>Transitionen (Balken)</dt>
          <dd>Sind Ereignisse oder Tätigkeiten: „bearbeiten“, „umschalten“, „Nachricht senden“.</dd>
          <dt>Kanten (Pfeile)</dt>
          <dd>Verbinden immer eine Stelle mit einer Transition oder umgekehrt – nie zwei Stellen oder zwei Transitionen direkt.</dd>
        </dl>
        <p>
          Der aktuelle Zustand des ganzen Systems ist die <b>Markierung</b>: wie viele Marken in welcher Stelle liegen. Durch das <Go to="firing">Schalten</Go> von
          Transitionen ändert sich die Markierung – so „läuft“ das Netz.
        </p>
        <h3>Warum Petri-Netze?</h3>
        <ul>
          <li>Sie sind anschaulich – man sieht, wo Engpässe entstehen.</li>
          <li>Sie sind mathematisch exakt – man kann Eigenschaften wie Verklemmungsfreiheit beweisen (siehe <Go to="analysis">Analyse</Go>).</li>
          <li>Sie bilden Nebenläufigkeit natürlich ab – mehrere Dinge können unabhängig voneinander passieren.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'firing',
    title: 'Schaltregel',
    group: 'Erste Schritte',
    icon: Zap,
    keywords: 'schalten aktiviert feuern regel gewicht',
    body: () => (
      <>
        <p className="lead">Eine Transition darf schalten (sie ist „aktiviert“), wenn in jeder Eingangsstelle genug Marken liegen. Beim Schalten passiert genau das:</p>
        <ol>
          <li>Aus jeder Eingangsstelle werden so viele Marken entnommen, wie das Kantengewicht angibt.</li>
          <li>In jede Ausgangsstelle werden so viele Marken gelegt, wie das Kantengewicht angibt.</li>
        </ol>
        <Fig w={520} h={130} caption="Vorher: 3 und 1 Marken. „t“ braucht 2 aus der oberen Stelle und 1 aus der unteren. Nachher: 1 und 0 – oben rechts liegen nun 2 Marken.">
          <P x={40} y={40} tokens={3} />
          <P x={40} y={100} tokens={1} />
          <A x1={58} y1={45} x2={110} y2={64} w={2} />
          <A x1={58} y1={95} x2={110} y2={76} />
          <T x={120} y={70} enabled label="t" />
          <A x1={130} y1={70} x2={182} y2={70} w={2} />
          <P x={200} y={70} />
          <Then x={262} y={70} />
          <P x={320} y={40} tokens={1} />
          <P x={320} y={100} tokens={0} />
          <A x1={338} y1={45} x2={390} y2={64} w={2} />
          <A x1={338} y1={95} x2={390} y2={76} />
          <T x={400} y={70} label="t" />
          <A x1={410} y1={70} x2={462} y2={70} w={2} />
          <P x={480} y={70} tokens={2} />
        </Fig>
        <p>
          Marken werden also nicht „bewegt“, sondern verbraucht und neu erzeugt – die Anzahl kann sich ändern. In der Simulation zeigt eine Animation trotzdem,
          woher die Marken kommen und wohin sie gehen.
        </p>
        <Tip>
          Fährst du in der Simulation mit der Maus über eine Transition, erklärt HPSim Studio, <b>warum</b> sie gerade (nicht) schalten kann – jede Bedingung mit
          ✓ oder ✗.
        </Tip>
        <p>
          Zusätzlich können <Go to="capacity">Kapazitäten</Go>, <Go to="arcs">Test- und Inhibitorkanten</Go> und das <Go to="timing">Zeitverhalten</Go> das Schalten
          einschränken.
        </p>
      </>
    ),
  },
  {
    id: 'elements',
    title: 'Elemente & Eigenschaften',
    group: 'Modellieren',
    icon: Boxes,
    keywords: 'stelle transition name kapazität marken priorität farbe notiz beschriftung',
    body: () => (
      <>
        <p className="lead">Wähle ein Element aus – rechts im Eigenschaftenbereich lässt sich alles einstellen. Mehrere ausgewählte Elemente bearbeitest du gemeinsam.</p>
        <h3>Stelle</h3>
        <ul>
          <li>
            <b>Name</b> – Doppelklick auf das Element benennt es direkt auf der Zeichenfläche um.
          </li>
          <li>
            <b>Marken</b> – Anfangsmarkierung. Schnell ändern: Rechtsklick auf die Stelle → „Marke hinzufügen“ bzw. „Marke entfernen“.
          </li>
          <li>
            <b>Kapazität</b> – Höchstzahl an Marken (0 = unbegrenzt), siehe <Go to="capacity">Kapazitäten</Go>.
          </li>
          <li>
            <b>Größe, Farbe, Notiz</b> – rein zur Darstellung; Notizen erscheinen als Tooltip.
          </li>
        </ul>
        <h3>Transition</h3>
        <ul>
          <li>
            <b>Zeitverhalten</b> – sofort, deterministisch, exponentiell oder gleichverteilt (siehe <Go to="timing">Zeitverhalten</Go>).
          </li>
          <li>
            <b>Priorität</b> – entscheidet bei Konflikten, wenn die Strategie „Priorität“ gewählt ist (siehe <Go to="conflicts">Konflikte</Go>).
          </li>
          <li>
            <b>Ausrichtung</b> – senkrecht oder waagerecht (<K>Strg</K>+<K>R</K> dreht um 90°).
          </li>
        </ul>
        <h3>Kante</h3>
        <ul>
          <li>
            <b>Gewicht</b> – wie viele Marken pro Schalten fließen (1 wird nicht angezeigt).
          </li>
          <li>
            <b>Art</b> – normal, Test- oder Inhibitorkante (siehe <Go to="arcs">Kantentypen</Go>).
          </li>
          <li>
            <b>Knickpunkte</b> – Doppelklick auf die Kante fügt einen hinzu, ziehen verschiebt, Doppelklick auf den Punkt entfernt ihn.
          </li>
        </ul>
        <h3>Beschriftungen</h3>
        <p>
          Namen, Kapazitäten, Zeiten und Gewichte werden automatisch so platziert, dass sie sich möglichst nicht überdecken. Du kannst jede Beschriftung mit der
          Maus verschieben; „Beschriftungen zurücksetzen“ im Kontextmenü stellt die Automatik wieder her.
        </p>
        <h3>Zeichenobjekte</h3>
        <p>Rechtecke, Ellipsen, Linien, Polygone und Texte dienen der Gestaltung (Rahmen, Überschriften, Erklärungen) und haben keinen Einfluss auf die Simulation.</p>
      </>
    ),
  },
  {
    id: 'arcs',
    title: 'Kantentypen',
    group: 'Modellieren',
    icon: Spline,
    keywords: 'testkante inhibitorkante lesekante verbotskante gewicht',
    body: () => (
      <>
        <p className="lead">Neben normalen Kanten gibt es zwei Sonderkanten, die nur von einer Stelle zu einer Transition führen können.</p>
        <div className="help-arcgrid">
          <Fig w={150} h={80} caption="Normale Kante: verbraucht Marken.">
            <P x={30} y={40} tokens={2} />
            <A x1={50} y1={40} x2={112} y2={40} w={2} />
            <T x={122} y={40} enabled />
          </Fig>
          <Fig w={150} h={80} caption="Testkante: verlangt Marken, verbraucht sie aber nicht.">
            <P x={30} y={40} tokens={1} />
            <A x1={50} y1={40} x2={112} y2={40} kind="test" />
            <T x={122} y={40} enabled />
          </Fig>
          <Fig w={150} h={80} caption="Inhibitorkante: Transition schaltet nur, wenn die Stelle (fast) leer ist.">
            <P x={30} y={40} tokens={0} />
            <A x1={50} y1={40} x2={115} y2={40} kind="inhibitor" />
            <T x={122} y={40} enabled />
          </Fig>
        </div>
        <dl className="help-dl">
          <dt>Testkante (gestrichelt)</dt>
          <dd>
            Die Transition ist nur aktiviert, wenn mindestens <i>Gewicht</i> Marken in der Stelle liegen. Beim Schalten bleiben die Marken liegen. Beispiel: „Lesen
            ist nur möglich, solange das Licht an ist“.
          </dd>
          <dt>Inhibitorkante (mit Kreis)</dt>
          <dd>
            Die Transition ist nur aktiviert, wenn <b>weniger</b> als <i>Gewicht</i> Marken in der Stelle liegen – bei Gewicht 1 also nur bei leerer Stelle. Beispiel:
            „Das Band läuft nur, solange kein Not-Aus gedrückt ist“.
          </dd>
        </dl>
        <Tip>Das Beispiel „Test- und Inhibitorkanten“ auf der Startseite zeigt beide Kanten in Aktion.</Tip>
        <p>
          Die Art einer Kante stellst du im Eigenschaftenbereich ein. Kanten von einer Transition zu einer Stelle sind immer normale Kanten. Mit „Kantenrichtung umkehren“
          im Kontextmenü drehst du eine Kante um.
        </p>
      </>
    ),
  },
  {
    id: 'capacity',
    title: 'Kapazitäten',
    group: 'Modellieren',
    icon: Hand,
    keywords: 'kapazität grenze puffer voll streng schwach',
    body: () => (
      <>
        <p className="lead">Eine Stelle mit Kapazität K kann höchstens K Marken aufnehmen. Eine Transition, die die Grenze überschreiten würde, ist nicht aktiviert.</p>
        <Fig w={300} h={90} caption="Der Puffer ist voll (3 von 3) – „erzeugen“ muss warten, bis wieder Platz ist.">
          <T x={40} y={45} label="erzeugen" />
          <A x1={50} y1={45} x2={128} y2={45} />
          <P x={150} y={45} tokens={3} cap={3} label="Puffer" />
          <A x1={170} y1={45} x2={240} y2={45} />
          <T x={250} y={45} label="verbrauchen" enabled />
        </Fig>
        <h3>Strenge und schwache Regel</h3>
        <p>
          Was passiert, wenn eine Transition aus einer vollen Stelle Marken entnimmt <i>und</i> wieder hineinlegt (eine Schlinge)? Das legst du in den{' '}
          <b>Netz-Einstellungen</b> fest:
        </p>
        <ul>
          <li>
            <b>Streng</b> (Standard, wie im Original-HPSim): Die neuen Marken müssen zusätzlich Platz finden – die Transition ist bei voller Stelle blockiert.
          </li>
          <li>
            <b>Schwach</b>: Erst wird entnommen, dann hinzugefügt – die Transition darf schalten, solange das Ergebnis die Kapazität einhält.
          </li>
        </ul>
        <Tip>In der Simulation zeigt ein roter Ring, dass eine Stelle ihre Kapazität erreicht hat.</Tip>
      </>
    ),
  },
  {
    id: 'timing',
    title: 'Zeitverhalten',
    group: 'Modellieren',
    icon: Clock,
    keywords: 'zeit verzögerung deterministisch exponentiell gleichverteilt zeitbasis delta zeitschritt',
    body: () => (
      <>
        <p className="lead">Jede Transition hat ein Zeitverhalten. Damit lassen sich Bearbeitungszeiten, Ankünfte, Ausfälle oder Ampelphasen modellieren.</p>
        <table className="table help-table">
          <thead>
            <tr>
              <th>Zeitverhalten</th>
              <th>Bedeutung</th>
              <th>Beispiel</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Sofort</b>
              </td>
              <td>Schaltet im nächsten Schritt, sobald sie aktiviert ist.</td>
              <td>Entscheidung, Weiterleitung</td>
            </tr>
            <tr>
              <td>
                <b>Deterministisch</b>
              </td>
              <td>Schaltet genau nach der eingestellten Verzögerung.</td>
              <td>Gelbphase 3 s</td>
            </tr>
            <tr>
              <td>
                <b>Exponentialverteilt</b>
              </td>
              <td>Zufällige Verzögerung mit dem eingestellten Mittelwert – „gedächtnislos“.</td>
              <td>Kundenankünfte, Ausfälle</td>
            </tr>
            <tr>
              <td>
                <b>Gleichverteilt</b>
              </td>
              <td>Zufällige Verzögerung zwischen Minimum und Maximum.</td>
              <td>Bearbeitung 4–6 min</td>
            </tr>
          </tbody>
        </table>
        <h3>So läuft die Zeit (wie im Original-HPSim)</h3>
        <ol>
          <li>
            Die Simulation schreitet in Schritten der Länge <b>Δt</b> voran (Netz-Einstellungen → Zeitschritt).
          </li>
          <li>Wird eine Transition aktiviert, startet ihr Zeitgeber mit der (ggf. zufällig gezogenen) Verzögerung.</li>
          <li>Pro Schritt läuft der Zeitgeber um Δt ab. Ist er abgelaufen, schaltet die Transition.</li>
          <li>
            Wird die Transition vorher <b>deaktiviert</b> (z. B. weil eine andere die Marken genommen hat), verfällt ihr Zeitgeber. Bei erneuter Aktivierung beginnt
            er von vorn.
          </li>
          <li>Alle schaltbereiten Transitionen schalten im selben Schritt. Neu erzeugte Marken stehen erst im nächsten Schritt zur Verfügung.</li>
        </ol>
        <Tip>
          Während der Simulation zeigt ein Fortschrittsring an der Transition, wie viel der Verzögerung schon verstrichen ist. Wähle Δt klein genug im Verhältnis
          zu deinen Verzögerungen, sonst werden Zeiten auf ganze Schritte gerundet.
        </Tip>
        <p>
          Die <Go to="analysis">Analyse</Go> betrachtet das Netz ohne Zeiten: Sie untersucht alle Reihenfolgen, die rein von den Marken her möglich sind.
        </p>
      </>
    ),
  },
  {
    id: 'conflicts',
    title: 'Konflikte',
    group: 'Modellieren',
    icon: GitFork,
    keywords: 'konflikt wettbewerb priorität zufall klassisch nebenläufig',
    body: () => (
      <>
        <p className="lead">
          Ein Konflikt liegt vor, wenn mehrere Transitionen gleichzeitig schalten möchten, die Marken aber nur für eine reichen. Welche gewinnt, bestimmt die
          Konfliktstrategie in den Netz-Einstellungen.
        </p>
        <Fig w={260} h={110} caption="Eine Marke, zwei Abnehmer: Nur eine Transition kann schalten.">
          <P x={40} y={55} tokens={1} label="Auftrag" />
          <A x1={58} y1={48} x2={150} y2={28} />
          <A x1={58} y1={62} x2={150} y2={82} />
          <T x={160} y={28} enabled label="" h={34} />
          <T x={160} y={82} enabled label="" h={34} />
          <text x={180} y={32} fontSize={11} style={{ fill: 'var(--muted)' }}>
            Maschine A
          </text>
          <text x={180} y={86} fontSize={11} style={{ fill: 'var(--muted)' }}>
            Maschine B
          </text>
        </Fig>
        <dl className="help-dl">
          <dt>Zufall</dt>
          <dd>Unter den konkurrierenden Transitionen wird zufällig gewählt – fair im Mittel.</dd>
          <dt>Priorität</dt>
          <dd>Die Transition mit der höchsten Priorität gewinnt; bei gleicher Priorität entscheidet der Zufall.</dd>
          <dt>Klassisch (HPSim)</dt>
          <dd>
            Wie im Original: Teilen sich schaltbereite Transitionen eine Eingangsstelle (Verzweigung) oder eine Ausgangsstelle (Zusammenführung), darf pro Schritt
            nur eine zufällig gewählte davon schalten. Alte .hps-Dateien verwenden diese Strategie.
          </dd>
        </dl>
        <Tip>
          In der Simulation sind Transitionen im Konflikt mit einem orangefarbenen Schein markiert, und das Protokoll vermerkt, wer gewonnen hat. Mit einem{' '}
          <b>festen Zufallsstartwert</b> lässt sich ein Lauf exakt wiederholen.
        </Tip>
      </>
    ),
  },
  {
    id: 'editor',
    title: 'Zeichnen & Bearbeiten',
    group: 'Programm',
    icon: Pencil,
    keywords: 'werkzeug auswählen verschieben ausrichten raster gruppieren kopieren bausteine zoom',
    body: () => (
      <>
        <h3>Werkzeuge</h3>
        <ul>
          <li>
            <K>V</K> Auswahl · <K>H</K> Hand · <K>P</K> Stelle · <K>T</K> Transition · <K>K</K> Kante · <K>X</K> Text · <K>R</K> Rechteck · <K>E</K> Ellipse ·{' '}
            <K>L</K> Linie · <K>Y</K> Polygon
          </li>
          <li>
            Mit dem Stellen- oder Transitionswerkzeug setzt jeder Klick ein neues Element – bis du <K>Esc</K> drückst. Ein Polygon schließt du mit Doppelklick oder{' '}
            <K>Enter</K>.
          </li>
          <li>
            Kanten: mit dem Kantenwerkzeug von einem Element zum anderen ziehen – oder beide nacheinander anklicken; Klicks ins Leere setzen Knickpunkte. Ziehst du ins
            Leere, entsteht automatisch das passende Gegenstück.
          </li>
        </ul>
        <h3>Auswählen und Anordnen</h3>
        <ul>
          <li>
            Rahmen aufziehen wählt mehrere Elemente, <K>Umschalt</K>+Klick ergänzt die Auswahl, <K>Strg</K>+<K>A</K> wählt alles.
          </li>
          <li>
            Beim Verschieben helfen Hilfslinien beim Ausrichten an anderen Elementen. Pfeiltasten verschieben um eine Rasterweite (mit <K>Umschalt</K> fünf, mit{' '}
            <K>Alt</K> ein Pixel).
          </li>
          <li>Ausrichten, Verteilen, Gruppieren und Ebenen findest du im Menü „Anordnen“ und im Kontextmenü (Rechtsklick).</li>
          <li>
            <b>Automatisch anordnen</b> (Menü „Anordnen“) ordnet das ganze Netz übersichtlich von links nach rechts – Stellen mit Anfangsmarken stehen vorn,
            Kanten laufen möglichst kreuzungsarm. Mit <K>Strg</K>+<K>Z</K> ist alles wieder wie vorher.
          </li>
          <li>
            <K>Strg</K>+<K>D</K> dupliziert, Kopieren/Einfügen funktioniert auch zwischen verschiedenen Netzen.
          </li>
        </ul>
        <h3>Ansicht</h3>
        <ul>
          <li>Mausrad oder Zwei-Finger-Geste zoomt, mittlere Maustaste oder Leertaste+Ziehen verschiebt.</li>
          <li>
            <K>F</K> zeigt das ganze Netz, <K>Umschalt</K>+<K>F</K> die Auswahl. Die Übersichtskarte unten rechts zeigt, wo du bist.
          </li>
        </ul>
        <h3>Bausteine</h3>
        <p>
          Über „Bausteine“ in der Werkzeugleiste fügst du fertige Muster ein – z. B. Mutex, Puffer, Verzweigung oder Synchronisation. Sie sind ein guter
          Ausgangspunkt für eigene Modelle.
        </p>
        <h3>Netz prüfen</h3>
        <p>Der Reiter „Prüfung“ links findet typische Fehler: doppelte Namen, unverbundene Elemente, Transitionen ohne Eingang usw. Ein Klick zeigt die Stelle im Netz.</p>
        <p>
          Eine vollständige Liste aller Tastenkürzel öffnest du mit <K>?</K>.
        </p>
      </>
    ),
  },
  {
    id: 'simulation',
    title: 'Simulation',
    group: 'Programm',
    icon: Play,
    keywords: 'simulation starten schritt schnell protokoll diagramm statistik csv verlauf geschwindigkeit',
    body: () => (
      <>
        <p className="lead">
          Im Modus <b>Simulieren</b> (<K>F5</K>) läuft dein Netz. Die Anfangsmarkierung bleibt dabei unverändert – „Zurücksetzen“ stellt sie jederzeit wieder her.
        </p>
        <h3>Steuerung</h3>
        <ul>
          <li>
            <b>Einzelschritt</b> (<K>Leertaste</K> oder <K>F10</K>): ein Zeitschritt Δt.
          </li>
          <li>
            <b>Start/Pause</b> (<K>F9</K>): Echtzeitlauf mit Animation; die Geschwindigkeit regelst du mit dem Schieberegler.
          </li>
          <li>
            <b>Schnelllauf</b> (<K>F11</K>): so schnell wie möglich, ohne Animation – ideal für Statistiken.
          </li>
          <li>
            <b>Zurück</b> (<K>Umschalt</K>+<K>F10</K>): macht den letzten Schritt rückgängig. <b>Zurücksetzen</b> (<K>F8</K>) stellt den Anfang wieder her.
          </li>
          <li>
            <b>Klick auf eine aktivierte Transition</b>: schaltet genau diese (Token-Spiel von Hand).
          </li>
        </ul>
        <h3>Auswertung (unten)</h3>
        <dl className="help-dl">
          <dt>Protokoll</dt>
          <dd>Jedes Schalten, jeder Konflikt und jede Verklemmung – mit Zeitpunkt. Überfahren hebt die beteiligten Elemente hervor.</dd>
          <dt>Diagramm</dt>
          <dd>Markenverlauf ausgewählter Stellen über die Zeit. Klicke auf Stellen in der Legende, um sie ein- und auszublenden.</dd>
          <dt>Statistik</dt>
          <dd>Mittelwert (zeitgewichtet), Minimum, Maximum je Stelle und Schalthäufigkeit/Durchsatz je Transition.</dd>
          <dt>Verlauf</dt>
          <dd>Die Markierung nach jedem Schritt als Tabelle – exportierbar als CSV für Excel (wie die Ausgabedatei des Original-HPSim).</dd>
        </dl>
        <Tip>
          „Markierung übernehmen“ macht den aktuellen Simulationszustand zur neuen Anfangsmarkierung – praktisch, um ein Netz in einen bestimmten Zustand zu
          bringen.
        </Tip>
        <p>
          Stopp-Bedingungen (maximale Zeit oder Schrittzahl), den Zeitschritt und die <Go to="conflicts">Konfliktstrategie</Go> stellst du in den Netz-Einstellungen
          ein.
        </p>
      </>
    ),
  },
  {
    id: 'analysis',
    title: 'Analyse',
    group: 'Programm',
    icon: FlaskConical,
    keywords: 'analyse verklemmung deadlock beschränkt sicher lebendig reversibel invariante zustandsgraph erreichbarkeit matrix inzidenz',
    body: () => (
      <>
        <p className="lead">
          Im Modus <b>Analysieren</b> (<K>F6</K>) berechnet HPSim Studio alle erreichbaren Zustände deines Netzes und beantwortet damit grundlegende Fragen – mit
          einer Erklärung in Klartext.
        </p>
        <dl className="help-dl">
          <dt>Beschränktheit / Sicherheit</dt>
          <dd>Bleibt die Markenzahl jeder Stelle unter einer festen Grenze? Sicher heißt: nie mehr als eine Marke pro Stelle.</dd>
          <dt>Verklemmungsfreiheit</dt>
          <dd>
            Gibt es einen Zustand, in dem nichts mehr schalten kann? Wenn ja, zeigt die Analyse den kürzesten Weg dorthin – und spielt ihn auf Knopfdruck in der
            Simulation vor.
          </dd>
          <dt>Tote Transitionen</dt>
          <dd>Transitionen, die niemals schalten können – oft ein Modellierungsfehler.</dd>
          <dt>Lebendigkeit</dt>
          <dd>Kann jede Transition aus jedem Zustand heraus irgendwann wieder schalten?</dd>
          <dt>Reversibilität</dt>
          <dd>Kommt das Netz aus jedem Zustand zurück in den Anfangszustand?</dd>
          <dt>P- und T-Invarianten</dt>
          <dd>Erhaltungssätze („die Summe dieser Stellen ist immer 1“) und Zyklen („diese Transitionen zusammen führen zum Ausgangszustand zurück“).</dd>
        </dl>
        <h3>Zustandsgraph</h3>
        <p>
          Jeder Knoten ist eine erreichbare Markierung, jede Kante ein Schalten. Klickst du auf einen Zustand, zeigt die Zeichenfläche diese Markierung; ein Klick
          auf eine grün umrandete Transition geht zum Folgezustand. So kannst du das Netz „durchwandern“.
        </p>
        <h3>Grenzen</h3>
        <ul>
          <li>Zeitverhalten und Prioritäten werden nicht berücksichtigt – die Analyse untersucht alle möglichen Reihenfolgen.</li>
          <li>
            Bei sehr großen Zustandsräumen bricht die Analyse am Limit ab; Ergebnisse heißen dann „unbekannt“. Das Limit lässt sich auf bis zu 100 000 Zustände
            erhöhen.
          </li>
          <li>
            Unbeschränkte Netze werden mit dem Überdeckungsgraphen (Karp–Miller) untersucht; „ω“ steht dabei für „beliebig viele Marken“.
          </li>
        </ul>
        <p>
          Die Matrizen (Pre, Post, Inzidenz C) kannst du kopieren oder im Textformat des Original-HPSim exportieren („Export Net“).
        </p>
      </>
    ),
  },
  {
    id: 'files',
    title: 'Dateien & Export',
    group: 'Programm',
    icon: FileUp,
    keywords: 'speichern öffnen import export pnml svg png drucken hps sicherung autosave',
    body: () => (
      <>
        <h3>Speichern und Öffnen</h3>
        <ul>
          <li>
            HPSim Studio speichert Netze als <b>.hpsim</b>-Datei (lesbares JSON). <K>Strg</K>+<K>S</K> speichert, <K>Strg</K>+<K>O</K> öffnet.
          </li>
          <li>Dateien lassen sich auch einfach auf das Fenster ziehen. Mehrere Netze öffnen sich in eigenen Tabs.</li>
          <li>
            <b>Automatische Sicherung:</b> Alle offenen Netze werden laufend im Browser gesichert. Nach einem Neustart oder Absturz sind sie wieder da.
          </li>
        </ul>
        <h3>Importieren</h3>
        <ul>
          <li>
            <b>HPSim 1.x (.hps)</b> – alte Netze werden mit Positionen, Beschriftungen, Zeiten und Einstellungen übernommen (siehe <Go to="legacy">Umstieg</Go>).
          </li>
          <li>
            <b>PNML</b> – das Austauschformat für Petri-Netz-Werkzeuge (z. B. aus PIPE, WoPeD, TINA).
          </li>
        </ul>
        <h3>Exportieren</h3>
        <ul>
          <li>
            <b>SVG</b> (Vektorgrafik, ideal für Dokumente) und <b>PNG</b> (Bild) – immer im hellen Design, gut für Ausdrucke.
          </li>
          <li>
            <b>Drucken</b> (<K>Strg</K>+<K>P</K>) – das Netz wird automatisch auf die Seite eingepasst.
          </li>
          <li>
            <b>PNML</b> für andere Werkzeuge, <b>Text</b> mit Matrizen wie „Export Net“ im Original, <b>CSV</b> mit dem Simulationsverlauf.
          </li>
        </ul>
        <Tip>
          Die Online-Version läuft komplett in deinem Browser – deine Netze verlassen deinen Rechner nicht. Die Datei „HPSim-Studio.html“ funktioniert sogar ohne
          Internet per Doppelklick.
        </Tip>
      </>
    ),
  },
  {
    id: 'legacy',
    title: 'Umstieg von HPSim 1.1',
    group: 'Mehr',
    icon: History,
    keywords: 'hpsim alt original umstieg hps import unterschiede',
    body: () => (
      <>
        <p className="lead">HPSim Studio ist eine vollständige Neuentwicklung, die das Verhalten des Original-HPSim nachbildet und vieles ergänzt.</p>
        <table className="table help-table">
          <thead>
            <tr>
              <th>HPSim 1.1</th>
              <th>HPSim Studio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Place / Transition / Arc</td>
              <td>Stelle / Transition / Kante – zusätzlich Gruppen, Farben, Notizen</td>
            </tr>
            <tr>
              <td>Test Arc, Inhibitor Arc</td>
              <td>Testkante, Inhibitorkante (gleiche Semantik)</td>
            </tr>
            <tr>
              <td>Time Base, Zeitmodelle</td>
              <td>Zeitschritt Δt, gleiche Zeitmodelle und Zeitsemantik</td>
            </tr>
            <tr>
              <td>Kapazität, Kantengewichte</td>
              <td>identisch, wahlweise strenge oder schwache Kapazitätsregel</td>
            </tr>
            <tr>
              <td>Zufällige Konfliktlösung</td>
              <td>Strategie „Klassisch“ – plus „Zufall“ und „Priorität“</td>
            </tr>
            <tr>
              <td>Output File</td>
              <td>CSV-Export des Verlaufs, Diagramm und Statistik direkt im Programm</td>
            </tr>
            <tr>
              <td>Export Net</td>
              <td>Textexport mit Inzidenzmatrix – plus Analyse, Zustandsgraph, Invarianten</td>
            </tr>
            <tr>
              <td>kein Rückgängig</td>
              <td>unbegrenztes Rückgängig/Wiederholen</td>
            </tr>
          </tbody>
        </table>
        <h3>Alte Dateien öffnen</h3>
        <p>
          Öffne eine .hps-Datei wie jede andere Datei. Positionen, Beschriftungen, Marken, Kapazitäten, Zeiten, Kantenverläufe und Einstellungen werden übernommen
          und leicht vergrößert dargestellt. Hinweise zum Import erscheinen als Meldung. Gespeichert wird im neuen .hpsim-Format – die Originaldatei bleibt
          unverändert.
        </p>
        <Tip>Vier Original-Beispiele aus HPSim 1.1 findest du auf der Startseite unter „Original-HPSim“.</Tip>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Häufige Fragen',
    group: 'Mehr',
    icon: CircleHelp,
    keywords: 'faq frage problem hilfe warum',
    body: () => (
      <>
        <dl className="help-dl faq">
          <dt>Warum schaltet meine Transition nicht?</dt>
          <dd>
            Fahre in der Simulation mit der Maus darüber: Die Kurzinfo listet jede Bedingung mit ✓ oder ✗ – fehlende Marken, volle Ausgangsstelle, Inhibitorkante
            oder laufende Verzögerung.
          </dd>
          <dt>Ich kann keine Kante zwischen zwei Stellen ziehen.</dt>
          <dd>Das ist Absicht: In Petri-Netzen verbinden Kanten immer eine Stelle mit einer Transition. Füge eine Transition dazwischen ein.</dd>
          <dt>Die Simulation hält von allein an.</dt>
          <dd>Entweder ist das Netz verklemmt (nichts kann mehr schalten) oder eine Stopp-Bedingung aus den Netz-Einstellungen wurde erreicht. Das Protokoll sagt, was passiert ist.</dd>
          <dt>Die Analyse sagt „unbekannt“.</dt>
          <dd>Der Zustandsraum ist größer als das Limit. Erhöhe das Limit oben im Analysebereich oder vereinfache das Netz.</dd>
          <dt>Wo sind meine Netze gespeichert?</dt>
          <dd>
            Gespeicherte Dateien liegen dort, wo du sie abgelegt hast. Zusätzlich sichert HPSim Studio alle offenen Netze automatisch im Browser – ein
            versehentliches Schließen kostet also keine Arbeit.
          </dd>
          <dt>Kann ich ohne Internet arbeiten?</dt>
          <dd>Ja. Lade „HPSim-Studio.html“ herunter und öffne sie per Doppelklick – alles läuft lokal in deinem Browser.</dd>
          <dt>Etwas ist schiefgegangen.</dt>
          <dd>
            Fehler werden abgefangen, ohne dass Daten verloren gehen. Mit <K>Strg</K>+<K>Z</K> machst du jeden Schritt rückgängig. Im seltenen Fall eines
            Programmfehlers bietet HPSim Studio an, dein Netz als Datei zu sichern.
          </dd>
        </dl>
      </>
    ),
  },
  {
    id: 'about',
    title: 'Über HPSim Studio',
    group: 'Mehr',
    icon: Info,
    keywords: 'über version lizenz autor',
    body: () => (
      <>
        <p className="lead">
          <b>HPSim Studio 2.0</b> – Editor, Simulator und Analysewerkzeug für Petri-Netze.
        </p>
        <p>
          Unabhängige Neuentwicklung auf Grundlage des Petri-Netz-Simulators <b>HPSim 1.1</b> von Henryk Anschütz (© 1999–2001). Das Dateiformat der Originalversion
          wird unterstützt; die Original-Beispielnetze sind mit Quellenangabe enthalten.
        </p>
        <ul>
          <li>Läuft in jedem modernen Browser, offline als einzelne HTML-Datei oder als Desktop-Anwendung.</li>
          <li>Quelloffen unter der MIT-Lizenz.</li>
          <li>Keine Datenübertragung: Alle Berechnungen finden lokal statt.</li>
        </ul>
        <p className="faint">
          Gebaut mit React, TypeScript und Vite. <ArrowLeftRight size={12} style={{ verticalAlign: '-2px' }} /> Rückmeldungen und Fehlerberichte sind willkommen.
        </p>
      </>
    ),
  },
];

export const TOPIC_MAP: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
