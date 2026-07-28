import test from "node:test";
import assert from "node:assert/strict";
import {
  SURFACE_STATES,
  SURFACE_TRACKING_CONFIG,
  SurfaceTracker,
  XRSourceRegistry,
  buildXRSessionInit,
  canPlaceNativeFrame,
  classifySurfaceNormal,
  composeMatrixElements,
  confirmManualPlacement,
  deleteXRAnchor,
  detectImmersiveARSupport,
  requestARSession,
  requestTransientHitTestSource,
  shouldOfferNativePlacement,
  shouldShowManualFallback,
} from "../assets/js/ar-surface-utils.mjs";

function verticalHit(timestampMs, position = [0, 1.3, -2]) {
  return {
    position,
    normal: [0, 0, 1],
    quaternion: [0, 0, 0, 1],
    matrix: composeMatrixElements(position, [0, 0, 0, 1]),
    classification: "vertical",
    timestampMs,
  };
}

test("detects browser without navigator.xr", async () => {
  const support = await detectImmersiveARSupport({});
  assert.equal(support.immersiveAr, false);
});

test("detects immersive-ar unsupported browser", async () => {
  const support = await detectImmersiveARSupport({
    xr: { isSessionSupported: async () => false },
  });
  assert.equal(support.immersiveAr, false);
});

test("starts a minimal session when requested directly", async () => {
  const calls = [];
  const navigatorLike = {
    xr: {
      isSessionSupported: async () => true,
      requestSession: async (mode, init) => {
        calls.push({ mode, init });
        return { domOverlayState: null };
      },
    },
  };
  const result = await requestARSession(navigatorLike, null, { preferFull: false });
  assert.equal(result.mode, "minimal");
  assert.deepEqual(calls[0].init, buildXRSessionInit({ minimal: true }));
});

test("can request the session immediately after a previously completed support check", async () => {
  let supportChecks = 0;
  let sessionCalls = 0;
  const navigatorLike = {
    xr: {
      isSessionSupported: async () => {
        supportChecks += 1;
        return true;
      },
      requestSession: async () => {
        sessionCalls += 1;
        return { domOverlayState: null };
      },
    },
  };
  const result = await requestARSession(navigatorLike, null, {
    preferFull: false,
    skipSupportCheck: true,
  });
  assert.equal(result.mode, "minimal");
  assert.equal(supportChecks, 0);
  assert.equal(sessionCalls, 1);
});

test("falls back when optional feature configuration is rejected", async () => {
  const calls = [];
  const navigatorLike = {
    xr: {
      isSessionSupported: async () => true,
      requestSession: async (_mode, init) => {
        calls.push(init);
        if (init.optionalFeatures?.includes("plane-detection")) {
          throw new Error("unsupported optional feature");
        }
        return { domOverlayState: null };
      },
    },
  };
  const result = await requestARSession(navigatorLike, null, { logger: { warn() {} } });
  assert.equal(result.mode, "minimal");
  assert.equal(calls.length, 2);
  assert.match(result.errors[0], /unsupported optional feature/);
});

test("full session keeps hit-test required and requests CPU depth optionally", () => {
  const init = buildXRSessionInit({ domOverlayRoot: { id: "overlay" } });
  assert.deepEqual(init.requiredFeatures, ["hit-test"]);
  assert.ok(init.optionalFeatures.includes("depth-sensing"));
  assert.deepEqual(init.depthSensing.usagePreference, ["cpu-optimized"]);
  assert.deepEqual(init.domOverlay, { root: { id: "overlay" } });
});

test("minimal fallback keeps DOM overlay optional when a root is available", () => {
  const root = { id: "overlay" };
  const init = buildXRSessionInit({ minimal: true, domOverlayRoot: root });
  assert.deepEqual(init.requiredFeatures, ["hit-test"]);
  assert.deepEqual(init.optionalFeatures, ["dom-overlay"]);
  assert.deepEqual(init.domOverlay, { root });
});

test("session request stops after one full and one minimal failure", async () => {
  let calls = 0;
  const result = await requestARSession({
    xr: {
      isSessionSupported: async () => true,
      requestSession: async () => {
        calls += 1;
        throw new Error(`failure-${calls}`);
      },
    },
  }, null, { logger: { warn() {} } });
  assert.equal(result.mode, "failed");
  assert.equal(calls, 2);
  assert.equal(result.errors.length, 2);
});

test("offers manual fallback after 10 seconds without stable hit", () => {
  const tracker = new SurfaceTracker();
  const status = tracker.getStatus(10000);
  assert.equal(shouldShowManualFallback(status, 10000), true);
});

test("keeps inconsistent hits in candidate state", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0, [0, 1.3, -2]), 0);
  tracker.trackHit(verticalHit(16, [0.7, 1.3, -2]), 16);
  tracker.trackHit(verticalHit(32, [1.4, 1.3, -2]), 32);
  assert.notEqual(tracker.state, SURFACE_STATES.STABLE);
});

test("accepts stable vertical hits", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 2 });
  tracker.trackHit(verticalHit(0, [0, 1.3, -2]), 0);
  tracker.trackHit(verticalHit(16, [0.01, 1.3, -2]), 16);
  assert.equal(tracker.state, SURFACE_STATES.STABLE);
});

test("rejects horizontal hits for wall frame placement", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 1 });
  tracker.trackHit({
    position: [0, 0, -2],
    normal: [0, 1, 0],
    quaternion: [0, 0, 0, 1],
    matrix: composeMatrixElements([0, 0, -2], [0, 0, 0, 1]),
    classification: classifySurfaceNormal([0, 1, 0]),
    timestampMs: 0,
  }, 0);
  assert.equal(tracker.state, SURFACE_STATES.SEARCHING);
  assert.equal(canPlaceNativeFrame(tracker, 0), false);
});

test("creates transient hit-test source when available", async () => {
  const source = { cancel() {} };
  const result = await requestTransientHitTestSource({
    requestHitTestSourceForTransientInput: async (init) => {
      assert.equal(init.profile, "generic-touchscreen");
      assert.deepEqual(init.entityTypes, ["plane"]);
      return source;
    },
  });
  assert.equal(result, source);
});

test("retries transient hit-test without entityTypes for older implementations", async () => {
  const calls = [];
  const source = { cancel() {} };
  const result = await requestTransientHitTestSource({
    requestHitTestSourceForTransientInput: async (init) => {
      calls.push(init);
      if (init.entityTypes) throw new Error("legacy implementation");
      return source;
    },
  });
  assert.equal(result, source);
  assert.equal(calls.length, 2);
  assert.equal("entityTypes" in calls[1], false);
});

test("continues without transient hit-test source when unavailable", async () => {
  const result = await requestTransientHitTestSource({});
  assert.equal(result, null);
});

test("offers native detection after manual mode when native stable appears", () => {
  assert.equal(shouldOfferNativePlacement({ manualMode: true, nativeStable: true }), true);
  assert.equal(shouldOfferNativePlacement({ manualMode: false, placementMode: "native", nativeStable: true }), false);
});

test("cleans hit-test sources and listeners on session end", () => {
  let cancelled = 0;
  const listeners = new Map();
  const target = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
    dispatch(name) { listeners.get(name)?.(); },
  };
  const registry = new XRSourceRegistry();
  registry.addSource({ cancel() { cancelled += 1; } });
  registry.addSource({ cancel() { cancelled += 1; } });
  registry.addListener(target, "end", () => registry.cleanup());
  assert.equal(registry.activeSourceCount, 2);
  target.dispatch("end");
  assert.equal(cancelled, 2);
  assert.equal(registry.activeSourceCount, 0);
  assert.equal(listeners.size, 0);
  registry.cleanup();
  assert.equal(cancelled, 2);
});

test("deletes native anchors when placement is released", () => {
  let deleted = 0;
  const anchor = { delete() { deleted += 1; } };
  assert.equal(deleteXRAnchor(anchor), true);
  assert.equal(deleted, 1);
  assert.equal(deleteXRAnchor({}), false);
});

test("does not place model while reticle is candidate", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 3 });
  tracker.trackHit(verticalHit(0), 0);
  assert.equal(canPlaceNativeFrame(tracker, 0), false);
});

test("allows model placement once reticle is stable", () => {
  const tracker = new SurfaceTracker({ ...SURFACE_TRACKING_CONFIG, stableFrameCount: 2 });
  tracker.trackHit(verticalHit(0), 0);
  tracker.trackHit(verticalHit(16, [0.01, 1.3, -2]), 16);
  assert.equal(canPlaceNativeFrame(tracker, 20), true);
});

test("confirms manual placement as an estimate with clamped distance", () => {
  const cameraMatrix = composeMatrixElements([0, 0, 0], [0, 0, 0, 1]);
  const result = confirmManualPlacement(cameraMatrix, { distanceM: 9 });
  assert.equal(result.confirmed, true);
  assert.equal(result.placement.mode, SURFACE_STATES.MANUAL);
  assert.equal(result.placement.isEstimate, true);
  assert.equal(result.placement.distanceM, 5);
});
