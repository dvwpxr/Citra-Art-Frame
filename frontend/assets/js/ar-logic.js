/**
 * CITRA ARTFRAME - WebAR logic (WebXR + Three.js)
 *
 * Native placement tetap memakai WebXR hit-test asli. Manual placement adalah
 * fallback perkiraan berbasis pose kamera dan tidak dianggap plane detection.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { applyBorderPreservingFrameScale } from "./ar-frame-geometry.mjs?v=20260726-border-slice-1";
import {
  MANUAL_PLACEMENT_CONFIG,
  POINT_WALL_TRACKING_CONFIG,
  SURFACE_STATES,
  SURFACE_TRACKING_CONFIG,
  SurfaceTracker,
  XRSourceRegistry,
  angleBetweenVec3Deg,
  buildXRSessionInit,
  classifySurfaceNormal,
  computePhysicalModelScale,
  computeWallContactOffset,
  confirmManualPlacement,
  createEmptyCapabilities,
  createManualPlacement,
  deleteXRAnchor,
  detectImmersiveARSupport,
  extractSurfaceNormalFromMatrixElements,
  fitVerticalWallPlane,
  getForwardFromCameraMatrix,
  getPlaneMovement,
  getPositionFromMatrixElements,
  inferVerticalWallNormalFromPoint,
  intersectRayWithPlane,
  makeSurfaceQuaternionFromNormal,
  makeWallFacingQuaternion,
  orientNormalTowardPoint,
  projectPointOntoPlane,
  projectNormalToVerticalWall,
  requestARSession,
  resolveModelAxisNormalization,
  selectPreferredWallHit,
  resolveManualDistance,
  selectPlacementHit,
  shouldOfferNativePlacement,
  shouldShowManualFallback,
} from "./ar-surface-utils.mjs?v=20260726-border-slice-1";

let scene, camera, renderer;
let reticle;
let reticleRingMaterial, reticleDotMaterial;
let frameModel = null;
let modelBounds = null;
let assetLoadPromise = null;
let assetLoadGeneration = 0;
let assetRequestedUrl = "";
let assetLoadState = "idle";
let assetLoadProgress = null;
let activeAssetIsFallback = false;
let pendingPlacementMode = null;
let placedFrame = null;
let frameAnchor = null;
let manualPreviewFrame = null;
let currentFrameData = null;

let activeSession = null;
let hitTestSource = null;
let hitTestSources = [];
let hitTestSourceRequested = false;
let supplementalPlaneSourcesRequested = false;
let pointFallbackSourceRequested = false;
let viewerSpace = null;
let sourceRegistry = new XRSourceRegistry();

let isInitialized = false;
let renderLoopStarted = false;
let assetsLoaded = false;
let isFramePlaced = false;
let manualMode = false;
let manualFallbackDismissed = false;
let sessionStartMs = 0;
let scanStartMs = 0;
let lastFrameTimestamp = 0;
let lastFrameDeltaMs = 0;
let lastNativeHit = null;
let lastSurfaceStatus = null;
let lastHitCount = 0;
let lastError = "";
let _lastGuideState = "";
let resizeHandler = null;
let placeButtonBound = false;
let lightProbe = null;
let currentViewerMatrix = null;
let currentViewerPoseTimestamp = null;
let viewerTrackingAvailable = false;
let activeSessionToken = 0;
let placementToken = 0;
let manualFallbackVisible = false;
let xrSupportPromise = null;
let immersiveARSupported = false;
let sessionStartPending = false;
let sessionStartFeedbackTimer = null;
let pointWallSamples = [];
// Estimasi bidang tembok terbaru dari plane-fit sebaran titik. Dipakai untuk
// menjangkarkan normal hit tipe titik ke orientasi tembok nyata, bukan ke
// arah berdiri pengguna.
let lastPointWallFit = null;
let detectedWallPlaneCount = 0;

const DEFAULT_FRAME_GLB = "/assets/3d/frame.glb";
const FAST_FALLBACK_DELAY_MS = 2500;
const OFFSET_RAY_SPREAD = 0.075;
const MAX_HIT_RESULTS_PER_SOURCE = 2;
const SUPPLEMENTAL_PLANE_AFTER_MS = 1200;
const WALL_HIT_DEPTH_CLUSTER_M = 0.45;
const WALL_NORMAL_CLUSTER_ANGLE_DEG = 40;
const WALL_PLANE_RESIDUAL_M = 0.06;
const AR_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("arDebug") === "1";

if (AR_DEBUG_ENABLED) {
  window.addEventListener("error", (e) => {
    const bd = document.getElementById("ar-debug-body");
    if (bd) bd.innerHTML += `<div style="color:red">ERR: ${e.message} at ${e.filename}:${e.lineno}</div>`;
  });
  window.addEventListener("unhandledrejection", (e) => {
    const bd = document.getElementById("ar-debug-body");
    if (bd) bd.innerHTML += `<div style="color:red">PROMISE ERR: ${e.reason}</div>`;
  });
}
const RETICLE_COLORS = Object.freeze({
  candidate: { ring: 0xf2c94c, dot: 0xffe6a6, opacity: 0.9 },
  stable: { ring: 0x22c55e, dot: 0xbbf7d0, opacity: 0.95 },
  lost: { ring: 0xef4444, dot: 0xfca5a5, opacity: 0.65 },
  manual: { ring: 0x38bdf8, dot: 0xbae6fd, opacity: 0.9 },
});

const surfaceTracker = new SurfaceTracker(SURFACE_TRACKING_CONFIG);
let xrCapabilities = createEmptyCapabilities();
let depthState = {
  supported: false,
  lastFrameHadDepth: false,
  lastDepthAtMs: null,
  estimatedDistanceM: null,
};

let manualControls = { tiltDeg: 0, distanceM: 2, heightOffsetM: 0, yawDeg: 0 };

function resolveFrameModelUrl(candidate) {
	try {
		const url = new URL(String(candidate || DEFAULT_FRAME_GLB), window.location.origin);
		const allowedPath = url.pathname.startsWith("/uploads/models/") || url.pathname.startsWith("/assets/3d/");
		const allowedExtension = /\.(?:glb|gltf)$/i.test(url.pathname);
		return url.origin === window.location.origin && allowedPath && allowedExtension
			? `${url.pathname}${url.search}`
			: DEFAULT_FRAME_GLB;
	} catch {
		return DEFAULT_FRAME_GLB;
	}
}

function normalizeFrontRotationY(value) {
  return Number(value) === 180 ? 180 : 0;
}

function normalizeFrameData(frameData = {}) {
  return {
    ...frameData,
    modelUrl: resolveFrameModelUrl(frameData.modelUrl),
    modelFrontRotationY: normalizeFrontRotationY(frameData.modelFrontRotationY),
  };
}

window.preloadARModel = function preloadARModel(frameData) {
  currentFrameData = normalizeFrameData(frameData);
  return loadAssets({ background: true, waitForRequested: true });
};

window.initWebXR = function initWebXR(frameData) {
	currentFrameData = normalizeFrameData(frameData);
	updateInfoUI(currentFrameData);

  if (isInitialized) return;
  isInitialized = true;

  setupScene();
  setupCamera();
  setupRenderer();
  setupEnvironment();
  setupLighting();
  setupReticle();
  setupARButton();
  bindUIControls();
  startRenderLoop();
};

function setupScene() {
  scene = new THREE.Scene();
}

function setupCamera() {
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  // Resolusi berlebih pada ponsel membuat parsing/render GLB besar berebut
  // waktu dengan ARCore. 1.5x tetap tajam tetapi jauh lebih ringan.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Reinhard lebih neutral dari ACES Filmic: tidak mengangkat shadows maupun
  // melembutkan highlights secara agresif, sehingga warna material gelap
  // (kayu mahogany, dll.) tampil mendekati warna asli file GLB.
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  resizeHandler = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", resizeHandler);
}

function setupEnvironment() {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.background = null;
  pmremGenerator.dispose();
}

function setupLighting() {
  // Warna neutral (bukan warm) agar material tidak mengalami color shift.
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(1, 2, 2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xfff0e0, 0.7);
  fill.position.set(-2, 1, 1);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe8c0, 0.4);
  rim.position.set(0, -1, -2);
  scene.add(rim);
}

function setupReticle() {
  const grp = new THREE.Group();

  const ringGeo = new THREE.RingGeometry(0.08, 0.12, 56);
  // Tidak perlu rotateX karena quaternion dinding baru menempatkan normal
  // sebagai Z-axis — geometri ring yang normal-nya Z sudah menghadap kamera.
  reticleRingMaterial = new THREE.MeshBasicMaterial({
    color: RETICLE_COLORS.candidate.ring,
    transparent: true,
    opacity: RETICLE_COLORS.candidate.opacity,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, reticleRingMaterial);
  grp.add(ring);

  const dotGeo = new THREE.CircleGeometry(0.02, 32);
  // Sama seperti ring — tidak perlu pre-rotate.
  reticleDotMaterial = new THREE.MeshBasicMaterial({
    color: RETICLE_COLORS.candidate.dot,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const dot = new THREE.Mesh(dotGeo, reticleDotMaterial);
  grp.add(dot);

  grp.matrixAutoUpdate = false;
  grp.visible = false;
  reticle = grp;
  scene.add(reticle);
}

function setupARButton() {
  const container = document.getElementById("ar-button-container");
  if (!container || document.getElementById("citraframe-ar-start")) return;

  const button = document.createElement("button");
  button.id = "citraframe-ar-start";
  button.type = "button";
  button.className = "citraframe-ar-start-btn";
  button.textContent = "Memeriksa dukungan AR...";
  button.disabled = true;
  button.setAttribute("aria-describedby", "ar-session-feedback");
  button.addEventListener("click", startARSession);
  container.appendChild(button);

  getXRSupport().then((support) => {
    immersiveARSupported = support.immersiveAr;
    button.disabled = !support.immersiveAr;
    button.textContent = support.immersiveAr ? "Mulai Kamera AR" : "WebXR AR tidak didukung";
    if (!support.immersiveAr) {
      setARSessionFeedback(
        "Perangkat atau browser ini tidak menyediakan WebXR immersive-ar. Gunakan Tempatkan Manual.",
        { error: true },
      );
    }
  });
}

async function startARSession(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const startButton = document.getElementById("citraframe-ar-start");
  if (sessionStartPending) return;
  if (!immersiveARSupported) {
    setARSessionFeedback(
      "WebXR AR tidak tersedia. Gunakan Android Chrome dengan Google Play Services for AR dan akses HTTPS.",
      { error: true },
    );
    return;
  }
  if (activeSession || renderer?.xr?.isPresenting) {
    setARSessionFeedback("Sesi kamera AR sudah aktif.");
    return;
  }

  sessionStartPending = true;
  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "Membuka kamera AR...";
    startButton.setAttribute("aria-busy", "true");
  }
  setARSessionFeedback("Menunggu izin kamera AR. Setujui dialog izin yang muncul dari browser.");
  setLastError("");
  setInstruction("Meminta izin kamera AR...");
  clearSessionStartFeedbackTimer();
  sessionStartFeedbackTimer = window.setTimeout(() => {
    if (!sessionStartPending || activeSession) return;
    setARSessionFeedback(
      "Kamera masih menunggu respons. Periksa dialog izin Chrome, lalu pastikan tab ini dibuka melalui HTTPS.",
    );
  }, 4500);

  try {
    const overlay = document.getElementById("ar-overlay");
    const result = await requestARSession(navigator, overlay, {
      logger: console,
      // Satu permintaan yang konservatif harus dilakukan langsung di dalam
      // gesture pengguna. Mencoba konfigurasi kedua setelah request pertama
      // ditolak dapat kehilangan transient user activation di Android Chrome.
      preferFull: false,
      skipSupportCheck: true,
    });

    xrCapabilities = result.capabilities;
    if (!result.session) {
      throw new Error(result.errors[result.errors.length - 1] || "WebXR AR tidak tersedia.");
    }

    activeSession = result.session;
    activeSessionToken += 1;
    const sessionToken = activeSessionToken;
    sourceRegistry = new XRSourceRegistry();
    bindSessionEvents(activeSession, overlay);

    await renderer.xr.setSession(activeSession);
    if (!isCurrentSession(activeSession, sessionToken)) return;
    clearSessionStartFeedbackTimer();
    sessionStartPending = false;
    setARSessionFeedback("", { hidden: true });
    onARStart(activeSession, result, sessionToken);
  } catch (error) {
    const friendlyError = describeARStartError(error);
    setLastError(error?.message || String(error));
    setInstruction("WebXR AR tidak dapat dimulai. Gunakan Android Chrome dengan ARCore dan akses HTTPS.");
    await cleanupFailedSessionStart();
    clearSessionStartFeedbackTimer();
    sessionStartPending = false;
    setARSessionFeedback(friendlyError, { error: true });
    if (startButton) {
      startButton.disabled = false;
      startButton.textContent = "Coba Mulai Kamera AR Lagi";
      startButton.removeAttribute("aria-busy");
    }
  }
}

function setARSessionFeedback(message, { error = false, hidden = false } = {}) {
  const feedback = document.getElementById("ar-session-feedback");
  if (!feedback) return;
  feedback.hidden = hidden || !message;
  feedback.classList.toggle("is-error", Boolean(error));
  feedback.textContent = message || "";
}

function clearSessionStartFeedbackTimer() {
  if (sessionStartFeedbackTimer === null) return;
  window.clearTimeout(sessionStartFeedbackTimer);
  sessionStartFeedbackTimer = null;
}

function describeARStartError(error) {
  const raw = String(error?.message || error || "");
  const normalized = raw.toLowerCase();
  if (normalized.includes("notallowed") || normalized.includes("permission") || normalized.includes("izin")) {
    return "Izin kamera AR ditolak atau dialog izin ditutup. Izinkan kamera untuk situs ini, lalu tekan tombol coba lagi.";
  }
  if (normalized.includes("security") || normalized.includes("secure") || normalized.includes("https")) {
    return "WebXR hanya dapat dimulai melalui HTTPS. Buka kembali halaman dari alamat HTTPS, bukan HTTP.";
  }
  if (normalized.includes("notsupported") || normalized.includes("not supported") || normalized.includes("unsupported")) {
    return "Sesi WebXR tidak didukung oleh konfigurasi perangkat ini. Pastikan Android Chrome dan Google Play Services for AR sudah diperbarui.";
  }
  if (normalized.includes("invalidstate") || normalized.includes("already")) {
    return "Kamera AR sedang digunakan oleh sesi lain. Tutup sesi atau tab AR lain, lalu coba kembali.";
  }
  return `Kamera AR gagal dibuka: ${raw || "kesalahan tidak diketahui"}. Periksa izin kamera lalu coba kembali.`;
}

function getXRSupport() {
  if (!xrSupportPromise) xrSupportPromise = detectImmersiveARSupport(navigator);
  return xrSupportPromise;
}

function bindSessionEvents(session, overlay) {
  const endHandler = () => onAREnd();
  const selectHandler = () => {
    if (!manualMode && !isFramePlaced) placeFrame();
  };
  const beforeXRSelectHandler = (event) => {
    const target = event.target;
    if (target?.closest?.("button, input, a, .ar-wall-tips, .ar-detection-fallback, .ar-manual-panel, .ar-native-offer, .ar-debug-panel")) {
      event.preventDefault();
    }
  };
  sourceRegistry.addListener(session, "end", endHandler);
  sourceRegistry.addListener(session, "select", selectHandler);
  sourceRegistry.addListener(overlay, "beforexrselect", beforeXRSelectHandler);
}

function onARStart(session, sessionResult, sessionToken) {
  const now = performance.now();
  sessionStartMs = now;
  scanStartMs = now;
  manualFallbackDismissed = false;
  lastNativeHit = null;
  pointWallSamples = [];
  lastPointWallFit = null;
  detectedWallPlaneCount = 0;
  currentViewerMatrix = null;
  currentViewerPoseTimestamp = null;
  viewerTrackingAvailable = false;
  surfaceTracker.reset();
  lastSurfaceStatus = surfaceTracker.getStatus(now);

  const overlay = document.getElementById("ar-overlay");
  if (overlay) overlay.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";

  hideManualFallback();
  hideNativeOffer();
  updateWallHelpVisibility(true);
  updateManualLabel(false);
  updateCenterAim(false);
  initDebugPanel();
  setARGuideState("scanning");
  setInstruction("Mendeteksi dinding. Gerakkan ponsel perlahan ke kiri dan kanan.");

  if (sessionResult?.errors?.length) {
    setLastError(sessionResult.errors[sessionResult.errors.length - 1]);
  }

  prepareHitTestSources(session, sessionToken, sourceRegistry);
  requestLightProbe(session, sessionToken);

  if (!assetsLoaded) {
    loadAssets();
  } else {
    updatePlaceButtonState();
  }
}

function onAREnd() {
  if (!activeSession && !renderer?.xr?.isPresenting) return;

  activeSessionToken += 1;
  releaseXRResources();
  resetPlacement();

  const overlay = document.getElementById("ar-overlay");
  if (overlay) overlay.style.display = "none";

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";

  activeSession = null;
  currentViewerMatrix = null;
  currentViewerPoseTimestamp = null;
  viewerTrackingAvailable = false;
  pointWallSamples = [];
  lastPointWallFit = null;
  detectedWallPlaneCount = 0;
  lightProbe = null;
  xrCapabilities = createEmptyCapabilities();
  depthState = {
    supported: false,
    lastFrameHadDepth: false,
    lastDepthAtMs: null,
    estimatedDistanceM: null,
  };
  _lastGuideState = "";
  clearSessionStartFeedbackTimer();
  sessionStartPending = false;
  const startButton = document.getElementById("citraframe-ar-start");
  if (startButton) {
    startButton.disabled = false;
    startButton.textContent = "Mulai Kamera AR";
    startButton.removeAttribute("aria-busy");
  }
  setARSessionFeedback("", { hidden: true });
}

async function cleanupFailedSessionStart() {
  const failedSession = activeSession;
  activeSessionToken += 1;
  releaseXRResources();
  activeSession = null;
  currentViewerMatrix = null;
  currentViewerPoseTimestamp = null;
  viewerTrackingAvailable = false;
  if (failedSession && typeof failedSession.end === "function") {
    try {
      await failedSession.end();
    } catch {}
  }
}

function isCurrentSession(session, sessionToken) {
  return Boolean(session && session === activeSession && sessionToken === activeSessionToken);
}

async function prepareHitTestSources(session, sessionToken, registry) {
  if (!session || hitTestSourceRequested) return;
  hitTestSourceRequested = true;

  try {
    const requestedViewerSpace = await session.requestReferenceSpace("viewer");
    if (!isCurrentSession(session, sessionToken)) return;
    viewerSpace = requestedViewerSpace;

    const center = await requestViewerHitTestSource(session, viewerSpace, "center");
    if (!isCurrentSession(session, sessionToken)) {
      center?.source?.cancel?.();
      return;
    }
    if (center) {
      hitTestSource = center.source;
      hitTestSources.push(center);
      registry.addSource(center.source);
      xrCapabilities.hitTest = true;
    }

    // Jalur cepat hanya memakai ray tengah. Ray tambahan dibuat secara lazy
    // jika dinding belum stabil, sehingga frame awal AR tetap ringan.
    if (!center) {
      setLastError("Hit-test source tidak tersedia.");
    }

  } catch (error) {
    if (isCurrentSession(session, sessionToken)) {
      setLastError(error?.message || "Gagal membuat hit-test source.");
    }
  }
}

async function requestViewerHitTestSource(
  session,
  space,
  name,
  offsetRay = null,
  trackableType = "plane",
) {
  const base = offsetRay ? { space, offsetRay } : { space };
  const priority = trackableType === "point"
    ? 3
    : name === "center"
      ? 0
      : 1;
  try {
    const source = await session.requestHitTestSource({
      ...base,
      entityTypes: [trackableType],
    });
    return { source, name, priority, trackableType };
  } catch {
    if (trackableType !== "plane") return null;
    try {
      const source = await session.requestHitTestSource(base);
      return { source, name, priority, trackableType };
    } catch {
      return null;
    }
  }
}

async function requestOptionalOffsetHitTestSources(session, space, sessionToken) {
  if (!window.XRRay) return [];

  const rays = [
    ["left", -OFFSET_RAY_SPREAD, 0],
    ["right", OFFSET_RAY_SPREAD, 0],
  ];

  const entries = [];
  for (const [name, x, y] of rays) {
    if (!isCurrentSession(session, sessionToken)) break;
    try {
      const origin = typeof DOMPointReadOnly !== "undefined"
        ? new DOMPointReadOnly(0, 0, 0, 1)
        : { x: 0, y: 0, z: 0, w: 1 };
      const direction = typeof DOMPointReadOnly !== "undefined"
        ? new DOMPointReadOnly(x, y, -1, 0)
        : { x: 0, y: 0, z: -1, w: 0 };
      const ray = new window.XRRay(origin, direction);
      const entry = await requestViewerHitTestSource(session, space, name, ray);
      if (entry) entries.push(entry);
    } catch {
      // Offset rays are an optimization only; center hit-test remains authoritative.
    }
  }
  return entries;
}

async function requestPointFallbackHitTestSources(session, space, sessionToken) {
  const center = await requestViewerHitTestSource(
    session,
    space,
    "point-center",
    null,
    "point",
  );
  if (!center || !isCurrentSession(session, sessionToken)) {
    center?.source?.cancel?.();
    return [];
  }

  return [center];
}

function maybePrepareSupplementalHitTestSources(timestamp) {
  if (!activeSession || !viewerSpace || surfaceTracker.canPlace(timestamp)) return;
  const elapsed = timestamp - scanStartMs;
  const session = activeSession;
  const sessionToken = activeSessionToken;
  const registry = sourceRegistry;

  if (!supplementalPlaneSourcesRequested && elapsed >= SUPPLEMENTAL_PLANE_AFTER_MS) {
    supplementalPlaneSourcesRequested = true;
    requestOptionalOffsetHitTestSources(session, viewerSpace, sessionToken)
      .then((entries) => {
        if (!isCurrentSession(session, sessionToken)) {
          entries.forEach((entry) => entry?.source?.cancel?.());
          return;
        }
        entries.forEach((entry) => {
          hitTestSources.push(entry);
          registry.addSource(entry.source);
        });
      })
      .catch(() => {});
  }

  if (
    !pointFallbackSourceRequested &&
    elapsed >= POINT_WALL_TRACKING_CONFIG.fallbackAfterMs
  ) {
    pointFallbackSourceRequested = true;
    requestPointFallbackHitTestSources(session, viewerSpace, sessionToken)
      .then((entries) => {
        if (!isCurrentSession(session, sessionToken)) {
          entries.forEach((entry) => entry?.source?.cancel?.());
          return;
        }
        entries.forEach((entry) => {
          hitTestSources.push(entry);
          registry.addSource(entry.source);
        });
      })
      .catch(() => {});
  }
}

async function requestLightProbe(session, sessionToken) {
  if (!session || typeof session.requestLightProbe !== "function") return;
  try {
    const requestedProbe = await session.requestLightProbe();
    if (!isCurrentSession(session, sessionToken)) return;
    lightProbe = requestedProbe;
    xrCapabilities.lightEstimation = Boolean(lightProbe);
  } catch {
    if (isCurrentSession(session, sessionToken)) lightProbe = null;
  }
}

function releaseXRResources() {
  sourceRegistry.cleanup();
  hitTestSource = null;
  hitTestSources = [];
  hitTestSourceRequested = false;
  supplementalPlaneSourcesRequested = false;
  pointFallbackSourceRequested = false;
  viewerSpace = null;
  xrCapabilities.hitTest = false;
  xrCapabilities.transientHitTest = false;
}

async function loadAssets({ background = false, waitForRequested = false } = {}) {
  const requestedModelUrl = resolveFrameModelUrl(currentFrameData?.modelUrl);
  if (assetsLoaded && frameModel && assetRequestedUrl === requestedModelUrl) {
    return frameModel;
  }
  if (assetLoadPromise && assetRequestedUrl === requestedModelUrl) {
    if (!background) showAssetLoadingInstruction();
    return assetLoadPromise;
  }

  const generation = ++assetLoadGeneration;
  assetRequestedUrl = requestedModelUrl;
  assetLoadState = "loading";
  assetLoadProgress = null;
  assetsLoaded = false;
  activeAssetIsFallback = false;

  if (!background) showAssetLoadingInstruction();
  updatePlaceButtonState();

  const requestedAssetPromise = loadGLTF(requestedModelUrl)
    .then((asset) => ({ asset, kind: "requested", url: requestedModelUrl }));

  let fallbackTimer = null;
  let fallbackAssetPromise = null;
  if (requestedModelUrl !== DEFAULT_FRAME_GLB && !waitForRequested) {
    fallbackAssetPromise = new Promise((resolve) => {
      fallbackTimer = window.setTimeout(resolve, FAST_FALLBACK_DELAY_MS);
    }).then(() => loadGLTF(DEFAULT_FRAME_GLB))
      .then((asset) => ({ asset, kind: "fallback", url: DEFAULT_FRAME_GLB }));
  }

  const firstUsableAsset = waitForRequested && requestedModelUrl !== DEFAULT_FRAME_GLB
    ? requestedAssetPromise.catch(async (requestedError) => {
        const asset = await loadGLTF(DEFAULT_FRAME_GLB);
        return {
          asset,
          kind: "fallback",
          url: DEFAULT_FRAME_GLB,
          requestedError,
        };
      })
    : fallbackAssetPromise
      ? Promise.any([requestedAssetPromise, fallbackAssetPromise])
      : requestedAssetPromise;

  assetLoadPromise = firstUsableAsset
    .then((result) => {
      if (generation !== assetLoadGeneration || requestedModelUrl !== assetRequestedUrl) {
        return frameModel;
      }

      if (result.kind === "requested" && fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      adoptLoadedAsset(result, generation);

      // Apabila model 35+ MB belum selesai, model ringan membuat AR tetap
      // dapat dipakai. Begitu model asli selesai, instance diganti tanpa
      // kompresi dan tanpa mengubah posisi yang sudah ditempatkan.
      if (result.kind === "fallback") {
        requestedAssetPromise
          .then((requestedResult) => {
            if (
              generation === assetLoadGeneration &&
              requestedModelUrl === assetRequestedUrl
            ) {
              adoptLoadedAsset(requestedResult, generation, { upgrade: true });
            }
          })
          .catch((error) => {
            if (generation !== assetLoadGeneration) return;
            setLastError(error?.message || "Model 3D produk gagal dimuat; model bawaan tetap digunakan.");
          });
      }

      return frameModel;
    })
    .catch((error) => {
      if (generation !== assetLoadGeneration) return frameModel;
      assetsLoaded = false;
      assetLoadState = "error";
      assetLoadProgress = null;
      pendingPlacementMode = null;
      setLastError(error?.message || "Gagal memuat model 3D dan model cadangan.");
      setInstruction("Model 3D gagal dimuat. Periksa koneksi lalu tekan Tempatkan Manual untuk mencoba lagi.");
      updatePlaceButtonState();
      return null;
    })
    .finally(() => {
      if (generation === assetLoadGeneration) assetLoadPromise = null;
    });

  return assetLoadPromise;
}

function loadGLTF(path) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      path,
      (gltf) => {
        try {
          const sourceModel = gltf.scene;
          // Menghapus rotasi root dari Sketchfab model terbukti merusak orientasi
        // asli dari model unggahan karena mesh raw di dalamnya seringkali tidak
        // beraturan. Biarkan Three.js membaca bounds setelah rotasi root diterapkan.

        const sourceBox = new THREE.Box3().setFromObject(sourceModel);
        const sourceSize = new THREE.Vector3();
        sourceBox.getSize(sourceSize);
        const axisLayout = resolveModelAxisNormalization(sourceSize);
        if (!axisLayout) {
          reject(new Error("Dimensi model 3D tidak valid."));
          return;
        }

        // Orientasikan bidang utama model ke X/Y tanpa menyentuh vertex,
        // material, normal map, atau tekstur asli GLB.
        const canonicalModel = new THREE.Group();
        canonicalModel.name = "CitraFrameCanonicalAxes";
        canonicalModel.rotation.set(
          THREE.MathUtils.degToRad(axisLayout.rotationXDeg),
          THREE.MathUtils.degToRad(axisLayout.rotationYDeg),
          THREE.MathUtils.degToRad(axisLayout.rotationZDeg),
        );
        canonicalModel.add(sourceModel);
        canonicalModel.updateMatrixWorld(true);

        const canonicalBox = new THREE.Box3().setFromObject(canonicalModel);
        const center = new THREE.Vector3();
        canonicalBox.getCenter(center);
        canonicalModel.position.sub(center);
        canonicalModel.updateMatrixWorld(true);
        const canonicalBounds = new THREE.Vector3();
        new THREE.Box3().setFromObject(canonicalModel).getSize(canonicalBounds);

        // Pisahkan koreksi depan/belakang dari wrapper penempatan. Jangan
        // menambahkan koreksi roll dari vertex: quaternion dinding sudah
        // mengunci sumbu +Y model tepat ke world-up agar bingkai selalu tegak.
        const frontCorrectedModel = new THREE.Group();
        frontCorrectedModel.name = "CitraFrameFrontCorrectedModel";
        frontCorrectedModel.userData.frontRotationY = normalizeFrontRotationY(
          path === DEFAULT_FRAME_GLB ? 0 : currentFrameData?.modelFrontRotationY,
        );
        frontCorrectedModel.rotation.set(
          THREE.MathUtils.degToRad(path === DEFAULT_FRAME_GLB ? 0 : (currentFrameData?.modelFrontRotationX || 0)),
          THREE.MathUtils.degToRad(frontCorrectedModel.userData.frontRotationY),
          0
        );
        frontCorrectedModel.add(canonicalModel);

        const orientedModel = new THREE.Group();
        orientedModel.name = "CitraFrameOrientedModel";
        orientedModel.userData.frontRotationY = frontCorrectedModel.userData.frontRotationY;
        orientedModel.add(frontCorrectedModel);

        if (AR_DEBUG_ENABLED) {
          console.info("[AR] GLB bounds", {
            source: sourceSize.toArray(),
            canonical: canonicalBounds.toArray(),
            depthAxis: axisLayout.depthAxis,
            frontRotationY: orientedModel.userData.frontRotationY,
          });
        }
        
        // Ukur bounds dari orientedModel yang sudah dirotasi lengkap
        // agar scaleToRealSize mendapat dimensi visual yang benar.
        orientedModel.updateMatrixWorld(true);
        const finalBox = new THREE.Box3().setFromObject(orientedModel);
        const finalBounds = new THREE.Vector3();
        finalBox.getSize(finalBounds);
        
          resolve({
            model: orientedModel,
            bounds: finalBounds,
          });
        } catch (error) {
          console.error("[AR] Error preparing GLB:", error);
          reject(error);
        }
      },
      (progressEvent) => {
        if (path !== assetRequestedUrl) return;
        const loaded = Number(progressEvent?.loaded);
        const total = Number(progressEvent?.total);
        assetLoadProgress = Number.isFinite(loaded) && Number.isFinite(total) && total > 0
          ? Math.min(1, loaded / total)
          : null;
        
        // Dispatch event for UI. progress bernilai null saat total byte tidak
        // diketahui (server tanpa Content-Length) agar UI bisa menampilkan
        // mode indeterminate, sementara loaded tetap dikirim untuk info MB.
        window.dispatchEvent(new CustomEvent("ar-model-progress", {
          detail: {
            progress: assetLoadProgress,
            loaded: Number.isFinite(loaded) ? loaded : null,
            total: Number.isFinite(total) && total > 0 ? total : null,
          }
        }));

        if (activeSession && !assetsLoaded) {
          showAssetLoadingInstruction();
          updatePlaceButtonState();
        }
      },
      reject,
    );
  });
}

function adoptLoadedAsset(result, generation, { upgrade = false } = {}) {
  if (
    generation !== assetLoadGeneration ||
    !result?.asset?.model ||
    !result?.asset?.bounds
  ) {
    return;
  }

  const previousWallOffsetM = Number(placedFrame?.userData?.wallContactOffsetM) || 0;
  frameModel = result.asset.model;
  modelBounds = result.asset.bounds;
  assetsLoaded = true;
  assetLoadState = "ready";
  assetLoadProgress = 1;
  activeAssetIsFallback = result.kind === "fallback";

  if (upgrade) {
    replaceLiveFrameWithLoadedAsset(previousWallOffsetM);
    setLastError("");
  } else if (activeAssetIsFallback) {
    setLastError("Model 3D produk masih dimuat; AR sementara memakai model bawaan.");
  }

  updatePlaceButtonState();
  if (pendingPlacementMode) {
    window.queueMicrotask(flushPendingPlacement);
  } else if (activeSession && !isFramePlaced) {
    updateARInstruction(performance.now());
  }
}

function replaceLiveFrameWithLoadedAsset(previousWallOffsetM = 0) {
  if (manualPreviewFrame) {
    removeManualPreview();
    updateManualPreview();
  }
  if (!placedFrame || !frameAnchor) return;

  const replacement = createFrameInstance();
  if (!replacement) return;
  replacement.position.copy(placedFrame.position);
  replacement.quaternion.copy(placedFrame.quaternion);

  const nextWallOffsetM = getFrameWallOffset(replacement);
  const offsetDeltaM = nextWallOffsetM - previousWallOffsetM;
  if (Math.abs(offsetDeltaM) > 0.0001 && frameAnchor.faceDir) {
    replacement.position.addScaledVector(frameAnchor.faceDir, offsetDeltaM);
  }

  scene.remove(placedFrame);
  scene.add(replacement);
  placedFrame = replacement;
  frameAnchor.position.copy(replacement.position);
  frameAnchor.quaternion.copy(replacement.quaternion);
  frameAnchor.wallOffsetM = nextWallOffsetM;
  if (frameAnchor.anchorModelOffset) {
    frameAnchor.anchorModelOffset.addScaledVector(frameAnchor.faceDir, offsetDeltaM);
  }
}

function getAssetProgressLabel() {
  if (!Number.isFinite(assetLoadProgress)) return "";
  const percent = Math.max(1, Math.min(99, Math.round(assetLoadProgress * 100)));
  return ` ${percent}%`;
}

function showAssetLoadingInstruction() {
  const progress = getAssetProgressLabel();
  const stable = surfaceTracker.canPlace(performance.now());
  setInstruction(
    stable
      ? `Dinding sudah stabil. Model 3D sedang dimuat${progress} dan akan ditempatkan otomatis.`
      : `Memuat model 3D bingkai${progress}. Anda tetap dapat memindai dinding.`,
  );
}

function flushPendingPlacement() {
  if (!assetsLoaded || !activeSession) return;
  const placementMode = pendingPlacementMode;
  pendingPlacementMode = null;

  if (placementMode === "manual") {
    startManualPlacement();
    return;
  }
  if (placementMode === "native") {
    placeFrame();
  }
}

function resetExporterPresentationRotation(model) {
  model?.traverse?.((node) => {
    if (!/sketchfab[_\s-]*model/i.test(String(node?.name || ""))) return;
    node.quaternion.identity();
    node.rotation.set(0, 0, 0);
    node.updateMatrix();
  });
  model?.updateMatrixWorld?.(true);
}

function bindUIControls() {
  if (placeButtonBound) return;
  placeButtonBound = true;

  document.getElementById("place-btn")?.addEventListener("click", () => {
    if (isFramePlaced) removeFrame();
    else placeFrame();
  });

  document.getElementById("capture-btn")?.addEventListener("click", () => {
    takeScreenshot();
  });

  document.getElementById("rotate-left-btn")?.addEventListener("click", () => {
    rotateFrame(-Math.PI / 2);
  });
  document.getElementById("rotate-right-btn")?.addEventListener("click", () => {
    rotateFrame(Math.PI / 2);
  });

  document.getElementById("ar-wall-help-btn")?.addEventListener("click", toggleWallTips);
  document.getElementById("ar-retry-scan-btn")?.addEventListener("click", retryNativeScan);
  document.getElementById("ar-start-manual-btn")?.addEventListener("click", startManualPlacement);
  document.getElementById("manual-reset-btn")?.addEventListener("click", resetManualControls);
  document.getElementById("manual-confirm-btn")?.addEventListener("click", confirmManualFrame);
  document.getElementById("manual-cancel-btn")?.addEventListener("click", retryNativeScan);
  document.getElementById("use-native-hit-btn")?.addEventListener("click", useNativePlacement);
  document.getElementById("ar-debug-toggle")?.addEventListener("click", toggleDebugPanel);
  document.getElementById("ar-debug-show")?.addEventListener("click", toggleDebugPanel);
  document.getElementById("ar-exit-btn")?.addEventListener("click", endARSession);
  bindRangeControl("manual-tilt", "tiltDeg", "manual-tilt-value", "deg");
  bindRangeControl("manual-distance", "distanceM", "manual-distance-value", "m");
  bindRangeControl("manual-height", "heightOffsetM", "manual-height-value", "m");
  bindRangeControl("manual-yaw", "yawDeg", "manual-yaw-value", "deg");
  
  // Sembunyikan kontrol AR utama saat panel manual terbuka
  document.getElementById("manual-capture-btn")?.addEventListener("click", () => {
    takeScreenshot();
  });
  updateManualControlLabels();
}

async function endARSession() {
  const session = activeSession;
  if (!session || typeof session.end !== "function") return;
  try {
    await session.end();
  } catch (error) {
    setLastError(error?.message || "Sesi AR gagal diakhiri.");
  }
}

function bindRangeControl(id, key, labelId, suffix) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("input", () => {
    manualControls[key] = Number(input.value);
    const label = document.getElementById(labelId);
    if (label) label.textContent = `${Number(input.value).toFixed(key.endsWith("Deg") ? 0 : 2)} ${suffix}`;
    updateManualPreview();
  });
}

function startRenderLoop() {
  if (renderLoopStarted) return;
  renderLoopStarted = true;

  renderer.setAnimationLoop((timestamp, xrFrame) => {
    lastFrameDeltaMs = lastFrameTimestamp > 0 ? timestamp - lastFrameTimestamp : 0;
    lastFrameTimestamp = timestamp;

    if (!xrFrame) {
      renderer.render(scene, camera);
      return;
    }

    const refSpace = renderer.xr.getReferenceSpace();
    if (!refSpace) {
      renderer.render(scene, camera);
      return;
    }

    const viewerPose = getCurrentViewerPose(xrFrame, refSpace);
    viewerTrackingAvailable = Boolean(viewerPose?.transform?.matrix);
    if (viewerTrackingAvailable) {
      currentViewerMatrix = Array.from(viewerPose.transform.matrix);
      currentViewerPoseTimestamp = timestamp;
    }

    updateDepthState(xrFrame, viewerPose, timestamp);

    if (!viewerTrackingAvailable) {
      lastHitCount = 0;
      lastSurfaceStatus = surfaceTracker.markMiss(timestamp, "unknown");
      updateReticleFromTracker(timestamp);
      updateDebugPanel(timestamp);
      if (!isFramePlaced) setInstruction("Tracking kamera belum tersedia. Gerakkan ponsel perlahan sampai tracking kembali.");
      renderer.render(scene, camera);
      return;
    }

    const viewerPosition = getPositionFromMatrixElements(currentViewerMatrix);
    maybePrepareSupplementalHitTestSources(timestamp);
    const viewerHits = collectViewerHits(xrFrame, refSpace, timestamp);
    const planeHits = refineWallHitNormals(
      viewerHits.filter((hit) => hit.trackableType === "plane"),
      viewerPosition,
    );
    const pointWallHit = buildPointWallHypothesis(
      viewerHits.filter((hit) => hit.trackableType === "point"),
      viewerPosition,
      timestamp,
    );
    const detectedPlaneHits = collectDetectedWallPlaneHits(
      xrFrame,
      refSpace,
      viewerPosition,
      timestamp,
    );
    const nativeHits = [
      ...detectedPlaneHits,
      ...planeHits,
      ...(pointWallHit ? [pointWallHit] : []),
    ];
    lastHitCount = nativeHits.length;

    const bestHit = pickBestWallHit(nativeHits);
    if (bestHit) {
      lastNativeHit = bestHit;
      lastSurfaceStatus = surfaceTracker.trackHit(bestHit, timestamp);
    } else {
      const fallbackClassification = nativeHits[0]?.classification || "unknown";
      lastSurfaceStatus = surfaceTracker.markMiss(timestamp, fallbackClassification);
    }

    updateReticleFromTracker(timestamp);
    updatePlacedAnchorFromXRFrame(xrFrame, refSpace);

    if (manualMode && !isFramePlaced) {
      updateManualPreview();
    }

    updateARInstruction(timestamp);
    updateNativeOffer(timestamp);
    updateDebugPanel(timestamp);

    renderer.render(scene, camera);
  });
}

function collectViewerHits(xrFrame, refSpace, timestamp) {
  const hits = [];
  for (const entry of hitTestSources) {
    if (!entry?.source) continue;
    if (
      entry.trackableType === "point" &&
      timestamp - scanStartMs < POINT_WALL_TRACKING_CONFIG.fallbackAfterMs
    ) {
      continue;
    }
    try {
      const results = xrFrame.getHitTestResults(entry.source);
      if (!results || results.length === 0) continue;
      const hit = createPreferredHitInfo(
        results,
        refSpace,
        timestamp,
        entry,
      );
      if (hit) hits.push(hit);
    } catch (error) {
      setLastError(error?.message || "Viewer hit-test gagal.");
    }
  }
  return hits;
}

function createPreferredHitInfo(results, refSpace, timestamp, sourceEntry = {}) {
  const hits = [];
  const resultCount = Math.min(results?.length || 0, MAX_HIT_RESULTS_PER_SOURCE);

  for (let resultIndex = 0; resultIndex < resultCount; resultIndex += 1) {
    const hit = createHitInfo(
      results[resultIndex],
      refSpace,
      timestamp,
      sourceEntry,
      resultIndex,
    );
    if (!hit) continue;
    hits.push(hit);
  }

  return selectPreferredWallHit(hits);
}

function createHitInfo(
  hitResult,
  refSpace,
  timestamp,
  sourceEntry = {},
  resultIndex = 0,
) {
  const pose = hitResult.getPose(refSpace);
  if (!pose) return null;

  const matrix = Array.from(pose.transform.matrix);
  const position = getPositionFromMatrixElements(matrix);
  const viewerPosition = currentViewerMatrix
    ? getPositionFromMatrixElements(currentViewerMatrix)
    : getCameraWorldPositionArray();
  const rawNormal = orientNormalTowardPoint(
    extractSurfaceNormalFromMatrixElements(matrix),
    position,
    viewerPosition,
  );
  if (!rawNormal) return null;
  const isPointHit = sourceEntry.trackableType === "point";
  const inferredPointNormal = isPointHit
    ? inferVerticalWallNormalFromPoint(position, viewerPosition)
    : null;
  if (isPointHit && !inferredPointNormal) return null;

  const classification = isPointHit
    ? "vertical"
    : classifySurfaceNormal(rawNormal, SURFACE_TRACKING_CONFIG);
  // Bingkai nyata selalu menggantung tegak lurus gravitasi. Normal hit-test
  // pada dinding sering miring beberapa derajat (toleransi klasifikasi
  // vertical sampai ~23°); tanpa proyeksi, kemiringan itu terbawa ke
  // orientasi bingkai sehingga terlihat condong/menyamping.
  // Untuk hit tipe titik, arah "menghadap kamera" hanyalah tebakan awal —
  // jangkarkan ke estimasi bidang tembok agar reticle/bingkai tidak ikut
  // berputar saat pengguna berdiri menyerong dari tembok.
  const trackingNormal = isPointHit
    ? resolveAnchoredWallNormal(position, inferredPointNormal, timestamp)
    : classification === "vertical"
      ? projectNormalToVerticalWall(rawNormal) || rawNormal
      : rawNormal;
  if (!trackingNormal) return null;
  const quaternion = makeSurfaceQuaternionFromNormal(trackingNormal);
  const distanceM = new THREE.Vector3().fromArray(viewerPosition)
    .distanceTo(new THREE.Vector3().fromArray(position));

  return {
    matrix,
    position,
    rawPosition: position,
    normal: trackingNormal,
    rawNormal,
    normalSource: isPointHit
      ? "point-camera-wall-candidate"
      : classification === "vertical"
        ? "hit-pose-upright"
        : "hit-pose",
    quaternion,
    classification,
    timestampMs: timestamp,
    hitResult,
    source: sourceEntry.name || "viewer",
    priority: sourceEntry.priority ?? 0,
    trackableType: sourceEntry.trackableType || "plane",
    resultIndex,
    distanceM,
    depthAvailable: depthState.lastFrameHadDepth,
  };
}

// Pilih normal tembok paling tepercaya untuk hit tipe titik. Prioritas:
// (1) plane-fit dari sebaran titik pada tembok — orientasi tembok nyata yang
// tidak bergantung arah berdiri pengguna; (2) estimasi tembok yang sudah
// dihaluskan tracker, selama titik masih berada di bidang yang sama;
// (3) fallback arah kamera hanya sebagai tebakan awal sebelum ada estimasi.
function resolveAnchoredWallNormal(position, fallbackNormal, timestamp) {
  if (
    lastPointWallFit?.normal &&
    timestamp - lastPointWallFit.timestampMs <= POINT_WALL_TRACKING_CONFIG.sampleWindowMs
  ) {
    return lastPointWallFit.normal;
  }

  const smoothed = surfaceTracker?.smoothedHit;
  if (smoothed?.normal && smoothed.classification === "vertical") {
    const movement = getPlaneMovement(smoothed.position, position, smoothed.normal);
    if (movement.perpendicularM <= SURFACE_TRACKING_CONFIG.planeDistanceToleranceM) {
      return smoothed.normal;
    }
  }

  return fallbackNormal;
}

function refineWallHitNormals(hits, viewerPosition) {
  const verticalHits = hits.filter((hit) => hit.classification === "vertical");
  if (verticalHits.length < 3) return hits;

  const reference = [...verticalHits].sort((a, b) => a.priority - b.priority)[0];
  const clustered = verticalHits.filter((hit) => (
    Math.abs(hit.distanceM - reference.distanceM) <= WALL_HIT_DEPTH_CLUSTER_M &&
    angleBetweenVec3Deg(hit.rawNormal, reference.rawNormal) <= WALL_NORMAL_CLUSTER_ANGLE_DEG
  ));
  if (clustered.length < 3) return hits;

  const fit = fitVerticalWallPlane(
    clustered.map((hit) => hit.position),
    viewerPosition,
    {
      minimumInlierCount: 3,
      maximumPlaneResidualM: WALL_PLANE_RESIDUAL_M,
    },
  );
  if (!fit) return hits;

  return hits.map((hit) => {
    if (!clustered.includes(hit)) return hit;
    const projectedPosition = projectPointOntoPlane(
      hit.position,
      fit.origin,
      fit.normal,
    );
    if (!projectedPosition) return hit;
    return {
      ...hit,
      position: projectedPosition,
      normal: fit.normal,
      quaternion: makeSurfaceQuaternionFromNormal(fit.normal),
      normalSource: "multi-ray-plane",
    };
  });
}

function buildPointWallHypothesis(pointHits, viewerPosition, timestamp) {
  if (pointHits.length === 0 || !currentViewerMatrix) return null;

  pointHits.forEach((hit) => {
    pointWallSamples.push({
      position: hit.position,
      timestampMs: timestamp,
    });
  });
  pointWallSamples = pointWallSamples
    .filter(({ timestampMs }) => (
      timestamp - timestampMs <= POINT_WALL_TRACKING_CONFIG.sampleWindowMs
    ))
    .slice(-POINT_WALL_TRACKING_CONFIG.maxSamples);

  const fit = fitVerticalWallPlane(
    pointWallSamples.map((sample) => sample.position),
    viewerPosition,
    POINT_WALL_TRACKING_CONFIG,
  );
  if (!fit) return null;

  // Simpan orientasi tembok hasil fit: titik-titik sampel berada DI tembok,
  // sehingga normal bidangnya tetap benar walau pengguna berdiri menyerong.
  lastPointWallFit = { normal: fit.normal, timestampMs: timestamp };

  const intersection = intersectRayWithPlane(
    viewerPosition,
    getForwardFromCameraMatrix(currentViewerMatrix),
    fit.origin,
    fit.normal,
  );
  if (
    !intersection ||
    intersection.distanceM < POINT_WALL_TRACKING_CONFIG.minDistanceM ||
    intersection.distanceM > POINT_WALL_TRACKING_CONFIG.maxDistanceM
  ) {
    return null;
  }

  return {
    matrix: null,
    position: intersection.position,
    rawPosition: intersection.position,
    normal: fit.normal,
    rawNormal: fit.normal,
    normalSource: "point-cloud-wall-plane",
    quaternion: makeSurfaceQuaternionFromNormal(fit.normal),
    classification: "vertical",
    timestampMs: timestamp,
    hitResult: null,
    source: "point-wall-plane",
    priority: 3,
    resultIndex: 0,
    trackableType: "point-plane",
    distanceM: intersection.distanceM,
    minimumStableFrameCount: POINT_WALL_TRACKING_CONFIG.minimumStableFrameCount,
    pointInlierCount: fit.inlierCount,
  };
}

function collectDetectedWallPlaneHits(xrFrame, refSpace, viewerPosition, timestamp) {
  detectedWallPlaneCount = 0;
  const detectedPlanes = xrFrame?.detectedPlanes;
  if (!detectedPlanes || typeof xrFrame.getPose !== "function" || !currentViewerMatrix) {
    return [];
  }

  xrCapabilities.planeDetection = true;
  const hits = [];
  const cameraForward = getForwardFromCameraMatrix(currentViewerMatrix);
  detectedPlanes.forEach((plane) => {
    if (plane?.orientation === "horizontal" || !plane?.planeSpace) return;
    try {
      const pose = xrFrame.getPose(plane.planeSpace, refSpace);
      if (!pose?.transform?.matrix) return;
      const matrix = Array.from(pose.transform.matrix);
      const planePosition = getPositionFromMatrixElements(matrix);
      const normal = orientNormalTowardPoint(
        extractSurfaceNormalFromMatrixElements(matrix),
        planePosition,
        viewerPosition,
      );
      const uprightNormal = projectNormalToVerticalWall(normal);
      if (!uprightNormal || classifySurfaceNormal(normal) !== "vertical") return;

      const intersection = intersectRayWithPlane(
        viewerPosition,
        cameraForward,
        planePosition,
        uprightNormal,
      );
      if (
        !intersection ||
        intersection.distanceM < POINT_WALL_TRACKING_CONFIG.minDistanceM ||
        intersection.distanceM > POINT_WALL_TRACKING_CONFIG.maxDistanceM ||
        !isPointInsideDetectedPlane(intersection.position, matrix, plane.polygon)
      ) {
        return;
      }

      detectedWallPlaneCount += 1;
      hits.push({
        matrix: null,
        position: intersection.position,
        rawPosition: intersection.position,
        normal: uprightNormal,
        rawNormal: normal,
        normalSource: "detected-plane",
        quaternion: makeSurfaceQuaternionFromNormal(uprightNormal),
        classification: "vertical",
        timestampMs: timestamp,
        hitResult: null,
        source: "detected-plane",
        priority: -2,
        resultIndex: 0,
        trackableType: "detected-plane",
        distanceM: intersection.distanceM,
      });
    } catch {
      // Plane detection remains optional; regular hit-test continues.
    }
  });
  return hits.sort((a, b) => a.distanceM - b.distanceM);
}

function isPointInsideDetectedPlane(worldPoint, planeMatrixElements, polygon) {
  if (!polygon || polygon.length < 3) return true;
  const inverse = new THREE.Matrix4().fromArray(planeMatrixElements).invert();
  const localPoint = new THREE.Vector3().fromArray(worldPoint).applyMatrix4(inverse);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = ((zi > localPoint.z) !== (zj > localPoint.z)) &&
      (localPoint.x < (xj - xi) * (localPoint.z - zi) / ((zj - zi) || 1e-8) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getCurrentViewerPose(xrFrame, refSpace) {
  if (typeof xrFrame?.getViewerPose !== "function") return null;
  try {
    return xrFrame.getViewerPose(refSpace);
  } catch {
    return null;
  }
}

function getCameraWorldPositionArray() {
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);
  return cameraPosition.toArray();
}

function getCurrentCameraMatrix() {
  if (currentViewerMatrix?.length >= 16) return currentViewerMatrix;
  camera.updateMatrixWorld(true);
  return camera.matrixWorld.elements;
}

function hasFreshViewerPose(timestamp = performance.now()) {
  return Boolean(
    currentViewerMatrix?.length >= 16 &&
    currentViewerPoseTimestamp !== null &&
    timestamp - currentViewerPoseTimestamp <= SURFACE_TRACKING_CONFIG.maximumViewerPoseAgeMs
  );
}

function pickBestWallHit(hits) {
  const verticalHits = hits
    .filter((hit) => hit.classification === "vertical")
    .sort((a, b) => (a.priority - b.priority) || (a.distanceM - b.distanceM));

  // Jangan berpindah-pindah antara ray tengah, detected-plane, dan fallback
  // pada setiap frame. Pergantian sumber membuat stable streak terus reset.
  if (lastNativeHit?.source) {
    const sameSourceHits = verticalHits
      .filter((hit) => hit.source === lastNativeHit.source)
      .sort((a, b) => {
        const distanceA = Math.hypot(
          a.position[0] - lastNativeHit.position[0],
          a.position[1] - lastNativeHit.position[1],
          a.position[2] - lastNativeHit.position[2],
        );
        const distanceB = Math.hypot(
          b.position[0] - lastNativeHit.position[0],
          b.position[1] - lastNativeHit.position[1],
          b.position[2] - lastNativeHit.position[2],
        );
        return distanceA - distanceB;
      });
    if (sameSourceHits.length > 0) return sameSourceHits[0];
  }

  return verticalHits[0] || null;
}

function updateReticleFromTracker(timestamp) {
  if (!reticle) return;

  const status = lastSurfaceStatus || surfaceTracker.getStatus(timestamp);
  // Tombol boleh menerima klik segera setelah dinding stabil. Jika GLB besar
  // belum siap, klik akan diantrikan dan dijalankan otomatis setelah model
  // asli atau model cadangan tersedia.
  const canPlace = surfaceTracker.canPlace(timestamp) && !manualMode;

  if (manualMode || isFramePlaced) {
    reticle.visible = false;
    updatePlaceButtonState();
    return;
  }

  if (status.state === SURFACE_STATES.CANDIDATE || status.state === SURFACE_STATES.STABLE || status.state === SURFACE_STATES.LOST) {
    const hit = status.smoothedHit;
    if (hit?.matrix) {
      const p = new THREE.Vector3().fromArray(hit.position);
      const q = new THREE.Quaternion().fromArray(hit.quaternion);
      const s = new THREE.Vector3(1, 1, 1);
      reticle.matrix.compose(p, q, s);
      reticle.matrixWorldNeedsUpdate = true;
      reticle.visible = true;
      setReticleVisualState(status.state);
    }
  } else {
    reticle.visible = false;
  }

  updatePlaceButtonState(canPlace);
}

function setReticleVisualState(state) {
  const key = state === SURFACE_STATES.STABLE
    ? "stable"
    : state === SURFACE_STATES.LOST
      ? "lost"
      : "candidate";
  const colors = RETICLE_COLORS[key];
  reticleRingMaterial.color.setHex(colors.ring);
  reticleRingMaterial.opacity = colors.opacity;
  reticleDotMaterial.color.setHex(colors.dot);
  reticleDotMaterial.opacity = Math.min(1, colors.opacity + 0.1);
}

function placeFrame() {
  const now = performance.now();
  const stableHit = surfaceTracker.getStableHit(now);
  const placementHit = selectPlacementHit({
    stableHit,
    timestampMs: now,
    config: SURFACE_TRACKING_CONFIG,
  });

  if (!placementHit || !surfaceTracker.canPlace(now)) {
    setInstruction("Tunggu hingga reticle hijau stabil sebelum menempatkan bingkai.");
    updatePlaceButtonState(false);
    return;
  }

  if (!assetsLoaded) {
    pendingPlacementMode = "native";
    showAssetLoadingInstruction();
    updatePlaceButtonState(false);
    loadAssets();
    return;
  }

  pendingPlacementMode = null;
  placeFrameFromNativeHit(placementHit);
}

function placeFrameFromNativeHit(hit) {
  const frame = createFrameInstance();
  if (!frame) return;

  const transform = applyWallTransform(frame, hit);
  const anchorSurfacePosition = new THREE.Vector3().fromArray(
    hit.rawPosition || hit.position,
  );
  scene.add(frame);

  placedFrame = frame;
  isFramePlaced = true;
  manualMode = false;
  removeManualPreview();
  hideManualControls();
  hideManualFallback();
  updateManualLabel(false);
  updateCenterAim(false);
  hideNativeOffer();
  hideWallTips();
  updateWallHelpVisibility(false);

  frameAnchor = {
    token: ++placementToken,
    type: "native-matrix",
    placementMode: "native",
    position: frame.position.clone(),
    quaternion: frame.quaternion.clone(),
    faceDir: transform.faceDir.clone(),
    wallOffsetM: transform.wallOffsetM,
    anchorModelOffset: frame.position.clone().sub(anchorSurfacePosition),
    rotationOffsetRad: 0,
    hitSource: hit.source,
  };

  tryCreateNativeAnchor(hit, frameAnchor.token);
  setARGuideState("placed-native");
  updatePlaceButtonState(true);
}

function tryCreateNativeAnchor(hit, expectedToken) {
  if (!hit?.hitResult || typeof hit.hitResult.createAnchor !== "function" || !frameAnchor) return;

  hit.hitResult.createAnchor()
    .then((anchor) => {
      if (!anchor) return;
      if (!frameAnchor || frameAnchor.placementMode !== "native" || frameAnchor.token !== expectedToken) {
        deleteXRAnchor(anchor);
        return;
      }
      frameAnchor.type = "xr-anchor";
      frameAnchor.anchor = anchor;
      xrCapabilities.anchors = true;
    })
    .catch(() => {
      if (frameAnchor?.token === expectedToken) xrCapabilities.anchors = false;
    });
}

function createFrameInstance() {
  if (!frameModel) return null;
  const frame = frameModel.clone(true);
  applyMaterials(frame);
  scaleToRealSize(frame);
  return frame;
}

function applyMaterials(frame) {
  frame.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      material.envMapIntensity = 1.0;
      ["map", "emissiveMap"].forEach((key) => {
        if (material[key]) {
          material[key].colorSpace = THREE.SRGBColorSpace;
          material[key].anisotropy = renderer.capabilities.getMaxAnisotropy();
          material[key].needsUpdate = true;
        }
      });
      ["normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach((key) => {
        if (material[key]) {
          material[key].colorSpace = THREE.LinearSRGBColorSpace;
          material[key].needsUpdate = true;
        }
      });
      material.needsUpdate = true;
    });
  });
}

function scaleToRealSize(frame) {
  if (!modelBounds) return;

  const physicalScale = computePhysicalModelScale({
    widthCm: currentFrameData?.width,
    heightCm: currentFrameData?.height,
  }, modelBounds);
  if (!physicalScale) {
    setLastError("Dimensi GLB tidak valid untuk skala fisik.");
    return;
  }

  // DEBUG: log scale values so we can diagnose size mismatch
  if (!scaleToRealSize._logged) {
    scaleToRealSize._logged = true;
    console.warn("[AR SCALE DEBUG]", {
      inputWidthCm: currentFrameData?.width,
      inputHeightCm: currentFrameData?.height,
      modelBoundsX: modelBounds?.x?.toFixed(4),
      modelBoundsY: modelBounds?.y?.toFixed(4),
      modelBoundsZ: modelBounds?.z?.toFixed(4),
      scaleX: physicalScale.x?.toFixed(4),
      scaleY: physicalScale.y?.toFixed(4),
      targetWidthM: physicalScale.widthM?.toFixed(4),
      targetHeightM: physicalScale.heightM?.toFixed(4),
    });
  }

  // Skala non-uniform membuat lis kiri/kanan lebih tipis dari lis atas/bawah.
  // 9-slice menyeragamkan tebal lis di keempat sisi; jika model tidak
  // dikenali sebagai bingkai, otomatis kembali ke skala biasa.
  const scaleMode = applyBorderPreservingFrameScale(frame, physicalScale);
  if (AR_DEBUG_ENABLED) console.info("[AR] scale mode:", scaleMode);
  frame.userData.wallContactOffsetM = computeWallContactOffset(physicalScale.depthM);
  frame.userData.physicalDepthM = physicalScale.depthM;
}

function getFrameWallOffset(frame) {
  const offsetM = Number(frame?.userData?.wallContactOffsetM);
  return Number.isFinite(offsetM) && offsetM >= 0
    ? offsetM
    : computeWallContactOffset(0);
}

function applyWallTransform(frame, hit, rotationRad = 0) {
  const hitPosition = new THREE.Vector3().fromArray(hit.position);
  const viewerPosition = currentViewerMatrix
    ? new THREE.Vector3().fromArray(getPositionFromMatrixElements(currentViewerMatrix))
    : new THREE.Vector3().fromArray(getCameraWorldPositionArray());
  const totalRotationRad = rotationRad;
  const yawRad = (manualControls.yawDeg || 0) * Math.PI / 180;

  const orientedNormal = orientNormalTowardPoint(hit.normal, hit.position, viewerPosition.toArray());
  const faceDir = orientedNormal
    ? new THREE.Vector3().fromArray(orientedNormal)
    : new THREE.Vector3().subVectors(viewerPosition, hitPosition);

  // Luruskan arah hadap ke bidang horizontal agar bingkai selalu tegak
  // (plumb) seperti lukisan sungguhan — komponen vertikal dari normal yang
  // miring atau dari arah fallback kamera tidak boleh memiringkan bingkai.
  faceDir.y = 0;
  if (faceDir.lengthSq() < 0.0025) faceDir.set(0, 0, 1);
  faceDir.normalize();

  const wallOffsetM = getFrameWallOffset(frame);
  frame.position.copy(hitPosition).addScaledVector(faceDir, wallOffsetM);
  const quaternion = makeWallFacingQuaternion(faceDir.toArray(), totalRotationRad);
  frame.quaternion.fromArray(quaternion);

  return { faceDir, wallOffsetM };
}

function updatePlacedAnchorFromXRFrame(xrFrame, refSpace) {
  if (!isFramePlaced || !placedFrame || !frameAnchor) return;

  if (frameAnchor.type === "xr-anchor" && frameAnchor.anchor?.anchorSpace && typeof xrFrame.getPose === "function") {
    try {
      const pose = xrFrame.getPose(frameAnchor.anchor.anchorSpace, refSpace);
      if (pose) {
        const anchorMatrix = Array.from(pose.transform.matrix);
        const anchorPos = getPositionFromMatrixElements(anchorMatrix);
        const anchorModelOffset = frameAnchor.anchorModelOffset?.clone?.() ||
          frameAnchor.position.clone().sub(new THREE.Vector3().fromArray(anchorPos));
        placedFrame.position.fromArray(anchorPos).add(anchorModelOffset);
        placedFrame.quaternion.copy(frameAnchor.quaternion);
        frameAnchor.anchorModelOffset = anchorModelOffset;
        frameAnchor.position.copy(placedFrame.position);
      }
    } catch {
      // Keep the matrix transform if an anchor pose is temporarily unavailable.
    }
  } else {
    placedFrame.position.copy(frameAnchor.position);
    placedFrame.quaternion.copy(frameAnchor.quaternion);
  }
}

function rotateFrame(angleRad) {
  if (!placedFrame || !frameAnchor) return;

  const yawRad = angleRad;

  const axis = frameAnchor.faceDir?.clone?.() || new THREE.Vector3(0, 0, 1).applyQuaternion(placedFrame.quaternion).normalize();
  const rotQ = new THREE.Quaternion().setFromAxisAngle(axis, yawRad);
  placedFrame.quaternion.premultiply(rotQ);

  frameAnchor.quaternion.copy(placedFrame.quaternion);
  frameAnchor.rotationOffsetRad = (frameAnchor.rotationOffsetRad || 0) + angleRad;
}

function removeFrame() {
  pendingPlacementMode = null;
  clearPlacedFrame();
  surfaceTracker.reset();
  lastNativeHit = null;
  pointWallSamples = [];
  lastPointWallFit = null;
  scanStartMs = performance.now();
  manualFallbackDismissed = false;
  hideNativeOffer();
  updateWallHelpVisibility(true);
  updateManualLabel(false);
  setARGuideState("scanning");
  updatePlaceButtonState(false);
}

function clearPlacedFrame() {
  placementToken += 1;
  if (frameAnchor?.anchor) {
    deleteXRAnchor(frameAnchor.anchor);
  }
  if (placedFrame) {
    scene.remove(placedFrame);
    placedFrame = null;
  }
  isFramePlaced = false;
  frameAnchor = null;
}

function resetPlacement() {
  removeFrame();
  stopManualPlacement();
  if (reticle) reticle.visible = false;
  hideManualFallback();
  hideWallTips();
}

function takeScreenshot() {
  if (!renderer) return;
  try {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.92);
    const link = document.createElement("a");
    link.download = `citraframe-ar-${Date.now()}.jpg`;
    link.href = dataUrl;
    link.click();
    setInstruction("Foto AR tersimpan.");
    setTimeout(() => {
      setInstruction(isFramePlaced ? "Bingkai terpasang." : "Mendeteksi dinding. Gerakkan ponsel perlahan ke kiri dan kanan.");
    }, 1800);
  } catch (error) {
    setLastError(error?.message || "Screenshot AR gagal dibuat.");
    setInstruction("Foto AR tidak dapat dibuat pada browser ini.");
  }
}

function startManualPlacement() {
  if (!assetsLoaded) {
    pendingPlacementMode = "manual";
    showAssetLoadingInstruction();
    loadAssets();
    return;
  }
  pendingPlacementMode = null;
  if (manualMode && !isFramePlaced) return;
  if (isFramePlaced) {
    clearPlacedFrame();
    hideNativeOffer();
  }
  const now = performance.now();
  manualControls.distanceM = resolveManualDistance({
    selectedDistanceM: manualControls.distanceM,
    depthDistanceM: depthState.estimatedDistanceM,
    depthAgeMs: depthState.lastDepthAtMs === null ? Number.POSITIVE_INFINITY : now - depthState.lastDepthAtMs,
  });
  setRangeValue("manual-distance", manualControls.distanceM);
  updateManualControlLabels();
  manualMode = true;
  manualFallbackDismissed = true;
  hideManualFallback();
  hideWallTips();
  updateWallHelpVisibility(false);
  setARGuideState("manual");
  showManualControls();
  updateManualLabel(true);
  updateCenterAim(true);
  updatePlaceButtonState(false);
  updateManualPreview();
}

function stopManualPlacement() {
  manualMode = false;
  removeManualPreview();
  hideManualControls();
  updateCenterAim(false);
  if (!frameAnchor || frameAnchor.placementMode !== "manual") {
    updateManualLabel(false);
  }
}

function retryNativeScan() {
  pendingPlacementMode = null;
  stopManualPlacement();
  manualFallbackDismissed = false;
  scanStartMs = performance.now();
  surfaceTracker.reset();
  pointWallSamples = [];
  lastPointWallFit = null;
  hideManualFallback();
  hideNativeOffer();
  updateWallHelpVisibility(true);
  setARGuideState("scanning");
  setInstruction("Mendeteksi dinding. Gerakkan ponsel perlahan ke kiri dan kanan.");
}

function resetManualControls() {
  manualControls = {
    tiltDeg: 0,
    distanceM: 2,
    heightOffsetM: 0,
    yawDeg: 0,
  };
  setRangeValue("manual-tilt", manualControls.tiltDeg);
  setRangeValue("manual-distance", manualControls.distanceM);
  setRangeValue("manual-height", manualControls.heightOffsetM);
  setRangeValue("manual-yaw", manualControls.yawDeg);
  updateManualControlLabels();
  updateManualPreview();
}

function setRangeValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value;
}

function updateManualControlLabels() {
  const values = {
    "manual-tilt-value": `${(manualControls.tiltDeg ?? 0).toFixed(0)} deg`,
    "manual-distance-value": `${manualControls.distanceM.toFixed(2)} m`,
    "manual-height-value": `${manualControls.heightOffsetM.toFixed(2)} m`,
    "manual-yaw-value": `${manualControls.yawDeg.toFixed(0)} deg`,
  };
  Object.entries(values).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function updateManualPreview() {
  if (!manualMode || isFramePlaced || !assetsLoaded || !camera || !hasFreshViewerPose()) return;

  if (!manualPreviewFrame) {
    manualPreviewFrame = createFrameInstance();
    if (!manualPreviewFrame) return;
    // makePreviewTransparent(manualPreviewFrame); // Removed for testing
    scene.add(manualPreviewFrame);
  }

  const placement = createManualPlacement(getCurrentCameraMatrix(), manualControls);
  
  if (manualPreviewFrame) {
    scaleToRealSize(manualPreviewFrame);
    // Terapkan kemiringan (tilt) pada sumbu X lokal bingkai (pitch)
    const tiltRad = THREE.MathUtils.degToRad(manualControls.tiltDeg ?? 0);
    manualPreviewFrame.rotation.x = tiltRad;
  }

  applyManualTransform(manualPreviewFrame, placement);
  updateManualDistanceLabel(placement.distanceM);
}

function makePreviewTransparent(frame) {
  frame.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = materials.map((material) => {
      const mat = material.clone();
      mat.transparent = true;
      mat.opacity = 0.68;
      mat.depthWrite = false;
      return mat;
    });
    child.material = Array.isArray(child.material) ? cloned : cloned[0];
  });
}

function applyManualTransform(frame, placement) {
  const position = new THREE.Vector3().fromArray(placement.position);
  const normal = new THREE.Vector3().fromArray(placement.normalToCamera).normalize();
  frame.position.copy(position).addScaledVector(normal, getFrameWallOffset(frame));
  frame.quaternion.fromArray(placement.quaternion);
}

function removeManualPreview() {
  if (manualPreviewFrame) {
    scene.remove(manualPreviewFrame);
    manualPreviewFrame = null;
  }
}

function confirmManualFrame() {
  if (!manualMode || !assetsLoaded) return;
  if (!hasFreshViewerPose()) {
    setInstruction("Tracking kamera belum stabil. Gerakkan ponsel perlahan lalu konfirmasi kembali.");
    return;
  }

  const result = confirmManualPlacement(getCurrentCameraMatrix(), manualControls);
  if (!result.confirmed) return;

  removeManualPreview();
  const frame = createFrameInstance();
  if (!frame) return;
  applyManualTransform(frame, result.placement);
  scene.add(frame);

  placedFrame = frame;
  isFramePlaced = true;
  manualMode = false;
  hideManualControls();
  updateCenterAim(false);
  hideWallTips();
  updateWallHelpVisibility(false);
  updateManualLabel(true);

  frameAnchor = {
    token: ++placementToken,
    type: "manual",
    placementMode: "manual",
    position: frame.position.clone(),
    quaternion: frame.quaternion.clone(),
    faceDir: new THREE.Vector3().fromArray(result.placement.normalToCamera).normalize(),
    wallOffsetM: getFrameWallOffset(frame),
    distanceM: result.placement.distanceM,
    rotationOffsetRad: result.placement.rotationDeg * Math.PI / 180,
  };

  setARGuideState("placed-manual");
  updatePlaceButtonState(true);
}

function useNativePlacement() {
  const now = performance.now();
  const hit = surfaceTracker.getStableHit(now);
  if (!hit) {
    hideNativeOffer();
    return;
  }

  clearPlacedFrame();

  stopManualPlacement();
  if (!assetsLoaded) {
    pendingPlacementMode = "native";
    showAssetLoadingInstruction();
    loadAssets();
    return;
  }
  placeFrameFromNativeHit(hit);
}

function updateNativeOffer(timestamp) {
  const stable = surfaceTracker.canPlace(timestamp);
  const offer = shouldOfferNativePlacement({
    manualMode,
    placementMode: frameAnchor?.placementMode,
    nativeStable: stable,
  });

  if (offer) showNativeOffer();
  else hideNativeOffer();
}

function updateDepthState(xrFrame, viewerPose, timestamp) {
  depthState.lastFrameHadDepth = false;
  if (!viewerPose || typeof xrFrame.getDepthInformation !== "function") return;

  try {
    for (const view of viewerPose?.views || []) {
      const depthInfo = xrFrame.getDepthInformation(view);
      if (!depthInfo) continue;
      depthState.supported = true;
      depthState.lastFrameHadDepth = true;
      depthState.lastDepthAtMs = timestamp;
      xrCapabilities.depthSensing = true;

      if (typeof depthInfo.getDepthInMeters === "function") {
        try {
          const centerDepth = depthInfo.getDepthInMeters(0.5, 0.5);
          if (Number.isFinite(centerDepth) && centerDepth > 0) {
            depthState.estimatedDistanceM = centerDepth;
          }
        } catch {
          depthState.estimatedDistanceM = null;
        }
      }
      break;
    }
  } catch {
    depthState.lastFrameHadDepth = false;
  }
}

function updateARInstruction(timestamp) {
  if (isFramePlaced) return;
  if (manualMode) {
    setInstruction("Penempatan manual. Arahkan titik tengah kamera ke dinding lalu sesuaikan jarak.");
    return;
  }

  const status = lastSurfaceStatus || surfaceTracker.getStatus(timestamp);
  const elapsed = timestamp - scanStartMs;

  if (!assetsLoaded && (assetLoadState === "loading" || pendingPlacementMode)) {
    if (status.state === SURFACE_STATES.STABLE) {
      hideManualFallback();
      setARGuideState("model-loading");
    }
    showAssetLoadingInstruction();
    return;
  }

  if (status.state === SURFACE_STATES.STABLE) {
    hideManualFallback();
    setARGuideState("stable");
    setInstruction("Bidang dinding stabil. Ketuk Tempel Bingkai.");
    return;
  }

  if (status.state === SURFACE_STATES.CANDIDATE) {
    hideManualFallback();
    setARGuideState("candidate");
    setInstruction("Bidang kandidat ditemukan. Tahan ponsel tetap stabil sebentar.");
    return;
  }

  if (manualFallbackVisible) {
    setARGuideState("fallback");
    setInstruction("Dinding belum terdeteksi. Coba pindai lagi atau gunakan penempatan manual sebagai perkiraan.");
    return;
  }

  if (status.classification === "horizontal") {
    setARGuideState("horizontal");
    setInstruction("Bidang horizontal terdeteksi. Arahkan kamera ke dinding tegak.");
    return;
  }

  if (elapsed > 4500) {
    setARGuideState("plain-wall");
    setInstruction("Dinding polos lebih sulit dipindai. Arahkan kamera ke tepi dinding, pertemuan dinding dengan lantai, atau area yang memiliki bayangan.");
  } else {
    setARGuideState("scanning");
    setInstruction("Mendeteksi dinding. Gerakkan ponsel perlahan ke kiri dan kanan.");
  }

  if (
    !manualFallbackDismissed &&
    shouldShowManualFallback(status, elapsed, SURFACE_TRACKING_CONFIG)
  ) {
    showManualFallback();
    manualFallbackDismissed = true;
  }
}

function updatePlaceButtonState(forceEnabled = null) {
  const btn = document.getElementById("place-btn");
  const rotateControls = document.getElementById("rotate-controls");
  const controls = btn?.closest(".ar-controls");
  if (!btn) return;

  if (isFramePlaced) {
    controls?.classList.add("is-placed");
    btn.disabled = false;
    btn.textContent = "Hapus Bingkai";
    if (rotateControls) rotateControls.hidden = false;
    return;
  }

  btn.textContent = pendingPlacementMode === "native" && !assetsLoaded
    ? `Memuat Model 3D${getAssetProgressLabel()}`
    : "Tempel Bingkai";
  controls?.classList.remove("is-placed");
  if (rotateControls) rotateControls.hidden = true;

  if (manualMode) {
    btn.disabled = true;
    return;
  }

  if (pendingPlacementMode === "native" && !assetsLoaded) {
    btn.disabled = true;
    return;
  }

  const enabled = forceEnabled !== null
    ? forceEnabled
    : surfaceTracker.canPlace(performance.now());
  btn.disabled = !enabled;
}

function setInstruction(text) {
  const el = document.getElementById("ar-instruction");
  if (el) el.textContent = text;
}

function setARGuideState(state) {
  if (_lastGuideState === state) return;
  _lastGuideState = state;

  const guide = document.getElementById("ar-guide-panel");
  if (!guide) return;

  if (state === "placed-native") {
    guide.style.display = "none";
    setInstruction("Bingkai terpasang dengan hasil deteksi dinding.");
    return;
  }
  if (state === "placed-manual") {
    guide.style.display = "none";
    setInstruction("Bingkai ditempatkan manual. Posisi merupakan perkiraan.");
    return;
  }
  if (state === "manual" || state === "fallback") {
    guide.style.display = "none";
    return;
  }

  const states = {
    scanning: {
      marker: "1",
      title: "Pindai dinding",
      detail: "Bergerak menyamping perlahan pada jarak 1-3 meter.",
      tip: "Cari tepi, bayangan, atau detail visual.",
    },
    "plain-wall": {
      marker: "!",
      tone: "warning",
      title: "Dinding polos",
      detail: "Arahkan ke tepi dinding atau pertemuan dengan lantai.",
      tip: "Setelah stabil, arahkan kembali ke posisi bingkai.",
    },
    candidate: {
      marker: "...",
      tone: "warning",
      title: "Bidang mulai terbaca",
      detail: "Tahan gerakan sebentar hingga reticle hijau.",
      tip: "Reticle kuning belum siap ditempatkan.",
    },
    "model-loading": {
      marker: "3D",
      tone: "warning",
      title: "Dinding siap",
      detail: "Model 3D sedang dimuat dan akan segera dapat ditempatkan.",
      tip: "Posisi dinding sudah terkunci; pertahankan arah kamera.",
    },
    stable: {
      marker: "OK",
      tone: "success",
      title: "Dinding stabil",
      detail: "Arahkan reticle ke posisi bingkai, lalu tempel.",
      tip: "Reticle mengikuti hit-test WebXR asli.",
      tipTone: "success",
    },
    horizontal: {
      marker: "!",
      tone: "warning",
      title: "Lantai terdeteksi",
      detail: "Naikkan kamera ke permukaan dinding tegak.",
      tip: "Bidang horizontal tidak digunakan.",
    },
  };
  const content = states[state];
  if (!content) {
    guide.style.display = "none";
    return;
  }

  guide.style.display = "flex";
  guide.innerHTML = `
    <div class="ar-guide-summary">
      <span class="ar-guide-marker ${content.tone || ""}">${content.marker}</span>
      <div class="ar-guide-copy">
        <strong>${content.title}</strong>
        <span>${content.detail}</span>
      </div>
    </div>
    <div class="ar-guide-tip ${content.tipTone || ""}">${content.tip}</div>
  `;
}

function toggleWallTips() {
  const tips = document.getElementById("ar-wall-tips");
  if (!tips) return;
  tips.hidden = !tips.hidden;
}

function hideWallTips() {
  const tips = document.getElementById("ar-wall-tips");
  if (tips) tips.hidden = true;
}

function updateWallHelpVisibility(visible) {
  const button = document.getElementById("ar-wall-help-btn");
  if (button) button.hidden = !visible;
}

function showManualFallback() {
  const panel = document.getElementById("ar-detection-fallback");
  if (panel) panel.hidden = false;
  manualFallbackVisible = true;
  setARGuideState("fallback");
}

function hideManualFallback() {
  const panel = document.getElementById("ar-detection-fallback");
  if (panel) panel.hidden = true;
  manualFallbackVisible = false;
}

function showManualControls() {
  const panel = document.getElementById("ar-manual-panel");
  if (panel) panel.hidden = false;
  const controls = document.querySelector(".ar-controls");
  if (controls) controls.style.display = "none";
  const instruction = document.getElementById("ar-instruction");
  if (instruction) instruction.style.display = "none";
}

function hideManualControls() {
  const panel = document.getElementById("ar-manual-panel");
  if (panel) panel.hidden = true;
  const controls = document.querySelector(".ar-controls");
  if (controls) controls.style.display = "flex";
  const instruction = document.getElementById("ar-instruction");
  if (instruction) instruction.style.display = "";
}

function updateManualLabel(visible) {
  const label = document.getElementById("ar-manual-label");
  if (label) label.hidden = !visible;
}

function updateCenterAim(visible) {
  const aim = document.getElementById("ar-center-aim");
  if (aim) aim.hidden = !visible;
}

function showNativeOffer() {
  const offer = document.getElementById("ar-native-offer");
  if (offer) offer.hidden = false;
}

function hideNativeOffer() {
  const offer = document.getElementById("ar-native-offer");
  if (offer) offer.hidden = true;
}

function updateManualDistanceLabel(distanceM) {
  const label = document.getElementById("manual-estimated-distance");
  if (label) label.textContent = `${distanceM.toFixed(2)} m`;
}

function initDebugPanel() {
  const panel = document.getElementById("ar-debug-panel");
  const showButton = document.getElementById("ar-debug-show");
  if (!panel) return;
  panel.hidden = !AR_DEBUG_ENABLED;
  if (showButton) showButton.hidden = true;
}

function toggleDebugPanel() {
  const panel = document.getElementById("ar-debug-panel");
  const showButton = document.getElementById("ar-debug-show");
  if (!panel || !AR_DEBUG_ENABLED) return;
  panel.hidden = !panel.hidden;
  if (showButton) showButton.hidden = !panel.hidden;
}

let lastDebugUpdateMs = 0;
function updateDebugPanel(timestamp) {
  if (!AR_DEBUG_ENABLED || timestamp - lastDebugUpdateMs < 250) return;
  lastDebugUpdateMs = timestamp;

  const panel = document.getElementById("ar-debug-panel");
  const body = document.getElementById("ar-debug-body");
  if (!panel || !body || panel.hidden) return;

  const status = lastSurfaceStatus || surfaceTracker.getStatus(timestamp);
  const normal = status.smoothedHit?.normal || lastNativeHit?.normal || null;
  const normalSource = status.smoothedHit?.normalSource || lastNativeHit?.normalSource || "-";
  const fps = lastFrameDeltaMs > 0 ? Math.round(1000 / Math.max(1, lastFrameDeltaMs)) : 0;
  const placementMode = frameAnchor?.placementMode || (manualMode ? "manual-preview" : "none");
  const wallOffsetM = frameAnchor?.wallOffsetM ?? manualPreviewFrame?.userData?.wallContactOffsetM;
  const firstHitMs = status.firstHitTimeMs === null ? "-" : `${Math.round(status.firstHitTimeMs - sessionStartMs)} ms`;
  const firstStableMs = status.firstStableTimeMs === null ? "-" : `${Math.round(status.firstStableTimeMs - sessionStartMs)} ms`;

  const scaleInfo = (() => {
    if (!modelBounds || !currentFrameData) return "belum ada model";
    const maxBound = Math.max(modelBounds.x, modelBounds.y);
    const unitFactor = maxBound > 1000 ? 1000 : maxBound > 10 ? 100 : 1;
    const corrected = { x: modelBounds.x / unitFactor, y: modelBounds.y / unitFactor };
    const physicalScale = computePhysicalModelScale({
      widthCm: currentFrameData?.width,
      heightCm: currentFrameData?.height,
    }, modelBounds);
    if (!physicalScale) return "gagal hitung skala";
    return `input=${currentFrameData.width}x${currentFrameData.height}cm | rawBounds=${modelBounds.x?.toFixed(2)}x${modelBounds.y?.toFixed(2)} | unitFactor=${unitFactor} | correctedBounds=${corrected.x?.toFixed(3)}x${corrected.y?.toFixed(3)}m | target=${physicalScale.widthM?.toFixed(3)}x${physicalScale.heightM?.toFixed(3)}m | scale=${physicalScale.x?.toFixed(3)}x${physicalScale.y?.toFixed(3)}`;
  })();

  body.innerHTML = `
    <div style="color:#0ff;font-weight:bold">── SCALE DEBUG ──</div>
    <div>${scaleInfo}</div>
    <div style="color:#0ff;font-weight:bold">── AR STATE ──</div>
    <div>immersive-ar: ${xrCapabilities.immersiveAr}</div>
    <div>hit-test source: ${xrCapabilities.hitTest}</div>
    <div>transient hit-test: ${xrCapabilities.transientHitTest}</div>
    <div>anchors used: ${xrCapabilities.anchors}</div>
    <div>plane detection observed: ${xrCapabilities.planeDetection}</div>
    <div>depth supported: ${xrCapabilities.depthSensing}</div>
    <div>dom overlay: ${xrCapabilities.domOverlay}</div>
    <div>light estimation: ${xrCapabilities.lightEstimation}</div>
    <div>viewer tracking: ${viewerTrackingAvailable}</div>
    <div>hit count/frame: ${lastHitCount}</div>
    <div>stable streak: ${status.stableStreak}/${status.requiredStableFrameCount}</div>
    <div>classification: ${status.classification}</div>
    <div>normal: ${normal ? normal.map((n) => n.toFixed(2)).join(", ") : "-"}</div>
    <div>normal source: ${normalSource}</div>
    <div>hit source: ${lastNativeHit?.source || "-"} #${lastNativeHit?.resultIndex ?? "-"}</div>
    <div>trackable: ${lastNativeHit?.trackableType || "-"}</div>
    <div>point samples: ${pointWallSamples.length}</div>
    <div>detected wall planes: ${detectedWallPlaneCount}</div>
    <div>reticle: ${status.state}</div>
    <div>first hit: ${firstHitMs}</div>
    <div>first stable: ${firstStableMs}</div>
    <div>placement: ${placementMode}</div>
    <div>wall contact offset: ${Number.isFinite(wallOffsetM) ? wallOffsetM.toFixed(3) + " m" : "-"}</div>
    <div>manual distance: ${manualControls.distanceM.toFixed(2)} m</div>
    <div>depth estimate: ${depthState.estimatedDistanceM ? depthState.estimatedDistanceM.toFixed(2) + " m" : "-"}</div>
    <div>FPS: ${fps}</div>
    <div>last error: ${lastError || "-"}</div>
  `;
}

function setLastError(message) {
  const nextError = message || "";
  if (nextError === lastError) return;
  lastError = nextError;
  if (AR_DEBUG_ENABLED && lastError) console.warn("[AR]", lastError);
}

function updateInfoUI(frameData) {
  const img = document.getElementById("arPreviewImg");
  const name = document.getElementById("arFrameName");
  const size = document.getElementById("arFrameSize");
  if (img && frameData?.textureUrl) img.src = frameData.textureUrl;
  if (name) name.textContent = frameData?.name || "Custom Frame";
  if (size) size.textContent = `${frameData?.width || 40} x ${frameData?.height || 60} cm`;

  const supMsg = document.getElementById("ar-supported-msg");
  const unsMsg = document.getElementById("ar-unsupported-msg");
  getXRSupport().then((support) => {
    immersiveARSupported = support.immersiveAr;
    if (supMsg) supMsg.style.display = support.immersiveAr ? "block" : "none";
    if (unsMsg) unsMsg.style.display = support.immersiveAr ? "none" : "block";
  });
}

window.__CitraFrameAR = {
  buildXRSessionInit,
  getCapabilities: () => ({ ...xrCapabilities }),
  getSurfaceStatus: () => surfaceTracker.getStatus(performance.now()),
};

window.dispatchEvent(new CustomEvent("citraframe:ar-loader-ready"));
