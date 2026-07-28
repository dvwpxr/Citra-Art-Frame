import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync(new URL("../assets/js/frame-builder.js", import.meta.url), "utf8");
const arPage = readFileSync(new URL("../pages/ar.html", import.meta.url), "utf8");
const webxr = readFileSync(new URL("../assets/js/ar-logic.js", import.meta.url), "utf8");
const manual = readFileSync(new URL("../assets/js/ar-visualizer.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../admin/js/frame-models-script.js", import.meta.url), "utf8");

test("custom frame carries the linked product model into AR", () => {
  assert.match(builder, /p\.frame_model_id && p\.frame_model_url/);
  assert.match(builder, /modelUrl: state\.frameModel\.model3d\?\.fileUrl/);
  assert.match(builder, /modelFrontRotationY: state\.frameModel\.model3d\?\.frontRotationY/);
  assert.match(arPage, /modelUrl: resolveFrameModelUrl\(d\.modelUrl\)/);
  assert.match(arPage, /modelFrontRotationY: Number\(d\.modelFrontRotationY\) === 180/);
  assert.match(arPage, /modelUrl: frameData\.modelUrl/);
});

test("both AR renderers load the selected model and keep a safe default", () => {
  assert.match(webxr, /loadGLTF\(requestedModelUrl\)/);
  assert.match(webxr, /loadGLTF\(DEFAULT_FRAME_GLB\)/);
  assert.match(manual, /this\.loadModel\(DEFAULT_MODEL_URL, 0\)/);
  assert.match(manual, /url\.pathname\.startsWith\("\/uploads\/models\/"\)/);
});

test("admin frame model form sends an explicit product link", () => {
  assert.match(admin, /fetch\("\/api\/products\/frames"\)/);
  assert.match(admin, /formData\.append\("product_id"/);
  assert.match(admin, /formData\.append\("front_rotation_y"/);
  assert.match(admin, /Satu produk hanya dapat memiliki satu model 3D|linkedProducts/);
});

test("model front correction is applied consistently to WebXR and manual rendering", () => {
  assert.match(webxr, /THREE\.MathUtils\.degToRad\(frontCorrectedModel\.userData\.frontRotationY\)/);
  assert.match(webxr, /orientedModel\.userData\.frontRotationY = frontCorrectedModel\.userData\.frontRotationY/);
  assert.doesNotMatch(webxr, /orientedModel\.rotation\.z/);
  assert.match(manual, /this\._modelBaseRotationYRad \+ this\.yawDeg/);
  assert.match(manual, /this\.rollDeg \* Math\.PI \/ 180/);
  assert.doesNotMatch(manual, /_modelUprightRotationZRad/);
});

test("AR canonicalizes imported frame axes without flattening the original GLB", () => {
  assert.match(webxr, /resolveModelAxisNormalization\(sourceSize\)/);
  assert.match(webxr, /CitraFrameCanonicalAxes/);
  assert.match(webxr, /path === DEFAULT_FRAME_GLB \? 0/);
  // Rotasi root bawaan exporter (Sketchfab) sengaja dipertahankan; bounds
  // dibaca setelah rotasi root diterapkan, bukan dengan meresetnya.
  assert.doesNotMatch(webxr, /resetExporterPresentationRotation\(sourceModel\)/);
  assert.match(webxr, /new THREE\.Box3\(\)\.setFromObject\(sourceModel\)/);
  assert.match(manual, /modelUrl !== DEFAULT_MODEL_URL/);
  assert.match(manual, /resolveModelAxisNormalization\(sourceBounds\)/);
});

test("AR refreshes linked model metadata so an old local order uses the latest front direction", () => {
  assert.match(arPage, /model3dId: Number\(d\.model3dId\) \|\| 0/);
  assert.match(arPage, /fetch\(`\/api\/frame-models\/\$\{frameData\.model3dId\}`\)/);
  assert.match(arPage, /latestModel\.front_rotation_y/);
});

test("WebXR preloads large models and delays supplemental hit-test sources", () => {
  assert.match(arPage, /beginARModelPreload\(\)/);
  assert.match(arPage, /citraframe:ar-loader-ready/);
  assert.match(arPage, /Memuat model 3D bingkai/);
  assert.match(arPage, /id="start-ar-confirm" type="button" disabled/);
  assert.match(webxr, /loadAssets\(\{ background: true, waitForRequested: true \}\)/);
  assert.match(webxr, /SUPPLEMENTAL_PLANE_AFTER_MS/);
  assert.match(webxr, /maybePrepareSupplementalHitTestSources\(timestamp\)/);
  assert.doesNotMatch(webxr, /\["point-left"/);
});

test("WebXR placement remains usable while a large linked model is loading", () => {
  assert.match(webxr, /FAST_FALLBACK_DELAY_MS/);
  assert.match(webxr, /Promise\.any\(\[requestedAssetPromise, fallbackAssetPromise\]\)/);
  assert.match(webxr, /pendingPlacementMode = "native"/);
  assert.match(webxr, /pendingPlacementMode = "manual"/);
  assert.match(webxr, /window\.queueMicrotask\(flushPendingPlacement\)/);
  assert.match(webxr, /replaceLiveFrameWithLoadedAsset/);
  assert.match(webxr, /const canPlace = surfaceTracker\.canPlace\(timestamp\) && !manualMode/);
});
