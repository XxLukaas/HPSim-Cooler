# HPSim Studio

**Petri-Netze entwerfen, simulieren und verstehen – die moderne Neuauflage von HPSim.**

HPSim Studio ist eine komplette Neuentwicklung des Petri-Netz-Simulators *HPSim 1.1* (1999–2001).
Alles, was das Original konnte, ist dabei – und sehr viel mehr: eine moderne, übersichtliche
Oberfläche mit hellem und dunklem Design, animierte Marken, Rückgängig/Wiederholen,
Diagramme, Statistik, eine vollständige Netzanalyse (Erreichbarkeitsgraph, Invarianten,
Lebendigkeit …), verständliche Erklärungen und ein interaktives Tutorial.
Alte `.hps`-Dateien des Original-HPSim lassen sich direkt öffnen.

> Läuft im Browser (auch offline als einzelne HTML-Datei) und als Desktop-Programm für
> Windows, macOS und Linux.

---

## Inhalt

- [Highlights](#highlights)
- [Starten](#starten)
- [Bedienung in Kürze](#bedienung-in-kürze)
- [Simulation – so funktioniert die Zeit](#simulation--so-funktioniert-die-zeit)
- [Analyse](#analyse)
- [Dateiformate](#dateiformate)
- [Was ist neu gegenüber HPSim 1.1?](#was-ist-neu-gegenüber-hpsim-11)
- [Entwicklung](#entwicklung)
- [Projektstruktur](#projektstruktur)
- [Lizenz & Dank](#lizenz--dank)

## Highlights

| Bereich | Was du bekommst |
| --- | --- |
| **Editor** | Stellen, Transitionen, Kanten (normal, Test, Inhibitor), Kapazitäten, Gewichte, Knickpunkte, Texte, Rechtecke, Ellipsen, Linien, Polygone, Gruppen, Ausrichten & Verteilen, Raster mit Einrasten, unbegrenztes Rückgängig/Wiederholen, Kopieren/Einfügen (auch zwischen Netzen), Mehrfachauswahl, Kontextmenüs, Befehlspalette (Strg+K), **automatisches Anordnen** (übersichtliches Schichtenlayout per Klick) |
| **Schnell modellieren** | Kante ins Leere ziehen → das passende Gegenstück (Stelle/Transition) wird automatisch angelegt und verbunden. Doppelklick zum Umbenennen. Beschriftungen platzieren sich automatisch kantenfrei. |
| **Simulation** | Einzelschritt, Lauf mit Animation, Schnelllauf, **Schritt zurück**, Token-Spiel per Klick auf Transitionen, Zufallsschritt, sofortige/deterministische/exponentielle/gleichverteilte Verzögerungen, drei Konfliktstrategien, reproduzierbare Zufallszahlen |
| **Verstehen** | „Warum schaltet diese Transition nicht?“ – jede Bedingung wird im Klartext erklärt. Aktivierte Transitionen leuchten, laufende Verzögerungen zeigen einen Fortschrittsbalken, Marken wandern sichtbar über die Kanten. |
| **Auswertung** | Protokoll, Live-Diagramm der Markenzahlen, Statistik (Min/Max/zeitgewichteter Mittelwert, Durchsatz), Verlaufstabelle, CSV-Export für Excel |
| **Analyse** | Erreichbarkeits-/Überdeckungsgraph (zeichnet sich selbst, Zustände per Klick auf der Zeichenfläche durchwandern), Beschränktheit, Sicherheit, Verklemmungen (mit Schaltfolge zum Nachspielen), tote Transitionen, Lebendigkeit, Reversibilität, P-/T-Invarianten, Inzidenzmatrix, Netzklassen, Netzprüfung |
| **Dateien** | Eigenes Format `.hpsim` (JSON), **Import alter HPSim-Dateien `.hps`**, PNML-Import/-Export (auch Dateien aus PIPE u. a.), Export als PNG, SVG, Text (Inzidenzmatrix wie im Original), Drucken, automatische Sitzungssicherung |
| **Komfort** | Mehrere Netze als Tabs, Übersichtskarte, Zoom auf Mausposition, helles & dunkles Design, deutsche Oberfläche, Hilfe mit Grundlagen, interaktives Tutorial, viele Beispielnetze |
| **Stabilität** | Jede Eingabe wird geprüft, beschädigte Dateien werden repariert statt abzustürzen, Fehler in einzelnen Bereichen werden abgefangen, deine Arbeit wird laufend gesichert. Rund 140 automatische Tests (Unit- und End-to-End-Tests), die bei jedem Push auf GitHub laufen. |

## Starten

### Variante 0: Online über GitHub Pages (am einfachsten)

**➜ https://xxlukaas.github.io/HPSim-Cooler/**

Die fertig gebaute App liegt als `index.html` im Hauptordner des Repositorys und wird von
GitHub Pages direkt ausgeliefert. Einmalig einrichten (falls die Seite nicht erscheint):
*Settings → Pages → Build and deployment → Source: „Deploy from a branch“*, Branch
`claude/program-rebuild-modernize-w430lr` (bzw. der Standard-Branch), Ordner **/ (root)**, *Save*.
Nach 1–2 Minuten ist die Seite erreichbar. Alternativ kann als Source „GitHub Actions“ gewählt
werden – dann baut und veröffentlicht `.github/workflows/pages.yml` die App bei jedem Push.

Nach Änderungen am Code aktualisiert `npm run build:pages` die `index.html` im Hauptordner.

### Variante 1: Einzelne HTML-Datei (ohne Installation)

Die Datei **`HPSim-Studio.html`** im Hauptordner herunterladen und per Doppelklick öffnen –
sie läuft in jedem modernen Browser (Edge, Chrome, Firefox), auch ohne Internet.
Selbst erzeugen: `npm run build:standalone` (Ergebnis: `dist-standalone/index.html`).

### Variante 2: Desktop-Programm

Die Desktop-Version (Electron) bietet echte Datei-Dialoge und Dateizuordnungen
(Doppelklick auf `.hpsim`, `.hps` oder `.pnml` öffnet HPSim Studio), speichert Dateien
absturzsicher und fragt bei ungespeicherten Änderungen nach.

- **Installer bauen lassen:** Auf GitHub unter *Actions → Desktop-Release → Run workflow*.
  Nach ca. 10 Minuten liegen Windows-Installer und -Portable (`.exe`), macOS (`.dmg`) und
  Linux (`.AppImage`, `.deb`) als Artefakte zum Herunterladen bereit.
- **Release:** Wird ein Versions-Tag gepusht (z. B. `v2.0.0`), entsteht zusätzlich ein
  GitHub-Release mit allen Installern und der Offline-HTML-Datei.
- **Selbst bauen:** `npm install`, dann `npm --prefix desktop install` und
  `npm run desktop:build` (Ergebnis in `desktop/dist/`). Starten ohne Installer: `npm run desktop:dev`.
- Hinweis: Die Installer sind nicht signiert. Windows zeigt daher beim ersten Start eine
  SmartScreen-Warnung („Weitere Informationen → Trotzdem ausführen“).

### Variante 3: Entwicklungsserver

```bash
npm install
npm run dev        # öffnet http://localhost:5173
```

## Bedienung in Kürze

| Aktion | Maus / Tastatur |
| --- | --- |
| Stelle / Transition setzen | Werkzeug **P** bzw. **T**, dann auf die Fläche klicken |
| Kante ziehen | Werkzeug **K**, von Stelle zu Transition ziehen (oder umgekehrt); ins Leere ziehen erzeugt das Gegenstück |
| Auswählen / Verschieben | Werkzeug **V**; Rahmen aufziehen für Mehrfachauswahl; **Alt** beim Ziehen = ohne Raster |
| Umbenennen | Doppelklick auf Element (oder im Eigenschaftenbereich) |
| Knickpunkt einfügen / entfernen | Doppelklick auf Kante / auf Knickpunkt |
| Zoomen / Verschieben | Mausrad / Leertaste + Ziehen oder mittlere Maustaste |
| Simulieren | **F5**, Einzelschritt **Leertaste**, Start/Pause **F9**, Schritt zurück **Umschalt+F10** |
| Analysieren | **F6** |
| Befehlspalette | **Strg+K** |
| Alle Tastenkürzel | **?** |

## Simulation – so funktioniert die Zeit

Die Simulation arbeitet wie im Original in Schritten der **Zeitbasis Δt**:

1. Wird eine Transition aktiviert, startet ihr Zeitgeber mit ihrer Verzögerung
   (sofort = 0, deterministisch = fester Wert, exponentiell/gleichverteilt = Zufallswert).
2. In jedem Schritt läuft der Zeitgeber aller weiterhin aktivierten Transitionen um Δt ab.
3. Ist er abgelaufen, schaltet die Transition. Alle schaltbereiten Transitionen schalten im selben Schritt.
4. Wird eine Transition vorher deaktiviert, verfällt ihr Zeitgeber.
5. Konflikte (mehrere Transitionen wollen dieselben Marken) werden je nach Einstellung
   **zufällig**, nach **Priorität** oder **klassisch wie HPSim 1.1** aufgelöst.

Kapazitäten gelten wahlweise nach der *starken* (wie HPSim 1.1) oder *schwachen* Schaltregel.
Im Token-Spiel (Klick auf eine aktivierte Transition) schaltet diese sofort, unabhängig von der Zeit.

## Analyse

Die Analyse betrachtet das zugrunde liegende zeitlose Netz und berechnet den
Erreichbarkeitsgraphen (bei unbeschränkten Netzen den Überdeckungsgraphen nach Karp-Miller).
Daraus werden Beschränktheit, Sicherheit, Verklemmungen, tote Transitionen, Lebendigkeit und
Reversibilität bestimmt. Zusätzlich werden minimale P- und T-Invarianten (Farkas-Algorithmus)
und die Inzidenzmatrix angezeigt. Gefundene Verklemmungen lassen sich per Klick in der
Simulation nachspielen. Im Zustandsgraphen zeigt ein Klick auf einen Zustand dessen
Markierung direkt auf der Zeichenfläche; ein Klick auf eine aktivierte Transition geht zum
Folgezustand – so lässt sich der Zustandsraum Schritt für Schritt erkunden.

## Dateiformate

| Format | Lesen | Schreiben | Hinweis |
| --- | :-: | :-: | --- |
| `.hpsim` | ✓ | ✓ | Eigenes Format (JSON), verlustfrei |
| `.hps` | ✓ | – | Binärformat des Original-HPSim 1.x – Stellen, Transitionen, Kanten (inkl. Test/Inhibitor), Zeitmodelle, Beschriftungen, Texte, Rechtecke, Linien, Polygone, Gruppen und Einstellungen werden übernommen |
| `.pnml` | ✓ | ✓ | Petri Net Markup Language (ISO/IEC 15909-2) für den Austausch mit anderen Werkzeugen; Sonderfunktionen (Kapazitäten, Zeiten, Test-/Inhibitorkanten) bleiben über eine Erweiterung erhalten. Netze ohne Koordinaten werden automatisch angeordnet. |
| `.png`, `.svg` | – | ✓ | Grafik-Export |
| `.txt` | – | ✓ | Netz als Text: Inzidenzmatrix, Markierungsvektor, Kantentypen, Zeitmodelle |
| `.csv` | – | ✓ | Markierungsverlauf der Simulation (Excel-tauglich) |

## Was ist neu gegenüber HPSim 1.1?

- Rückgängig/Wiederholen (gab es im Original nicht), automatische Sicherung, Sitzungswiederherstellung
- Token-Animation entlang der Kanten, Fortschrittsanzeige für Verzögerungen, Schritt zurück
- Erklärungen, warum eine Transition (nicht) schalten kann
- Diagramme, Statistik und Verlauf statt nur einer CSV-Datei
- Vollständige Netzanalyse inklusive Erreichbarkeitsgraph und Invarianten
- Prioritäten und wählbare Konfliktstrategie, starke/schwache Kapazitätsregel, reproduzierbare Zufallszahlen
- PNML, SVG/PNG-Export, Befehlspalette, Tabs, Übersichtskarte, helles/dunkles Design
- Läuft überall – im Browser und als Desktop-App

## Entwicklung

```bash
npm install
npm run dev              # Entwicklungsserver
npm test                 # Unit-Tests (Vitest)
npm run test:e2e         # Ende-zu-Ende-Tests (Playwright)
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm run build            # Web-Version nach dist/
npm run build:standalone # Einzelne HTML-Datei nach dist-standalone/
npm run build:pages      # index.html/HPSim-Studio.html im Hauptordner aktualisieren
npm run desktop:dev      # Desktop-Version starten
npm run desktop:build    # Desktop-Installer bauen
```

Bei jedem Push prüft GitHub Actions (`.github/workflows/ci.yml`) Typen, Lint, Unit- und
End-to-End-Tests sowie den Build.

Technik: React 19, TypeScript, Vite, Zustand + Immer, Electron (Desktop), Vitest & Playwright.

## Projektstruktur

```
src/
  model/       Datenmodell, Geometrie, Dokument-Operationen
  sim/         Simulations-Engine, Zufallszahlen, Verlauf
  analysis/    Erreichbarkeitsgraph, Invarianten, Matrizen, Netzprüfung
  io/          Dateiformate (.hpsim, .hps-Import, PNML), Export, Desktop-Brücke
  store/       Anwendungszustand (Tabs, Rückgängig, Simulationssitzungen)
  editor/      Zeichenfläche, Darstellung, Interaktion
  panels/      Explorer, Eigenschaften, Simulation, Analyse
  app/         App-Hülle, Menüs, Befehle, Startseite
  help/        Hilfe, Tutorial, Tastenkürzel
  examples/    Beispielnetze (inkl. der Original-Beispiele von HPSim 1.1)
tests/         Unit-Tests (inkl. der Original-.hps-Dateien als Testdaten)
e2e/           Playwright-Tests
desktop/       Electron-Desktop-App
```

## Lizenz & Dank

Der Code von HPSim Studio steht unter der MIT-Lizenz (siehe `LICENSE`).

Das Original **HPSim** (© 1999–2001) stammt von **Henryk Anschütz**. HPSim Studio ist eine
unabhängige Neuentwicklung, die das Dateiformat des Originals lesen kann und seine Ideen
weiterführt. Die vier Original-Beispielnetze liegen nur zu Kompatibilitäts- und Lehrzwecken bei.
