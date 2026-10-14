/** Startseite mit „Neu“, „Öffnen“, Beispielen und zuletzt verwendeten Netzen. PLATZHALTER. */
import { newDocument } from '../store/appStore';
export function StartScreen() {
  return (
    <div className="empty-state" style={{ flex: 1 }}>
      <button className="btn primary" onClick={() => newDocument()} data-testid="start-new">
        Neues Netz
      </button>
    </div>
  );
}
