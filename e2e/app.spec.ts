import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/legacy/${name}`, import.meta.url));

/** Sammelt Fehler aus der Seite – jeder Test prüft am Ende, dass keine aufgetreten sind. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Ohne Dateiauswahl-Dialog: Speichern fällt auf einen Download zurück. */
async function noSavePicker(page: Page) {
  await page.addInitScript(() => {
    (globalThis as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = undefined;
  });
}

async function menu(page: Page, top: string, item: string) {
  await page.locator('.menubar').getByText(top, { exact: true }).click();
  await page.locator('.menu').getByText(item).first().click();
}

async function openExample(page: Page, id: string) {
  await page.goto(`/?beispiel=${id}`);
  await expect(page.getByTestId('canvas')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('Startseite zeigt Aktionen und Beispiele', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('start-new')).toBeVisible();
  await expect(page.locator('.example-card')).toHaveCount(13);
  await page.getByTestId('example-mutex').click();
  await expect(page.getByTestId('doc-tab')).toHaveCount(1);
  await expect(page.getByTestId('statusbar')).toContainText('5 Stellen');
  expect(errors).toEqual([]);
});

test('Netz zeichnen, rückgängig machen und wiederholen', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByTestId('start-new').click();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByTestId('tool-place').click();
  await page.mouse.click(box.x + 250, box.y + 300);
  await page.getByTestId('tool-transition').click();
  await page.mouse.click(box.x + 420, box.y + 300);
  await page.getByTestId('tool-arc').click();
  await page.mouse.move(box.x + 250, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 300, { steps: 6 });
  await page.mouse.move(box.x + 420, box.y + 300, { steps: 6 });
  await page.mouse.up();
  // Ziehen ins Leere erzeugt automatisch eine Stelle
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 300, { steps: 6 });
  await page.mouse.move(box.x + 600, box.y + 300, { steps: 6 });
  await page.mouse.up();
  const status = page.getByTestId('statusbar');
  await expect(status).toContainText('2 Stellen');
  await expect(status).toContainText('1 Transition');
  await expect(status).toContainText('2 Kanten');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(status).toContainText('1 Kante');
  await page.keyboard.press('Control+y');
  await expect(status).toContainText('2 Kanten');
  expect(errors).toEqual([]);
});

test('Simulation: schalten, Schritt, Zurücksetzen', async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, 'mutex');
  await page.keyboard.press('F5');
  const steps = page.getByTestId('sim-step-count');
  await expect(steps).toHaveText('0');
  await page.keyboard.press('Space');
  await expect(steps).toHaveText('1');
  await page.keyboard.press('Space');
  await expect(steps).toHaveText('2');
  await expect(page.getByTestId('sim-log')).toBeVisible();
  await page.keyboard.press('F8');
  await expect(steps).toHaveText('0');
  // Schnelllauf bis zur Schrittgrenze ist beim Mutex unendlich – kurz laufen lassen und anhalten
  await page.keyboard.press('F9');
  await page.waitForTimeout(800);
  await page.keyboard.press('F9');
  expect(Number((await steps.textContent())!.replace(/\D/g, ''))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Analyse findet die Verklemmung der Philosophen und spielt sie vor', async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, 'philosophen');
  await page.keyboard.press('F6');
  const card = page.getByTestId('prop-deadlock');
  await expect(card).toHaveClass(/\bno\b/);
  await expect(card).toContainText('toter Zustand');
  await page.getByTestId('analysistab-graph').click();
  await expect(page.getByTestId('reach-graph')).toBeVisible();
  await page.getByTestId('rg-initial').click();
  await expect(page.getByTestId('rg-inspector')).toContainText('Zustand M0');
  await page.getByTestId('analysistab-invariants').click();
  await expect(page.getByTestId('pinv')).toHaveCount(10);
  await page.getByTestId('analysistab-matrix').click();
  await expect(page.getByTestId('analysis-matrix')).toBeVisible();
  await page.getByTestId('analysistab-overview').click();
  await page.getByTestId('witness-deadlock').click();
  // Wiedergabe in der Simulation: nach 5 Schritten ist das Netz verklemmt
  await expect(page.getByTestId('sim-step-count')).toHaveText('5', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('Hilfe, Tastenkürzel und Netz-Einstellungen', async ({ page }) => {
  const errors = watchErrors(page);
  await openExample(page, 'mutex');
  await page.keyboard.press('F1');
  const help = page.getByTestId('help-dialog');
  await expect(help).toBeVisible();
  await page.getByTestId('help-topic-timing').click();
  await expect(help.locator('h2')).toHaveText('Zeitverhalten');
  await help.getByPlaceholder('Thema suchen …').fill('inhibitor');
  await expect(page.getByTestId('help-topic-arcs')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
  await expect(page.getByTestId('shortcuts-dialog')).toContainText('Rückgängig');
  await page.keyboard.press('Escape');
  await menu(page, 'Bearbeiten', 'Netz-Einstellungen');
  await expect(page.getByTestId('doc-settings')).toBeVisible();
  const title = page.getByTestId('settings-title');
  await title.fill('Mein Mutex');
  await title.press('Enter');
  await page.getByTestId('doc-settings-done').click();
  await expect(page.getByTestId('doc-tab')).toContainText('Mein Mutex');
  expect(errors).toEqual([]);
});

test('Tutorial führt bis zum Ende', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByTestId('start-tutorial').click();
  const tut = page.getByTestId('tutorial');
  const title = tut.locator('h3');
  await expect(title).toHaveText('Willkommen!');
  await page.getByTestId('tutorial-next').click();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByTestId('tool-place').click();
  await page.mouse.click(box.x + 300, box.y + 320);
  await expect(title).toContainText('Transition');
  await page.getByTestId('tool-transition').click();
  await page.mouse.click(box.x + 450, box.y + 320);
  await expect(title).toContainText('Verbinden');
  await page.getByTestId('tool-arc').click();
  await page.mouse.move(box.x + 300, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 450, box.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect(title).toContainText('Wohin');
  await page.mouse.move(box.x + 450, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect(title).toContainText('Marken');
  await page.keyboard.press('v');
  await page.mouse.click(box.x + 300, box.y + 320);
  await page.getByTestId('prop-tokens').fill('3');
  await page.getByTestId('prop-tokens').press('Enter');
  await expect(title).toContainText('Simulation');
  await page.keyboard.press('F5');
  await expect(title).toContainText('Schalten');
  await page.mouse.click(box.x + 450, box.y + 320);
  await expect(title).toContainText('Laufen');
  await page.getByTestId('sim-run').click();
  await expect(title).toContainText('Analysieren');
  await page.keyboard.press('F6');
  await expect(title).toContainText('Geschafft');
  await page.getByTestId('tutorial-finish').click();
  await expect(tut).toBeHidden();
  expect(errors).toEqual([]);
});

test('Speichern, Exportieren und wieder öffnen', async ({ page }) => {
  const errors = watchErrors(page);
  await noSavePicker(page);
  await openExample(page, 'getraenkeautomat');
  // .hpsim speichern
  let dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = await (await dl).path();
  const json = JSON.parse(readFileSync(saved!, 'utf8'));
  expect(json.format).toBe('hpsim-studio');
  // Bild- und Austauschformate
  for (const [label, check] of [
    ['Exportieren als SVG', (s: string) => expect(s).toContain('<svg')],
    ['Exportieren als PNML', (s: string) => expect(s).toContain('<pnml')],
  ] as const) {
    dl = page.waitForEvent('download');
    await menu(page, 'Datei', label);
    check(readFileSync((await (await dl).path())!, 'utf8'));
  }
  dl = page.waitForEvent('download');
  await menu(page, 'Datei', 'Exportieren als PNG');
  const png = readFileSync((await (await dl).path())!);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  // Gespeicherte Datei wieder öffnen
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'Datei', 'Öffnen');
  await (await chooser).setFiles({ name: 'automat.hpsim', mimeType: 'application/json', buffer: readFileSync(saved!) });
  await expect(page.getByTestId('doc-tab')).toHaveCount(2);
  await expect(page.getByTestId('statusbar')).toContainText('6 Stellen');
  expect(errors).toEqual([]);
});

test('Alte HPSim-Dateien (.hps) öffnen und simulieren', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('start-open').click();
  await (await chooser).setFiles(fixture('time_sample.hps'));
  await expect(page.getByTestId('doc-tab')).toContainText('time_sample');
  await page.keyboard.press('F5');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
  await expect(page.getByTestId('sim-step-count')).toHaveText('5');
  expect(errors).toEqual([]);
});

test('Beschädigte Dateien führen zu einer Meldung statt zum Absturz', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('start-open').click();
  await (await chooser).setFiles({ name: 'kaputt.hps', mimeType: 'application/octet-stream', buffer: Buffer.from('das ist kein netz') });
  await expect(page.getByTestId('toast').filter({ hasText: 'konnte nicht geöffnet werden' })).toBeVisible();
  // Die Anwendung bleibt bedienbar
  await page.getByTestId('start-new').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Offene Netze überstehen ein Neuladen der Seite', async ({ page }) => {
  await openExample(page, 'ampel');
  await page.getByTestId('doc-tab').first().waitFor();
  await page.waitForTimeout(1500); // automatische Sicherung
  await page.goto('/');
  await expect(page.getByTestId('doc-tab')).toContainText('Ampel');
});
