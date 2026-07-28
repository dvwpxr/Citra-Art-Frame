import test from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_PLACEMENT_CONFIG,
  SURFACE_STATES,
  SURFACE_TRACKING_CONFIG,
  SurfaceTracker,
  angleBetweenVec3Deg,
  classifySurfaceNormal,
  clampManualDistance,
  cmToMeters,
  computePhysicalModelScale,
  computeWallContactOffset,
  composeMatrixElements,
  createManualPlacement,
  distanceFromPinch,
  estimateFrameBorderThickness,
  estimatePlaneNormalFromPoints,
  extractSurfaceNormalFromMatrixElements,
  fitVerticalWallPlane,
  getForwardFromCameraMatrix,
  getPlaneMovement,
  getHorizontalForwardFromCameraMatrix,
  getHorizontalRightFromCameraMatrix,
  inferVerticalWallNormalFromPoint,
  intersectRayWithPlane,
  makeSurfaceQuaternionFromNormal,
  makeWallFacingQuaternion,
  normalizeQuaternion,
  orientNormalTowardPoint,
  projectPointOntoPlane,
  projectPhysicalFrameToPixels,
  resolveModelAxisNormalization,
  projectNormalToVerticalWall,
  quaternionFromRotationMatrixElements,
  remapSpanPreservingBorder,
  resolveManualDistance,
  selectPreferredWallHit,
  selectPlacementHit,
  smoothPosition,
  smoothQuaternion,
} from "../assets/js/ar-surface-utils.mjs";

function verticalHit(timestampMs, position = [0, 1.4, -2], normal = [0, 0, 1], quaternion = [0, 0, 0, 1]) {
  return {
    position,
    normal,
    quaternion,
    matrix: composeMatrixElements(position, quaternion),
    classification: classifySurfaceNormal(normal),
    timestampMs,
  };
}

function rotateVectorByQuaternion(vec, quat) {
  const [x, y, z, w] = normalizeQuaternion(quat);
  const uv = [
    y * vec[2] - z * vec[1],
    z * vec[0] - x * vec[2],
    x * vec[1] - y * vec[0],
  ];
  const uuv = [
    y * uv[2] - z * uv[1],
    z * uv[0] - x * uv[2],
    x * uv[1] - y * uv[0],
  ];
  return [
    vec[0] + 2 * (w * uv[0] + uuv[0]),
    vec[1] + 2 * (w * uv[1] + uuv[1]),
    vec[2] + 2 * (w * uv[2] + uuv[2]),
  ];
}

test("classifies wall-like horizontal normals as vertical surfaces", () => {
  assert.equal(classifySurfaceNormal([0.95, 0.08, 0.2]), "vertical");
});

test("classifies up-facing normals as horizontal surfaces", () => {
  assert.equal(classifySurfaceNormal([0.05, 0.98, 0.02]), "horizontal");
});

test("classifies tilted normals inside the inclined tolerance band", () => {
  assert.equal(classifySurfaceNormal([0.58, 0.66, 0.47]), "inclined");
});

test("accepts a moderately imperfect wall but rejects a steeper incline", () => {
  assert.equal(classifySurfaceNormal([0.95, 0.3, 0]), "vertical");
  assert.equal(classifySurfaceNormal([0.89, 0.45, 0]), "inclined");
});

test("separates movement along a wall from movement through the wall", () => {
  const alongWall = getPlaneMovement([0, 1, -2], [0.3, 1.2, -2.01], [0, 0, 1]);
  assert.ok(alongWall.tangentialM > 0.35);
  assert.ok(alongWall.perpendicularM < 0.02);

  const throughWall = getPlaneMovement([0, 1, -2], [0, 1, -1.9], [0, 0, 1]);
  assert.ok(throughWall.perpendicularM > 0.09);
});

test("estimates an upright wall normal from multiple real hit positions", () => {
  const estimated = estimatePlaneNormalFromPoints([
    [-0.15, 1.2, -2],
    [0.15, 1.2, -2],
    [0, 1.5, -2],
    [0, 0.9, -2],
  ], [0, 1.2, 0]);
  assert.ok(angleBetweenVec3Deg(estimated, [0, 0, 1]) < 0.001);
  assert.deepEqual(projectNormalToVerticalWall([0.9, 0.25, 0.2])?.map((value) => Number(value.toFixed(6))), [0.976187, 0, 0.21693]);
});

test("estimates the yaw of an angled wall and rejects degenerate hit points", () => {
  const rootHalf = Math.SQRT1_2;
  const estimated = estimatePlaneNormalFromPoints([
    [-0.2 * rootHalf, 1.2, -2 + 0.2 * rootHalf],
    [0.2 * rootHalf, 1.2, -2 - 0.2 * rootHalf],
    [0, 1.5, -2],
    [0, 0.9, -2],
  ], [0, 1.2, 0]);
  assert.ok(angleBetweenVec3Deg(estimated, [rootHalf, 0, rootHalf]) < 0.001);
  assert.equal(estimatePlaneNormalFromPoints([
    [0, 1, -2],
    [0.1, 1, -2],
    [0.2, 1, -2],
  ], [0, 1, 0]), null);
});

test("fits a vertical wall plane while rejecting a depth outlier", () => {
  const fit = fitVerticalWallPlane([
    [-0.2, 1.1, -2],
    [0.2, 1.1, -2.01],
    [-0.2, 1.5, -1.99],
    [0.2, 1.5, -2],
    [0, 1.3, -1.55],
  ], [0, 1.3, 0]);
  assert.ok(fit);
  assert.equal(fit.inlierCount, 4);
  assert.ok(angleBetweenVec3Deg(fit.normal, [0, 0, 1]) < 2);
  assert.ok(Math.abs(fit.origin[2] + 2) < 0.02);
});

test("infers a vertical wall normal only from plausible feature points", () => {
  assert.deepEqual(
    inferVerticalWallNormalFromPoint([0, 1.2, -2], [0, 1.4, 0]),
    [0, 0, 1],
  );
  assert.equal(
    inferVerticalWallNormalFromPoint([0, 0, -0.8], [0, 1.5, 0]),
    null,
  );
});

test("projects points and camera rays onto a wall plane", () => {
  assert.deepEqual(projectPointOntoPlane([0.2, 1.3, -1.7], [0, 1.3, -2], [0, 0, 1]), [0.2, 1.3, -2]);
  const identity = composeMatrixElements([0, 1.3, 0], [0, 0, 0, 1]);
  assert.deepEqual(getForwardFromCameraMatrix(identity), [0, 0, -1]);
  const intersection = intersectRayWithPlane(
    [0, 1.3, 0],
    getForwardFromCameraMatrix(identity),
    [0, 1.3, -2],
    [0, 0, 1],
  );
  assert.deepEqual(intersection.position, [0, 1.3, -2]);
  assert.equal(intersection.distanceM, 2);
});

test("smooths position with an exponential moving average", () => {
  const smoothed = smoothPosition([0, 0, 0], [1, 0, 0], 0.25);
  assert.deepEqual(smoothed, [0.25, 0, 0]);
});

test("smooths quaternion without leaving unit length", () => {
  const q0 = [0, 0, 0, 1];
  const q1 = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  const smoothed = smoothQuaternion(q0, q1, 0.5);
  const len = Math.hypot(...smoothed);
  assert.ok(Math.abs(len - 1) < 1e-6);
  assert.ok(smoothed[1] > 0);
});

test("extracts the WebXR surface normal from the hit pose Y axis", () => {
  const halfTurn = Math.PI / 4;
  const matrix = composeMatrixElements([0, 0, 0], [Math.sin(halfTurn), 0, 0, Math.cos(halfTurn)]);
  const normal = extractSurfaceNormalFromMatrixElements(matrix);
  assert.ok(angleBetweenVec3Deg(normal, [0, 0, 1]) < 0.001);
});

test("orients a hit normal toward the viewer without changing its axis", () => {
  const oriented = orientNormalTowardPoint([0, 0, -1], [0, 0, -2], [0, 0, 0]);
  assert.deepEqual(oriented, [0, 0, 1]);
});

test("builds a canonical hit quaternion whose local Z follows the normal and stays upright", () => {
  const quat = makeSurfaceQuaternionFromNormal([0, 0, 1]);
  const localZ = rotateVectorByQuaternion([0, 0, 1], quat);
  assert.ok(angleBetweenVec3Deg(localZ, [0, 0, 1]) < 0.001);

  const angledQuat = makeSurfaceQuaternionFromNormal([0.6, 0, 0.8]);
  const angledZ = rotateVectorByQuaternion([0, 0, 1], angledQuat);
  const angledY = rotateVectorByQuaternion([0, 1, 0], angledQuat);
  assert.ok(angleBetweenVec3Deg(angledZ, [0.6, 0, 0.8]) < 0.001);
  assert.ok(angleBetweenVec3Deg(angledY, [0, 1, 0]) < 0.001);
});

test("requires several stable vertical hits before becoming stable", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0), 0);
  assert.equal(tracker.state, SURFACE_STATES.CANDIDATE);
  tracker.trackHit(verticalHit(16, [0.01, 1.4, -2]), 16);
  assert.equal(tracker.state, SURFACE_STATES.CANDIDATE);
  tracker.trackHit(verticalHit(32, [0.015, 1.4, -2]), 32);
  assert.equal(tracker.state, SURFACE_STATES.STABLE);
});

test("requires extra evidence for a point-cloud wall hypothesis", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  for (let index = 0; index < 5; index += 1) {
    tracker.trackHit({
      ...verticalHit(index * 16),
      minimumStableFrameCount: 6,
    }, index * 16);
  }
  assert.equal(tracker.state, SURFACE_STATES.CANDIDATE);
  tracker.trackHit({
    ...verticalHit(80),
    minimumStableFrameCount: 6,
  }, 80);
  assert.equal(tracker.state, SURFACE_STATES.STABLE);
  assert.equal(tracker.getStatus(80).requiredStableFrameCount, 6);
});

test("keeps the wall stable while the hit point moves along its plane", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0, [0, 1.2, -2]), 0);
  tracker.trackHit(verticalHit(16, [0, 1.42, -2.01]), 16);
  tracker.trackHit(verticalHit(32, [0.18, 1.62, -2.015]), 32);
  assert.equal(tracker.state, SURFACE_STATES.STABLE);
  assert.ok(tracker.smoothedHit.position[1] > 1.4);
});

test("rejects a point that jumps through to a different wall plane", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 2 });
  tracker.trackHit(verticalHit(0, [0, 1.2, -2]), 0);
  tracker.trackHit(verticalHit(16, [0, 1.2, -1.8]), 16);
  assert.equal(tracker.state, SURFACE_STATES.CANDIDATE);
  assert.equal(tracker.stableStreak, 1);
});

test("resets after hits are lost beyond the grace period", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 1, lostGracePeriodMs: 100 });
  tracker.trackHit(verticalHit(0), 0);
  tracker.markMiss(40);
  assert.equal(tracker.state, SURFACE_STATES.LOST);
  tracker.markMiss(140);
  assert.equal(tracker.state, SURFACE_STATES.SEARCHING);
});

test("brief missing hit keeps candidate progress on a sparse wall", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0), 0);
  tracker.trackHit(verticalHit(16), 16);
  assert.equal(tracker.stableStreak, 2);
  tracker.markMiss(32);
  assert.equal(tracker.state, SURFACE_STATES.LOST);
  assert.equal(tracker.stableStreak, 2);
  tracker.trackHit(verticalHit(48), 48);
  assert.equal(tracker.stableStreak, 3);
  assert.equal(tracker.state, SURFACE_STATES.STABLE);
});

test("a longer missing-hit gap resets candidate progress", () => {
  const tracker = new SurfaceTracker({
    ...SURFACE_TRACKING_CONFIG,
    stableFrameCount: 3,
    candidateMissGracePeriodMs: 40,
  });
  tracker.trackHit(verticalHit(0), 0);
  tracker.trackHit(verticalHit(16), 16);
  tracker.markMiss(80);
  assert.equal(tracker.stableStreak, 0);
  tracker.trackHit(verticalHit(96), 96);
  assert.equal(tracker.stableStreak, 1);
  assert.equal(tracker.state, SURFACE_STATES.CANDIDATE);
});

test("a horizontal hit does not preserve an old wall candidate streak", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0), 0);
  tracker.trackHit(verticalHit(16), 16);
  tracker.markMiss(32, "horizontal");
  assert.equal(tracker.stableStreak, 0);
  tracker.trackHit(verticalHit(48), 48);
  assert.equal(tracker.stableStreak, 1);
});

test("rejects a stable hit after maximum hit age", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 1, maximumHitAgeMs: 200 });
  tracker.trackHit(verticalHit(0), 0);
  assert.equal(tracker.canPlace(100), true);
  assert.equal(tracker.canPlace(250), false);
});

test("extracts horizontal camera forward vector from camera matrix", () => {
  const identity = composeMatrixElements([0, 0, 0], [0, 0, 0, 1]);
  assert.deepEqual(getHorizontalForwardFromCameraMatrix(identity), [0, 0, -1]);
});

test("manual right vector stays horizontal and orthogonal to forward", () => {
  const roll = Math.PI / 6;
  const matrix = composeMatrixElements([0, 0, 0], [0, 0, Math.sin(roll), Math.cos(roll)]);
  const forward = getHorizontalForwardFromCameraMatrix(matrix);
  const right = getHorizontalRightFromCameraMatrix(matrix);
  const dot = forward[0] * right[0] + forward[1] * right[1] + forward[2] * right[2];
  assert.ok(Math.abs(dot) < 1e-8);
  assert.equal(right[1], 0);
});

test("computes manual wall plane position from camera pose and distance", () => {
  const identity = composeMatrixElements([0, 0, 0], [0, 0, 0, 1]);
  const placement = createManualPlacement(identity, { distanceM: 2 });
  assert.deepEqual(placement.position.map((v) => Number(v.toFixed(6))), [0, 0, -2]);
  assert.deepEqual(placement.normalToCamera.map((v) => Number(v.toFixed(6))), [0, 0, 1]);
});

test("manual wall angle rotates the frame normal without changing its distance", () => {
  const identity = composeMatrixElements([0, 1.4, 0], [0, 0, 0, 1]);
  const placement = createManualPlacement(identity, { distanceM: 2, yawDeg: 30 });
  assert.equal(placement.distanceM, 2);
  assert.equal(placement.yawDeg, 30);
  assert.ok(angleBetweenVec3Deg(placement.normalToCamera, [0.5, 0, Math.sqrt(3) / 2]) < 0.001);
});

test("projects physical frame dimensions using manual perspective distance", () => {
  const near = projectPhysicalFrameToPixels({
    widthCm: 40,
    heightCm: 60,
    distanceM: 1,
    viewportHeightPx: 800,
  });
  const far = projectPhysicalFrameToPixels({
    widthCm: 40,
    heightCm: 60,
    distanceM: 2,
    viewportHeightPx: 800,
  });
  assert.ok(Math.abs(near.widthPx / near.heightPx - 2 / 3) < 1e-6);
  assert.ok(Math.abs(near.heightPx / far.heightPx - 2) < 1e-6);
  assert.equal(far.isDisplayClamped, false);
});

test("pinch-out moves an estimated manual frame closer", () => {
  assert.equal(distanceFromPinch(2, 2), 1);
  assert.equal(distanceFromPinch(2, 0.01), MANUAL_PLACEMENT_CONFIG.maxDistanceM);
});

test("orients model local +Z toward the user", () => {
  const quat = makeWallFacingQuaternion([0, 0, 1]);
  const localZ = rotateVectorByQuaternion([0, 0, 1], quat);
  assert.ok(angleBetweenVec3Deg(localZ, [0, 0, 1]) < 0.001);
});

test("keeps model local +Y locked to world-up on an angled wall", () => {
  const quat = makeWallFacingQuaternion([0.62, 0, 0.7846]);
  const localY = rotateVectorByQuaternion([0, 1, 0], quat);
  assert.ok(angleBetweenVec3Deg(localY, [0, 1, 0]) < 0.001);
});

test("converts centimeters to meters for physical frame dimensions", () => {
  assert.equal(cmToMeters(40), 0.4);
  assert.equal(cmToMeters(60), 0.6);
  assert.equal(cmToMeters(0, 40), 0.4);
  assert.equal(cmToMeters(-20, 60), 0.6);
});

test("computes scale that maps GLB X and Y bounds to physical meters", () => {
  // 1.45 dan 1.66 adalah kalibrasi empiris perangkat (divalidasi dengan
  // lukisan nyata 33×47 cm) — jangan diubah tanpa pengujian fisik ulang.
  const scale = computePhysicalModelScale({ widthCm: 40, heightCm: 60 }, { x: 0.2, y: 0.3, z: 0.02 });
  assert.ok(scale);
  assert.equal(Number((0.2 * scale.x).toFixed(6)), Number((0.4 * 1.45).toFixed(6)));
  assert.equal(Number((0.3 * scale.y).toFixed(6)), Number((0.6 * 1.66).toFixed(6)));
  // Ketebalan tetap proporsional TANPA kompensasi agar bingkai tidak
  // terdorong menjauh dari dinding.
  assert.equal(Number((0.02 * scale.z).toFixed(6)), 0.04);
  assert.ok(Math.abs(scale.depthM - 0.04) < 1e-12);
  assert.ok(Math.abs(scale.aspectRatio - (0.4 * 1.45) / (0.6 * 1.66)) < 1e-12);
});

test("normalizes an X/Z frame plane so Y becomes physical depth", () => {
  const layout = resolveModelAxisNormalization({ x: 245, y: 35, z: 202 });
  assert.equal(layout.depthAxis, "y");
  assert.equal(layout.rotationXDeg, 90);
  assert.equal(layout.widthAxis, "x");
  assert.equal(layout.heightAxis, "z");
});

test("keeps a conventional X/Y frame plane unchanged", () => {
  const layout = resolveModelAxisNormalization({ x: 0.4, y: 0.6, z: 0.03 });
  assert.equal(layout.depthAxis, "z");
  assert.equal(layout.rotationXDeg, 0);
  assert.equal(layout.rotationYDeg, 0);
});

test("maps a canonical Victorian model to the calibrated 40 by 60 cm outer size", () => {
  const canonicalBounds = { x: 245, y: 202, z: 35 };
  const scale = computePhysicalModelScale(
    { widthCm: 40, heightCm: 60 },
    canonicalBounds,
  );
  assert.equal(Number((canonicalBounds.x * scale.x).toFixed(6)), Number((0.4 * 1.45).toFixed(6)));
  assert.equal(Number((canonicalBounds.y * scale.y).toFixed(6)), Number((0.6 * 1.66).toFixed(6)));
  assert.ok(scale.depthM > 0.05, "The thick source profile must not be flattened to 2.5 cm");
});

test("estimates frame border thickness from protruding molding vertices", () => {
  // Bingkai sintetis: bentang luar ±1.0 (x) × ±1.5 (y), lis 0.25, lis
  // menonjol di z=0.1, kanvas datar di z=0 (di bawah titik tengah kedalaman).
  const points = [
    [1.0, 0, 0.1], [-1.0, 0, 0.1],      // tepi luar lis kiri/kanan (pita tengah)
    [0.75, 0.1, 0.1], [-0.75, -0.1, 0.1], // tepi dalam lis kiri/kanan
    [0.5, 0, 0], [0, 0, 0],              // kanvas (z rendah — diabaikan)
    [0.3, 1.5, 0.1], [-0.3, -1.5, 0.1],  // lis atas/bawah (di luar pita tengah)
  ];
  const thickness = estimateFrameBorderThickness(points, { axis: "x" });
  assert.ok(Math.abs(thickness - 0.25) < 1e-12);
});

test("returns null border thickness for shapes that are not frame-like", () => {
  // Bidang datar tanpa tonjolan kedalaman.
  assert.equal(estimateFrameBorderThickness([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]), null);
  assert.equal(estimateFrameBorderThickness([]), null);
});

test("remaps a span while preserving border thickness at both edges", () => {
  const config = { halfSourceSpan: 1.0, halfTargetSpan: 0.7, borderThickness: 0.25 };
  // Tepi luar mengikuti bentang target.
  assert.ok(Math.abs(remapSpanPreservingBorder(1.0, config) - 0.7) < 1e-12);
  assert.ok(Math.abs(remapSpanPreservingBorder(-1.0, config) - -0.7) < 1e-12);
  // Tepi dalam lis: tebal 0.25 dipertahankan (0.7 - 0.25 = 0.45).
  assert.ok(Math.abs(remapSpanPreservingBorder(0.75, config) - 0.45) < 1e-12);
  // Interior dipadatkan proporsional (0.45/0.75 dari nilai asal).
  assert.ok(Math.abs(remapSpanPreservingBorder(0.375, config) - 0.225) < 1e-12);
  assert.equal(remapSpanPreservingBorder(0, config), 0);
});

test("falls back to linear scaling when the border does not fit the target span", () => {
  const config = { halfSourceSpan: 1.0, halfTargetSpan: 0.2, borderThickness: 0.25 };
  assert.ok(Math.abs(remapSpanPreservingBorder(1.0, config) - 0.2) < 1e-12);
  assert.ok(Math.abs(remapSpanPreservingBorder(0.5, config) - 0.1) < 1e-12);
});

test("places the model center so its back face sinks slightly into the wall plane", () => {
  // depth/2 + gap - sink: benam 1 cm menutup celah bidang deteksi ARCore
  // yang sering berada sedikit di depan dinding nyata.
  assert.ok(Math.abs(computeWallContactOffset(0.025) - 0.0035) < 1e-12);
  assert.equal(computeWallContactOffset(0.02, 0), 0);
  // Tanpa sink, kembali ke kontak persis: depth/2 + gap.
  assert.ok(Math.abs(computeWallContactOffset(0.025, 0.001, 0) - 0.0135) < 1e-12);
  // Offset tidak boleh negatif untuk bingkai yang sangat tipis.
  assert.equal(computeWallContactOffset(0.004, 0.001, 0.05), 0);
});

test("uses only fresh depth to initialize manual distance", () => {
  assert.equal(resolveManualDistance({ selectedDistanceM: 2, depthDistanceM: 1.4, depthAgeMs: 200 }), 1.4);
  assert.equal(resolveManualDistance({ selectedDistanceM: 2, depthDistanceM: 1.4, depthAgeMs: 800 }), 2);
});

test("keeps center-reticle wall depth instead of touchscreen transient depth", () => {
  const stable = verticalHit(100, [0, 1.4, -2]);
  const closeTransient = { ...verticalHit(110, [0.1, 1.4, -2]), source: "transient" };
  const farTransient = { ...verticalHit(110, [1.2, 1.4, -2]), source: "transient" };
  assert.equal(selectPlacementHit({ transientHit: closeTransient, stableHit: stable, timestampMs: 120 }).source, "viewer");
  assert.deepEqual(selectPlacementHit({ transientHit: closeTransient, stableHit: stable, timestampMs: 120 }).position, stable.position);
  assert.equal(selectPlacementHit({ transientHit: farTransient, stableHit: stable, timestampMs: 120 }).source, "viewer");
  assert.equal(selectPlacementHit({ transientHit: closeTransient, stableHit: null, timestampMs: 120 }), null);
});

test("uses a farther vertical wall hit when the nearest result is horizontal", () => {
  const floorHit = {
    ...verticalHit(100, [0, 0, -1]),
    classification: "horizontal",
    normal: [0, 1, 0],
  };
  const wallHit = verticalHit(100, [0, 1.2, -2]);
  assert.equal(selectPreferredWallHit([floorHit, wallHit]), wallHit);
  assert.equal(selectPreferredWallHit([floorHit]), floorHit);
  assert.equal(selectPreferredWallHit([]), null);
});

test("clamps manual distance to supported bounds", () => {
  assert.equal(clampManualDistance(0.2), MANUAL_PLACEMENT_CONFIG.minDistanceM);
  assert.equal(clampManualDistance(8), MANUAL_PLACEMENT_CONFIG.maxDistanceM);
  assert.equal(clampManualDistance(2.5), 2.5);
});

test("quaternion extraction preserves identity rotation", () => {
  const matrix = composeMatrixElements([0, 0, 0], [0, 0, 0, 1]);
  assert.deepEqual(quaternionFromRotationMatrixElements(matrix).map((v) => Number(v.toFixed(6))), [0, 0, 0, 1]);
});
