import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const arPage = readFileSync(new URL("../pages/ar.html", import.meta.url), "utf8");
const visualizer = readFileSync(new URL("../assets/js/ar-visualizer.js", import.meta.url), "utf8");

test("offers the same manual-placement concept when WebXR is unavailable", () => {
  assert.match(arPage, /<h3>Tempatkan Manual<\/h3>/);
  assert.match(arPage, /Tidak membutuhkan WebXR/);
  assert.match(arPage, /openARVisualizer\(\{\s*frameData,/);
  assert.doesNotMatch(arPage, /renderGLBPreview/);
});

test("non-WebXR manual placement exposes distance and 3D wall-angle controls", () => {
  assert.match(visualizer, /id="manual-camera-start"[^>]*>Tempatkan Manual<\/button>/);
  assert.match(visualizer, /id="manual-camera-distance"/);
  assert.match(visualizer, /id="manual-camera-yaw"/);
  assert.match(visualizer, /id="manual-camera-roll"/);
  assert.match(visualizer, /projectPhysicalFrameToPixels/);
  assert.match(visualizer, /distanceFromPinch/);
});

test("manual screenshot composites the live GLB canvas instead of a product thumbnail", () => {
  assert.match(
    visualizer,
    /ctx\.drawImage\(this\.frameCanvas, this\.frameX, this\.frameY, this\.frameWidth, this\.frameHeight\)/,
  );
  assert.doesNotMatch(visualizer, /this\.currentFrameUrl/);
});

test("WebXR manual placement keeps a separate wall-angle control", () => {
  assert.match(arPage, /id="manual-yaw"/);
  assert.match(arPage, /for="manual-yaw">Sudut dinding<\/label>/);
});
