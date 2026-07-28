/**
 * CITRA ARTFRAME - Penempatan manual non-WebXR.
 *
 * Kamera browser hanya menjadi latar. Model GLB tetap dirender dengan Three.js,
 * diproyeksikan dari ukuran fisik + jarak perkiraan, lalu dapat diposisikan,
 * diputar dan dikalibrasi secara manual. Mode ini sengaja tidak mengklaim
 * surface detection atau world tracking.
 */

import {
  MANUAL_PLACEMENT_CONFIG,
  clamp,
  computePhysicalModelScale,
  distanceFromPinch,
  projectPhysicalFrameToPixels,
  resolveModelAxisNormalization,
} from "./ar-surface-utils.mjs?v=20260726-border-slice-1";

const DEFAULT_MODEL_URL = "/assets/3d/frame.glb";
const MANUAL_CAMERA_FOV_DEG = 55;

function resolveFrameModelUrl(candidate) {
	try {
		const url = new URL(String(candidate || DEFAULT_MODEL_URL), window.location.origin);
		const allowedPath = url.pathname.startsWith("/uploads/models/") || url.pathname.startsWith("/assets/3d/");
		const allowedExtension = /\.(?:glb|gltf)$/i.test(url.pathname);
		return url.origin === window.location.origin && allowedPath && allowedExtension
			? `${url.pathname}${url.search}`
			: DEFAULT_MODEL_URL;
	} catch {
		return DEFAULT_MODEL_URL;
	}
}

function normalizeFrameData(frameData = {}) {
  const width = Number(frameData.width);
  const height = Number(frameData.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 40,
    height: Number.isFinite(height) && height > 0 ? height : 60,
    name: String(frameData.name || "Custom Frame"),
    textureUrl: String(frameData.textureUrl || ""),
	modelUrl: resolveFrameModelUrl(frameData.modelUrl),
    modelFrontRotationY: Number(frameData.modelFrontRotationY) === 180 ? 180 : 0,
  };
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

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

class ARWallVisualizer {
  constructor() {
    this.stream = null;
    this.isActive = false;
    this.isPlaced = false;
    this.isDragging = false;
    this.frameData = normalizeFrameData();
    this.modelUrl = DEFAULT_MODEL_URL;

    this.frameX = 0;
    this.frameY = 0;
    this.frameWidth = 200;
    this.frameHeight = 300;
    this.manualDistanceM = MANUAL_PLACEMENT_CONFIG.defaultDistanceM;
    this.displayScale = 1;
    this.yawDeg = 0;
    this.rollDeg = 0;

    this.activePointers = new Map();
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.pinchStartDistancePx = 0;
    this.pinchStartManualDistanceM = this.manualDistanceM;

    this._threeRenderer = null;
    this._threeScene = null;
    this._threeCamera = null;
    this._threeModel = null;
    this._modelBounds = null;
    this._loadedModelUrl = "";
    this._loadedModelFrontRotationY = 0;
    this._modelBaseRotationYRad = 0;
    this._resizeTimer = null;
    this._openToken = 0;

    this.buildUI();
    this.bindEvents();
  }

  buildUI() {
    this.flashEl = document.createElement("div");
    this.flashEl.className = "ar-flash";
    document.body.appendChild(this.flashEl);

    this.simulatorEl = document.createElement("section");
    this.simulatorEl.className = "ar-wall-simulator";
    this.simulatorEl.id = "ar-wall-simulator";
    this.simulatorEl.setAttribute("aria-label", "Penempatan manual bingkai pada dinding");
    this.simulatorEl.innerHTML = `
      <video id="ar-camera-feed" playsinline autoplay muted></video>
      <div class="manual-camera-shade" aria-hidden="true"></div>

      <div class="manual-camera-topbar">
        <button class="ar-close-btn" id="manual-camera-close" type="button" aria-label="Kembali ke pilihan mode">×</button>
        <div class="manual-camera-heading">
          <strong>Tempatkan Manual</strong>
          <span>Non-WebXR · posisi merupakan perkiraan</span>
        </div>
        <div class="manual-camera-size" id="manual-camera-physical-size">40 × 60 cm</div>
      </div>

      <div id="manual-camera-aim" class="manual-camera-aim" aria-hidden="true">
        <span></span>
      </div>

      <div id="ar-frame-canvas-wrapper" hidden>
        <div id="ar-draggable-frame" role="img" aria-label="Model 3D bingkai yang dapat digeser">
          <canvas id="ar-frame-canvas" width="480" height="720" draggable="false"></canvas>
          <div id="ar-frame-loading" class="manual-frame-loading">
            <span class="manual-loading-spinner"></span>
            Memuat model 3D...
          </div>
          <span class="manual-frame-corner top-left" aria-hidden="true"></span>
          <span class="manual-frame-corner top-right" aria-hidden="true"></span>
          <span class="manual-frame-corner bottom-left" aria-hidden="true"></span>
          <span class="manual-frame-corner bottom-right" aria-hidden="true"></span>
        </div>
      </div>

      <div id="manual-camera-message" class="manual-camera-message" role="status">
        Arahkan kamera ke dinding, lalu tekan Tempatkan Manual.
      </div>

      <div class="manual-camera-bottom" id="manual-camera-bottom">
        <div id="manual-camera-start-state" class="manual-camera-start-state">
          <p>Model 3D akan muncul di tengah layar. Setelah itu, geser ke posisi dinding dan atur jaraknya.</p>
          <button id="manual-camera-start" class="manual-primary-btn" type="button">Tempatkan Manual</button>
        </div>

        <div id="manual-camera-editor" class="manual-camera-editor" hidden>
          <div class="manual-editor-summary">
            <div>
              <span>Ukuran produk</span>
              <strong id="manual-camera-size-value">40 × 60 cm</strong>
            </div>
            <div>
              <span>Jarak perkiraan</span>
              <strong id="manual-camera-distance-value">2.00 m</strong>
            </div>
          </div>

          <div class="manual-control-grid">
            <label class="manual-control-row" for="manual-camera-distance">
              <span>Jarak</span>
              <input id="manual-camera-distance" type="range" min="0.5" max="5" step="0.05" value="2" />
              <output id="manual-camera-distance-output">2.00 m</output>
            </label>
            <label class="manual-control-row" for="manual-camera-yaw">
              <span>Sudut dinding</span>
              <input id="manual-camera-yaw" type="range" min="-45" max="45" step="1" value="0" />
              <output id="manual-camera-yaw-output">0°</output>
            </label>
            <label class="manual-control-row" for="manual-camera-roll">
              <span>Kemiringan</span>
              <input id="manual-camera-roll" type="range" min="-15" max="15" step="1" value="0" />
              <output id="manual-camera-roll-output">0°</output>
            </label>
            <label class="manual-control-row" for="manual-camera-scale">
              <span>Koreksi skala</span>
              <input id="manual-camera-scale" type="range" min="0.75" max="1.25" step="0.01" value="1" />
              <output id="manual-camera-scale-output">100%</output>
            </label>
          </div>

          <p id="manual-camera-scale-note" class="manual-camera-note">
            Geser model untuk memindahkan. Cubit dengan dua jari untuk mengatur jarak.
          </p>

          <div class="manual-camera-actions">
            <button id="manual-camera-reset" class="manual-secondary-btn" type="button">Reset</button>
            <button id="manual-camera-confirm" class="manual-primary-btn" type="button">Selesai Atur</button>
          </div>
        </div>

        <div id="manual-camera-placed-state" class="manual-camera-placed-state" hidden>
          <div>
            <strong>Frame ditempatkan manual</strong>
            <span>Posisi tidak terkunci pada dunia nyata.</span>
          </div>
          <div class="manual-camera-actions">
            <button id="manual-camera-edit" class="manual-secondary-btn" type="button">Atur Ulang</button>
            <button id="manual-camera-capture" class="manual-primary-btn" type="button">Ambil Foto</button>
          </div>
        </div>
      </div>

      <div class="ar-no-camera" id="ar-no-camera" hidden>
        <div class="manual-no-camera-icon" aria-hidden="true">×</div>
        <h3>Kamera Tidak Tersedia</h3>
        <p>Izinkan akses kamera untuk melihat dinding, atau gunakan dinding virtual untuk mencoba penempatan manual.</p>
        <button class="manual-primary-btn" id="ar-use-mock-wall" type="button">Gunakan Dinding Virtual</button>
      </div>
    `;
    document.body.appendChild(this.simulatorEl);

    this.video = this.simulatorEl.querySelector("#ar-camera-feed");
    this.frameCanvasWrapper = this.simulatorEl.querySelector("#ar-frame-canvas-wrapper");
    this.frameWrapper = this.simulatorEl.querySelector("#ar-draggable-frame");
    this.frameCanvas = this.simulatorEl.querySelector("#ar-frame-canvas");
    this.frameLoadingEl = this.simulatorEl.querySelector("#ar-frame-loading");
    this.messageEl = this.simulatorEl.querySelector("#manual-camera-message");
    this.aimEl = this.simulatorEl.querySelector("#manual-camera-aim");
    this.bottomEl = this.simulatorEl.querySelector("#manual-camera-bottom");
    this.startStateEl = this.simulatorEl.querySelector("#manual-camera-start-state");
    this.editorEl = this.simulatorEl.querySelector("#manual-camera-editor");
    this.placedStateEl = this.simulatorEl.querySelector("#manual-camera-placed-state");
    this.noCameraEl = this.simulatorEl.querySelector("#ar-no-camera");
    this.distanceInput = this.simulatorEl.querySelector("#manual-camera-distance");
    this.yawInput = this.simulatorEl.querySelector("#manual-camera-yaw");
    this.rollInput = this.simulatorEl.querySelector("#manual-camera-roll");
    this.scaleInput = this.simulatorEl.querySelector("#manual-camera-scale");
  }

  bindEvents() {
    this.simulatorEl.querySelector("#manual-camera-close").addEventListener("click", () => this.close());
    this.simulatorEl.querySelector("#manual-camera-start").addEventListener("click", () => this.startManualPlacement());
    this.simulatorEl.querySelector("#manual-camera-reset").addEventListener("click", () => this.resetManualPlacement());
    this.simulatorEl.querySelector("#manual-camera-confirm").addEventListener("click", () => this.confirmManualPlacement());
    this.simulatorEl.querySelector("#manual-camera-edit").addEventListener("click", () => this.editManualPlacement());
    this.simulatorEl.querySelector("#manual-camera-capture").addEventListener("click", () => this.captureScreenshot());
    this.simulatorEl.querySelector("#ar-use-mock-wall").addEventListener("click", () => this.useMockWall());

    this.distanceInput.addEventListener("input", () => {
      this.manualDistanceM = clamp(
        this.distanceInput.value,
        MANUAL_PLACEMENT_CONFIG.minDistanceM,
        MANUAL_PLACEMENT_CONFIG.maxDistanceM,
      );
      this.updateProjectedFrameSize({ preserveCenter: true });
      this.updateControlLabels();
    });
    this.yawInput.addEventListener("input", () => {
      this.yawDeg = clamp(this.yawInput.value, -45, 45);
      this.updateControlLabels();
      this.renderModel();
    });
    this.rollInput.addEventListener("input", () => {
      this.rollDeg = clamp(this.rollInput.value, -15, 15);
      this.updateControlLabels();
      this.renderModel();
    });
    this.scaleInput.addEventListener("input", () => {
      this.displayScale = clamp(this.scaleInput.value, 0.75, 1.25);
      this.updateProjectedFrameSize({ preserveCenter: true });
      this.updateControlLabels();
    });

    this.frameWrapper.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.frameWrapper.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.frameWrapper.addEventListener("pointerup", (event) => this.onPointerEnd(event));
    this.frameWrapper.addEventListener("pointercancel", (event) => this.onPointerEnd(event));
    this.frameWrapper.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });

    window.addEventListener("resize", () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (!this.isActive) return;
        this.updateProjectedFrameSize({ preserveCenter: true });
      }, 80);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isActive) this.close();
    });
  }

  async open(options = {}) {
    const openToken = ++this._openToken;
    this.stopCamera();
    const legacyFrameData = Array.isArray(options) ? {} : options.frameData || options;
    this.frameData = normalizeFrameData(legacyFrameData);
	this.modelUrl = resolveFrameModelUrl(options.modelUrl || this.frameData.modelUrl);
    this.manualDistanceM = MANUAL_PLACEMENT_CONFIG.defaultDistanceM;
    this.displayScale = 1;
    this.yawDeg = 0;
    this.rollDeg = 0;
    this.distanceInput.value = String(this.manualDistanceM);
    this.yawInput.value = "0";
    this.rollInput.value = "0";
    this.scaleInput.value = "1";
    this.isActive = true;
    this.isPlaced = false;
    this.simulatorEl.classList.add("active");
    this.simulatorEl.classList.remove("manual-is-placed", "manual-is-editing", "manual-uses-mock-wall");
    document.body.style.overflow = "hidden";

    this.applyFrameDataToUI();
    this.updateControlLabels();
    this.showStartState();
    this.frameCanvasWrapper.hidden = true;
    this.aimEl.hidden = false;
    this.noCameraEl.hidden = true;
    this.video.hidden = false;
    this.messageEl.textContent = "Arahkan kamera ke dinding, lalu tekan Tempatkan Manual.";

    const results = await Promise.allSettled([
      this.loadModel(this.modelUrl, this.frameData.modelFrontRotationY),
      this.startCamera(openToken),
    ]);
    const modelResult = results[0];
    if (modelResult.status === "rejected") {
      console.error("[Manual Placement] Model 3D gagal dimuat:", modelResult.reason);
	  if (this.modelUrl !== DEFAULT_MODEL_URL) {
		try {
		  await this.loadModel(DEFAULT_MODEL_URL, 0);
		  this.modelUrl = DEFAULT_MODEL_URL;
          this.frameData.modelFrontRotationY = 0;
		  this.messageEl.textContent = "Model khusus gagal dimuat. Model bawaan siap digunakan.";
		  return;
		} catch (fallbackError) {
		  console.error("[Manual Placement] Model bawaan gagal dimuat:", fallbackError);
		}
	  }
	  this.frameLoadingEl.hidden = true;
	  this.messageEl.textContent = "Model 3D gagal dimuat. Muat ulang halaman lalu coba kembali.";
    }
  }

  close() {
    this._openToken += 1;
    this.stopCamera();
    this.isActive = false;
    this.isPlaced = false;
    this.activePointers.clear();
    this.simulatorEl.classList.remove("active", "manual-is-placed", "manual-is-editing");
    document.body.style.overflow = "";
    const selector = document.getElementById("mode-selector");
    if (selector) selector.style.display = "flex";
  }

  applyFrameDataToUI() {
    const sizeText = `${this.frameData.width} × ${this.frameData.height} cm`;
    this.simulatorEl.querySelector("#manual-camera-physical-size").textContent = sizeText;
    this.simulatorEl.querySelector("#manual-camera-size-value").textContent = sizeText;
    this.frameWrapper.setAttribute(
      "aria-label",
      `Model 3D ${this.frameData.name}, ukuran ${sizeText}, dapat digeser`,
    );
  }

  showStartState() {
    this.startStateEl.hidden = false;
    this.editorEl.hidden = true;
    this.placedStateEl.hidden = true;
  }

  startManualPlacement() {
    if (!this._threeModel) {
      this.messageEl.textContent = "Tunggu model 3D selesai dimuat.";
      return;
    }
    this.isPlaced = false;
    this.startStateEl.hidden = true;
    this.editorEl.hidden = false;
    this.placedStateEl.hidden = true;
    this.frameCanvasWrapper.hidden = false;
    this.aimEl.hidden = true;
    this.simulatorEl.classList.add("manual-is-editing");
    this.simulatorEl.classList.remove("manual-is-placed");
    this.updateProjectedFrameSize({ recenter: true });
    this.updateControlLabels();
    this.renderModel();
    this.messageEl.textContent = "Geser model ke dinding. Atur jarak dan sudut sampai terlihat sesuai.";
  }

  confirmManualPlacement() {
    if (this.frameCanvasWrapper.hidden) return;
    this.isPlaced = true;
    this.editorEl.hidden = true;
    this.placedStateEl.hidden = false;
    this.simulatorEl.classList.remove("manual-is-editing");
    this.simulatorEl.classList.add("manual-is-placed");
    this.messageEl.textContent = "Frame ditempatkan manual. Ambil foto atau atur kembali posisinya.";
  }

  editManualPlacement() {
    this.isPlaced = false;
    this.editorEl.hidden = false;
    this.placedStateEl.hidden = true;
    this.simulatorEl.classList.add("manual-is-editing");
    this.simulatorEl.classList.remove("manual-is-placed");
    this.messageEl.textContent = "Sesuaikan kembali posisi, jarak, dan sudut model 3D.";
    this.updateProjectedFrameSize({ preserveCenter: true });
  }

  resetManualPlacement() {
    this.manualDistanceM = MANUAL_PLACEMENT_CONFIG.defaultDistanceM;
    this.displayScale = 1;
    this.yawDeg = 0;
    this.rollDeg = 0;
    this.distanceInput.value = String(this.manualDistanceM);
    this.yawInput.value = "0";
    this.rollInput.value = "0";
    this.scaleInput.value = "1";
    this.updateProjectedFrameSize({ recenter: true });
    this.updateControlLabels();
    this.renderModel();
    this.messageEl.textContent = "Penempatan direset. Geser model ke posisi dinding yang diinginkan.";
  }

  updateControlLabels() {
    const distanceText = `${this.manualDistanceM.toFixed(2)} m`;
    this.simulatorEl.querySelector("#manual-camera-distance-value").textContent = distanceText;
    this.simulatorEl.querySelector("#manual-camera-distance-output").textContent = distanceText;
    this.simulatorEl.querySelector("#manual-camera-yaw-output").textContent = `${this.yawDeg.toFixed(0)}°`;
    this.simulatorEl.querySelector("#manual-camera-roll-output").textContent = `${this.rollDeg.toFixed(0)}°`;
    this.simulatorEl.querySelector("#manual-camera-scale-output").textContent = `${Math.round(this.displayScale * 100)}%`;
  }

  getStageBounds() {
    const bottomTop = this.bottomEl.getBoundingClientRect().top;
    const top = Math.max(78, this.simulatorEl.getBoundingClientRect().top + 78);
    const bottom = Math.max(top + 120, bottomTop - 14);
    return { left: 8, top, right: window.innerWidth - 8, bottom };
  }

  updateProjectedFrameSize({ recenter = false, preserveCenter = false } = {}) {
    const oldCenterX = this.frameX + this.frameWidth / 2;
    const oldCenterY = this.frameY + this.frameHeight / 2;
    const bounds = this.getStageBounds();
    const projection = projectPhysicalFrameToPixels({
      widthCm: this.frameData.width,
      heightCm: this.frameData.height,
      distanceM: this.manualDistanceM,
      viewportHeightPx: window.innerHeight,
      verticalFovDeg: MANUAL_CAMERA_FOV_DEG,
      maxWidthPx: Math.max(80, bounds.right - bounds.left - 24),
      maxHeightPx: Math.max(100, bounds.bottom - bounds.top - 24),
      displayScale: this.displayScale,
    });

    this.frameWidth = projection.widthPx;
    this.frameHeight = projection.heightPx;
    this.frameWrapper.style.width = `${this.frameWidth}px`;
    this.frameWrapper.style.height = `${this.frameHeight}px`;
    this.frameCanvas.style.width = "100%";
    this.frameCanvas.style.height = "100%";

    if (recenter || (!Number.isFinite(this.frameX) && !Number.isFinite(this.frameY))) {
      this.frameX = (bounds.left + bounds.right - this.frameWidth) / 2;
      this.frameY = (bounds.top + bounds.bottom - this.frameHeight) / 2;
    } else if (preserveCenter) {
      this.frameX = oldCenterX - this.frameWidth / 2;
      this.frameY = oldCenterY - this.frameHeight / 2;
    }

    this.clampFrameToStage();
    this.updateFramePosition();

    const note = this.simulatorEl.querySelector("#manual-camera-scale-note");
    note.textContent = projection.isDisplayClamped
      ? "Tampilan dibatasi agar kontrol tetap terjangkau. Jarak tetap merupakan perkiraan manual."
      : "Geser model untuk memindahkan. Cubit dengan dua jari untuk mengatur jarak.";
  }

  clampFrameToStage() {
    const bounds = this.getStageBounds();
    const maxX = Math.max(bounds.left, bounds.right - this.frameWidth);
    const maxY = Math.max(bounds.top, bounds.bottom - this.frameHeight);
    this.frameX = clamp(this.frameX, bounds.left, maxX);
    this.frameY = clamp(this.frameY, bounds.top, maxY);
  }

  updateFramePosition() {
    this.frameWrapper.style.left = `${this.frameX}px`;
    this.frameWrapper.style.top = `${this.frameY}px`;
  }

  onPointerDown(event) {
    if (this.frameCanvasWrapper.hidden) return;
    event.preventDefault();
    this.frameWrapper.setPointerCapture?.(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.dragOffsetX = event.clientX - this.frameX;
      this.dragOffsetY = event.clientY - this.frameY;
    } else if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.isDragging = false;
      this.pinchStartDistancePx = Math.max(1, pointerDistance(a, b));
      this.pinchStartManualDistanceM = this.manualDistanceM;
    }
  }

  onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return;
    event.preventDefault();
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()];
      const ratio = pointerDistance(a, b) / Math.max(1, this.pinchStartDistancePx);
      this.manualDistanceM = distanceFromPinch(this.pinchStartManualDistanceM, ratio);
      this.distanceInput.value = String(this.manualDistanceM);
      this.updateProjectedFrameSize({ preserveCenter: true });
      this.updateControlLabels();
      return;
    }

    if (this.isDragging) {
      this.frameX = event.clientX - this.dragOffsetX;
      this.frameY = event.clientY - this.dragOffsetY;
      this.clampFrameToStage();
      this.updateFramePosition();
    }
  }

  onPointerEnd(event) {
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size === 1) {
      const remaining = [...this.activePointers.values()][0];
      this.isDragging = true;
      this.dragOffsetX = remaining.x - this.frameX;
      this.dragOffsetY = remaining.y - this.frameY;
    } else if (this.activePointers.size === 0) {
      this.isDragging = false;
    }
  }

  onWheel(event) {
    if (this.frameCanvasWrapper.hidden) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.1 : -0.1;
    this.manualDistanceM = clamp(
      this.manualDistanceM + delta,
      MANUAL_PLACEMENT_CONFIG.minDistanceM,
      MANUAL_PLACEMENT_CONFIG.maxDistanceM,
    );
    this.distanceInput.value = String(this.manualDistanceM);
    this.updateProjectedFrameSize({ preserveCenter: true });
    this.updateControlLabels();
  }

  async startCamera(openToken = this._openToken) {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (this.isActive && openToken === this._openToken) this.showNoCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!this.isActive || openToken !== this._openToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.video.hidden = false;
      this.noCameraEl.hidden = true;
    } catch (error) {
      console.warn("[Manual Placement] Kamera tidak tersedia:", error);
      if (this.isActive && openToken === this._openToken) this.showNoCamera();
    }
  }

  showNoCamera() {
    this.video.hidden = true;
    this.noCameraEl.hidden = false;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  useMockWall() {
    this.noCameraEl.hidden = true;
    this.simulatorEl.classList.add("manual-uses-mock-wall");
    this.messageEl.textContent = "Dinding virtual aktif. Penempatan tetap dapat dicoba secara manual.";
  }

  configureRenderCanvas(THREE) {
    const ratio = this.frameData.width / this.frameData.height;
    const maxRenderSize = 720;
    const renderWidth = Math.max(320, Math.round(ratio >= 1 ? maxRenderSize : maxRenderSize * ratio));
    const renderHeight = Math.max(320, Math.round(ratio >= 1 ? maxRenderSize / ratio : maxRenderSize));
    this._threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._threeRenderer.setSize(renderWidth, renderHeight, false);
    this._threeCamera.aspect = renderWidth / renderHeight;
    this._threeCamera.updateProjectionMatrix();

    if (this._threeModel && this._modelBounds) {
      const scale = computePhysicalModelScale({
        widthCm: this.frameData.width,
        heightCm: this.frameData.height,
      }, this._modelBounds);
      if (scale) this._threeModel.scale.set(scale.x, scale.y, scale.z);
    }

    const heightM = this.frameData.height / 100;
    const verticalFovRad = this._threeCamera.fov * Math.PI / 180;
    const cameraDistance = Math.max(0.2, (heightM / 2) / Math.tan(verticalFovRad / 2) * 1.22);
    this._threeCamera.position.set(0, 0, cameraDistance);
    this._threeCamera.lookAt(0, 0, 0);
  }

  async loadModel(modelUrl, frontRotationY = 0) {
    const normalizedFrontRotationY = Number(frontRotationY) === 180 ? 180 : 0;
    if (
      this._threeModel &&
      this._loadedModelUrl === modelUrl &&
      this._loadedModelFrontRotationY === normalizedFrontRotationY
    ) {
      const THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
      this.configureRenderCanvas(THREE);
      this.renderModel();
      return;
    }

    this.frameLoadingEl.hidden = false;
    const THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
    const { GLTFLoader } = await import("https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js");
    const { RoomEnvironment } = await import("https://unpkg.com/three@0.160.0/examples/jsm/environments/RoomEnvironment.js");

    if (this._threeRenderer) this._threeRenderer.dispose();
    const renderer = new THREE.WebGLRenderer({
      canvas: this.frameCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 0);
    this._threeRenderer = renderer;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4b5563, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe1b8, 0.7);
    fill.position.set(-3, 1, 2);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this._threeScene = scene;
    this._threeCamera = camera;

    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(modelUrl, resolve, undefined, reject);
    });
    const sourceModel = gltf.scene;
    if (modelUrl !== DEFAULT_MODEL_URL) {
      resetExporterPresentationRotation(sourceModel);
    }

    const sourceBox = new THREE.Box3().setFromObject(sourceModel);
    const sourceBounds = new THREE.Vector3();
    sourceBox.getSize(sourceBounds);
    const axisLayout = resolveModelAxisNormalization(sourceBounds);
    if (!axisLayout) throw new Error("Dimensi model 3D tidak valid.");

    const canonicalModel = new THREE.Group();
    canonicalModel.name = "CitraFrameCanonicalAxes";
    canonicalModel.rotation.set(
      THREE.MathUtils.degToRad(axisLayout.rotationXDeg),
      THREE.MathUtils.degToRad(axisLayout.rotationYDeg),
      THREE.MathUtils.degToRad(axisLayout.rotationZDeg),
    );
    canonicalModel.add(sourceModel);
    canonicalModel.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(canonicalModel);
    const center = new THREE.Vector3();
    const bounds = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(bounds);
    canonicalModel.position.sub(center);
    canonicalModel.updateMatrixWorld(true);
    this._modelBaseRotationYRad = normalizedFrontRotationY * Math.PI / 180;
    this._modelBounds = { x: bounds.x, y: bounds.y, z: bounds.z };

    canonicalModel.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.envMapIntensity = 1.0;
        ["map", "emissiveMap"].forEach((keyName) => {
          if (material[keyName]) {
            material[keyName].colorSpace = THREE.SRGBColorSpace;
            material[keyName].needsUpdate = true;
          }
        });
        material.needsUpdate = true;
      });
    });

    const orientedModel = new THREE.Group();
    orientedModel.name = "CitraFrameManualOrientedModel";
    orientedModel.add(canonicalModel);
    scene.add(orientedModel);
    this._threeModel = orientedModel;
    this._loadedModelUrl = modelUrl;
    this._loadedModelFrontRotationY = normalizedFrontRotationY;
    this.configureRenderCanvas(THREE);
    this.renderModel();
    this.frameLoadingEl.hidden = true;
  }

  renderModel() {
    if (!this._threeRenderer || !this._threeScene || !this._threeCamera || !this._threeModel) return;
    this._threeModel.rotation.set(
      0,
      this._modelBaseRotationYRad + this.yawDeg * Math.PI / 180,
      this.rollDeg * Math.PI / 180,
    );
    this._threeRenderer.render(this._threeScene, this._threeCamera);
  }

  drawVideoCover(ctx, targetWidth, targetHeight) {
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    if (!videoWidth || !videoHeight) return false;
    const sourceRatio = videoWidth / videoHeight;
    const targetRatio = targetWidth / targetHeight;
    let sx = 0;
    let sy = 0;
    let sw = videoWidth;
    let sh = videoHeight;
    if (sourceRatio > targetRatio) {
      sw = videoHeight * targetRatio;
      sx = (videoWidth - sw) / 2;
    } else {
      sh = videoWidth / targetRatio;
      sy = (videoHeight - sh) / 2;
    }
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    return true;
  }

  drawMockWall(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#d9d2c7");
    gradient.addColorStop(0.74, "#c9c0b3");
    gradient.addColorStop(0.745, "#8b7355");
    gradient.addColorStop(1, "#6b5a44");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  async captureScreenshot() {
    this.flashEl.classList.add("flash");
    setTimeout(() => this.flashEl.classList.remove("flash"), 550);
    try {
      this.renderModel();
      const width = window.innerWidth;
      const height = window.innerHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const hasVideo = this.stream && this.video.readyState >= 2 && this.drawVideoCover(ctx, width, height);
      if (!hasVideo) this.drawMockWall(ctx, width, height);
      ctx.drawImage(this.frameCanvas, this.frameX, this.frameY, this.frameWidth, this.frameHeight);

      ctx.fillStyle = "rgba(16, 18, 22, 0.72)";
      ctx.fillRect(12, height - 54, 250, 38);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 12px Noto Sans, sans-serif";
      ctx.fillText(`Citra Artframe · Manual ${this.manualDistanceM.toFixed(2)} m`, 24, height - 30);

      const link = document.createElement("a");
      link.download = `citraframe-manual-${Date.now()}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.92);
      link.click();
      this.messageEl.textContent = "Foto penempatan manual berhasil disimpan.";
    } catch (error) {
      console.error("[Manual Placement] Screenshot gagal:", error);
      this.messageEl.textContent = "Foto tidak dapat dibuat pada browser ini.";
    }
  }
}

let arVisualizerInstance = null;

export function getARVisualizer() {
  if (!arVisualizerInstance) arVisualizerInstance = new ARWallVisualizer();
  return arVisualizerInstance;
}

export async function openARVisualizer(options = {}) {
  const visualizer = getARVisualizer();
  await visualizer.open(options);
}
