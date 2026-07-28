import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const arPage = readFileSync(new URL("../pages/ar.html", import.meta.url), "utf8");
const arLogic = readFileSync(new URL("../assets/js/ar-logic.js", import.meta.url), "utf8");
const arStyles = readFileSync(new URL("../assets/css/ar.css", import.meta.url), "utf8");

test("keeps the manual placement button visible outside the delayed fallback panel", () => {
  const manualButtonMatches = arPage.match(/id="ar-start-manual-btn"/g) || [];
  const quickActionsStart = arPage.indexOf('<div class="ar-quick-actions">');
  const manualButtonStart = arPage.indexOf('id="ar-start-manual-btn"');
  const fallbackStart = arPage.indexOf('id="ar-detection-fallback"');

  assert.equal(manualButtonMatches.length, 1);
  assert.ok(quickActionsStart >= 0);
  assert.ok(manualButtonStart > quickActionsStart);
  assert.ok(manualButtonStart < fallbackStart);
  assert.match(
    arPage.slice(manualButtonStart, arPage.indexOf("</button>", manualButtonStart)),
    />Tempatkan Manual$/,
  );
});

test("keeps the WebXR confirmation action visible and resets the old page scroll", () => {
  assert.match(arPage, /className = "ar-pre-guide"/);
  assert.match(arPage, /class="ar-pre-guide-actions"/);
  assert.match(arPage, /id="start-ar-confirm" type="button"/);
  assert.match(arPage, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(arPage, /id="ar-button-container"/);
  assert.match(arPage, /scrollIntoView\(\{ block: "center", behavior: "auto" \}\)/);
});

test("camera start uses one gesture-safe WebXR request and exposes visible feedback", () => {
  assert.match(arPage, /id="ar-session-feedback"/);
  assert.match(arPage, /aria-live="polite"/);
  assert.match(arLogic, /preferFull: false/);
  assert.match(arLogic, /Membuka kamera AR\.\.\./);
  assert.match(arLogic, /setARSessionFeedback\("Menunggu izin kamera AR/);
  assert.match(arLogic, /Coba Mulai Kamera AR Lagi/);
  assert.match(arStyles, /touch-action:\s*manipulation/);
  assert.match(arStyles, /\.citraframe-ar-start-btn:disabled\s*\{[^}]*opacity:\s*0\.65 !important/s);
});
