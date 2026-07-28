export const SURFACE_STATES = Object.freeze({
  SEARCHING: "searching",
  CANDIDATE: "candidate",
  STABLE: "stable",
  LOST: "lost",
  MANUAL: "manual",
});

export const SURFACE_TRACKING_CONFIG = Object.freeze({
  stableFrameCount: 3,
  planeDistanceToleranceM: 0.1,
  tangentialJumpToleranceM: 0.55,
  normalAngleToleranceDeg: 32,
  quaternionAngleToleranceDeg: 36,
  candidateMissGracePeriodMs: 520,
  lostGracePeriodMs: 950,
  maximumHitAgeMs: 1100,
  maximumViewerPoseAgeMs: 500,
  positionSmoothingAlpha: 0.35,
  movementSmoothingAlpha: 0.65,
  movementSmoothingThresholdM: 0.08,
  normalSmoothingAlpha: 0.35,
  quaternionSmoothingAlpha: 0.28,
  verticalNormalYMax: 0.4,
  horizontalNormalYMin: 0.82,
  manualFallbackAfterMs: 10000,
  maximumDepthAgeMs: 500,
});

export const MANUAL_PLACEMENT_CONFIG = Object.freeze({
  minDistanceM: 0.5,
  maxDistanceM: 5,
  defaultDistanceM: 2,
  minHeightOffsetM: -1.2,
  maxHeightOffsetM: 1.2,
  minHorizontalOffsetM: -1.2,
  maxHorizontalOffsetM: 1.2,
  maxYawDeg: 45,
  maxRotationDeg: 15,
});

export const FRAME_PLACEMENT_CONFIG = Object.freeze({
  surfaceGapM: 0.001,
  // Bidang deteksi ARCore pada dinding polos sering meleset beberapa mm-cm
  // DI DEPAN dinding nyata. Benamkan bagian belakang bingkai sedikit ke
  // bidang virtual agar tidak ada celah mengambang yang terlihat.
  wallSinkM: 0.01,
});

export const POINT_WALL_TRACKING_CONFIG = Object.freeze({
  fallbackAfterMs: 2200,
  minDistanceM: 0.6,
  maxDistanceM: 5,
  maxElevationAngleDeg: 35,
  sampleWindowMs: 1400,
  maxSamples: 16,
  minimumInlierCount: 3,
  maximumPlaneResidualM: 0.06,
  minimumStableFrameCount: 4,
});

export const XR_OPTIONAL_FEATURES = Object.freeze([
  "dom-overlay",
  "anchors",
  "plane-detection",
  "depth-sensing",
  "light-estimation",
]);

const EPSILON = 1e-8;

export function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export function cmToMeters(valueCm, fallbackCm = 1) {
  const numeric = Number(valueCm);
  const fallback = Number(fallbackCm);
  const cm = Number.isFinite(numeric) && numeric > 0
    ? numeric
    : Number.isFinite(fallback) && fallback > 0
      ? fallback
      : 1;
  return cm / 100;
}

export function clampManualDistance(distanceM, config = MANUAL_PLACEMENT_CONFIG) {
  return clamp(distanceM, config.minDistanceM, config.maxDistanceM);
}

/**
 * Projects a frame with real-world dimensions into screen pixels for the
 * non-WebXR manual fallback. The calculation uses a perspective camera model;
 * the optional fit limits only prevent the frame controls from becoming
 * unreachable when the selected distance is very close.
 */
export function projectPhysicalFrameToPixels({
  widthCm,
  heightCm,
  distanceM,
  viewportHeightPx,
  verticalFovDeg = 55,
  maxWidthPx = Number.POSITIVE_INFINITY,
  maxHeightPx = Number.POSITIVE_INFINITY,
  displayScale = 1,
} = {}) {
  const widthM = cmToMeters(widthCm, 40);
  const heightM = cmToMeters(heightCm, 60);
  const distance = clampManualDistance(distanceM);
  const viewportHeight = Math.max(1, Number(viewportHeightPx) || 1);
  const fovDeg = clamp(verticalFovDeg, 20, 100);
  const scale = clamp(displayScale, 0.5, 1.5);
  const focalLengthPx = viewportHeight / (2 * Math.tan((fovDeg * Math.PI / 180) / 2));
  const rawWidthPx = widthM * focalLengthPx / distance * scale;
  const rawHeightPx = heightM * focalLengthPx / distance * scale;
  const fitScale = Math.min(
    1,
    Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? maxWidthPx / rawWidthPx : 1,
    Number.isFinite(maxHeightPx) && maxHeightPx > 0 ? maxHeightPx / rawHeightPx : 1,
  );

  return {
    widthPx: rawWidthPx * fitScale,
    heightPx: rawHeightPx * fitScale,
    rawWidthPx,
    rawHeightPx,
    widthM,
    heightM,
    distanceM: distance,
    verticalFovDeg: fovDeg,
    fitScale,
    isDisplayClamped: fitScale < 0.999,
  };
}

export function distanceFromPinch(startDistanceM, scaleRatio, config = MANUAL_PLACEMENT_CONFIG) {
  const ratio = Number(scaleRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return clampManualDistance(startDistanceM, config);
  return clampManualDistance(Number(startDistanceM) / ratio, config);
}

export function normalizeVec3(vec) {
  if (!Array.isArray(vec) || vec.length < 3) return null;
  const x = Number(vec[0]);
  const y = Number(vec[1]);
  const z = Number(vec[2]);
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len < EPSILON) return null;
  return [cleanZero(x / len), cleanZero(y / len), cleanZero(z / len)];
}

export function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(vec, scalar) {
  return [vec[0] * scalar, vec[1] * scalar, vec[2] * scalar];
}

export function dotVec3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function crossVec3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function distanceVec3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function getPlaneMovement(previousPosition, currentPosition, planeNormal) {
  const normal = normalizeVec3(planeNormal);
  if (!normal) {
    return { perpendicularM: Number.POSITIVE_INFINITY, tangentialM: Number.POSITIVE_INFINITY };
  }
  const delta = subVec3(currentPosition, previousPosition);
  const perpendicularM = Math.abs(dotVec3(delta, normal));
  const totalM = Math.hypot(delta[0], delta[1], delta[2]);
  const tangentialM = Math.sqrt(Math.max(0, totalM * totalM - perpendicularM * perpendicularM));
  return { perpendicularM, tangentialM };
}

export function angleBetweenVec3Deg(a, b) {
  const na = normalizeVec3(a);
  const nb = normalizeVec3(b);
  if (!na || !nb) return 180;
  const d = clamp(dotVec3(na, nb), -1, 1);
  return Math.acos(d) * 180 / Math.PI;
}

export function lerpVec3(a, b, alpha) {
  return [
    a[0] + (b[0] - a[0]) * alpha,
    a[1] + (b[1] - a[1]) * alpha,
    a[2] + (b[2] - a[2]) * alpha,
  ];
}

export function normalizeQuaternion(quat) {
  if (!Array.isArray(quat) || quat.length < 4) return [0, 0, 0, 1];
  const x = Number(quat[0]);
  const y = Number(quat[1]);
  const z = Number(quat[2]);
  const w = Number(quat[3]);
  const len = Math.hypot(x, y, z, w);
  if (!Number.isFinite(len) || len < EPSILON) return [0, 0, 0, 1];
  return [x / len, y / len, z / len, w / len];
}

export function slerpQuaternion(a, b, alpha) {
  const qa = normalizeQuaternion(a);
  let qb = normalizeQuaternion(b);
  let cosHalfTheta = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];

  if (cosHalfTheta < 0) {
    qb = [-qb[0], -qb[1], -qb[2], -qb[3]];
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta >= 1.0) return qa.slice();

  if (cosHalfTheta > 0.9995) {
    return normalizeQuaternion([
      qa[0] + alpha * (qb[0] - qa[0]),
      qa[1] + alpha * (qb[1] - qa[1]),
      qa[2] + alpha * (qb[2] - qa[2]),
      qa[3] + alpha * (qb[3] - qa[3]),
    ]);
  }

  const halfTheta = Math.acos(clamp(cosHalfTheta, -1, 1));
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
  const ratioA = Math.sin((1 - alpha) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(alpha * halfTheta) / sinHalfTheta;

  return [
    qa[0] * ratioA + qb[0] * ratioB,
    qa[1] * ratioA + qb[1] * ratioB,
    qa[2] * ratioA + qb[2] * ratioB,
    qa[3] * ratioA + qb[3] * ratioB,
  ];
}

export function quaternionAngleDeg(a, b) {
  const qa = normalizeQuaternion(a);
  const qb = normalizeQuaternion(b);
  const dot = Math.abs(clamp(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3], -1, 1));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

export function quaternionFromRotationMatrixElements(m) {
  const m11 = m[0], m12 = m[4], m13 = m[8];
  const m21 = m[1], m22 = m[5], m23 = m[9];
  const m31 = m[2], m32 = m[6], m33 = m[10];
  const trace = m11 + m22 + m33;
  let x, y, z, w;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }

  return normalizeQuaternion([x, y, z, w]);
}

export function composeMatrixElements(position, quaternion, scale = [1, 1, 1]) {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = scale[0];
  const sy = scale[1];
  const sz = scale[2];

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    position[0], position[1], position[2], 1,
  ];
}

export function getPositionFromMatrixElements(matrixElements) {
  if (!Array.isArray(matrixElements) && !(matrixElements instanceof Float32Array)) return [0, 0, 0];
  return [matrixElements[12] || 0, matrixElements[13] || 0, matrixElements[14] || 0];
}

export function getForwardFromCameraMatrix(matrixElements) {
  if (!matrixElements || matrixElements.length < 16) return [0, 0, -1];
  return normalizeVec3([-matrixElements[8], -matrixElements[9], -matrixElements[10]]) || [0, 0, -1];
}

export function extractSurfaceNormalFromMatrixElements(matrixElements) {
  if (!matrixElements || matrixElements.length < 16) return null;
  return normalizeVec3([matrixElements[4], matrixElements[5], matrixElements[6]]);
}

export function orientNormalTowardPoint(normal, surfacePosition, pointPosition) {
  const normalized = normalizeVec3(normal);
  const surface = normalizeFiniteVec3(surfacePosition);
  const point = normalizeFiniteVec3(pointPosition);
  if (!normalized || !surface || !point) return normalized;

  const towardPoint = subVec3(point, surface);
  return dotVec3(normalized, towardPoint) < 0
    ? normalizeVec3(scaleVec3(normalized, -1))
    : normalized;
}

export function projectNormalToVerticalWall(normal) {
  const normalized = normalizeVec3(normal);
  if (!normalized) return null;
  return normalizeVec3([normalized[0], 0, normalized[2]]);
}

export function inferVerticalWallNormalFromPoint(
  pointPosition,
  viewerPosition,
  config = POINT_WALL_TRACKING_CONFIG,
) {
  const point = normalizeFiniteVec3(pointPosition);
  const viewer = normalizeFiniteVec3(viewerPosition);
  if (!point || !viewer) return null;

  const towardViewer = subVec3(viewer, point);
  const horizontalDistanceM = Math.hypot(towardViewer[0], towardViewer[2]);
  const totalDistanceM = Math.hypot(...towardViewer);
  const elevationAngleDeg = Math.atan2(
    Math.abs(towardViewer[1]),
    Math.max(EPSILON, horizontalDistanceM),
  ) * 180 / Math.PI;

  if (
    totalDistanceM < config.minDistanceM ||
    totalDistanceM > config.maxDistanceM ||
    elevationAngleDeg > config.maxElevationAngleDeg
  ) {
    return null;
  }

  return normalizeVec3([towardViewer[0], 0, towardViewer[2]]);
}

export function projectPointOntoPlane(point, planeOrigin, planeNormal) {
  const p = normalizeFiniteVec3(point);
  const origin = normalizeFiniteVec3(planeOrigin);
  const normal = normalizeVec3(planeNormal);
  if (!p || !origin || !normal) return null;
  const signedDistanceM = dotVec3(subVec3(p, origin), normal);
  return subVec3(p, scaleVec3(normal, signedDistanceM));
}

export function intersectRayWithPlane(rayOrigin, rayDirection, planeOrigin, planeNormal) {
  const origin = normalizeFiniteVec3(rayOrigin);
  const direction = normalizeVec3(rayDirection);
  const surfaceOrigin = normalizeFiniteVec3(planeOrigin);
  const normal = normalizeVec3(planeNormal);
  if (!origin || !direction || !surfaceOrigin || !normal) return null;

  const denominator = dotVec3(direction, normal);
  if (Math.abs(denominator) < EPSILON) return null;
  const distanceM = dotVec3(subVec3(surfaceOrigin, origin), normal) / denominator;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;

  return {
    position: addVec3(origin, scaleVec3(direction, distanceM)),
    distanceM,
  };
}

export function estimatePlaneNormalFromPoints(points, towardPoint, minTriangleAreaM2 = 0.0025) {
  const validPoints = (points || []).map(normalizeFiniteVec3).filter(Boolean);
  if (validPoints.length < 3) return null;

  let bestNormal = null;
  let bestDoubleArea = 0;
  let bestOrigin = null;
  for (let i = 0; i < validPoints.length - 2; i += 1) {
    for (let j = i + 1; j < validPoints.length - 1; j += 1) {
      for (let k = j + 1; k < validPoints.length; k += 1) {
        const edgeA = subVec3(validPoints[j], validPoints[i]);
        const edgeB = subVec3(validPoints[k], validPoints[i]);
        const cross = crossVec3(edgeA, edgeB);
        const doubleArea = Math.hypot(cross[0], cross[1], cross[2]);
        if (doubleArea > bestDoubleArea) {
          bestDoubleArea = doubleArea;
          bestNormal = normalizeVec3(cross);
          bestOrigin = validPoints[i];
        }
      }
    }
  }

  if (!bestNormal || bestDoubleArea < minTriangleAreaM2 * 2) return null;
  return orientNormalTowardPoint(bestNormal, bestOrigin, towardPoint);
}

export function fitVerticalWallPlane(
  points,
  towardPoint,
  {
    minimumInlierCount = POINT_WALL_TRACKING_CONFIG.minimumInlierCount,
    maximumPlaneResidualM = POINT_WALL_TRACKING_CONFIG.maximumPlaneResidualM,
  } = {},
) {
  const validPoints = (points || []).map(normalizeFiniteVec3).filter(Boolean);
  const toward = normalizeFiniteVec3(towardPoint);
  if (!toward || validPoints.length < Math.max(3, minimumInlierCount)) return null;

  let best = null;
  for (let i = 0; i < validPoints.length - 2; i += 1) {
    for (let j = i + 1; j < validPoints.length - 1; j += 1) {
      for (let k = j + 1; k < validPoints.length; k += 1) {
        const estimated = estimatePlaneNormalFromPoints(
          [validPoints[i], validPoints[j], validPoints[k]],
          toward,
        );
        if (!estimated || classifySurfaceNormal(estimated) !== "vertical") continue;

        const normal = projectNormalToVerticalWall(estimated);
        if (!normal) continue;
        const orientedNormal = orientNormalTowardPoint(normal, validPoints[i], toward);
        const offsets = validPoints
          .map((point) => dotVec3(point, orientedNormal))
          .sort((a, b) => a - b);
        const planeOffset = medianSorted(offsets);
        const residuals = validPoints.map((point) => (
          Math.abs(dotVec3(point, orientedNormal) - planeOffset)
        ));
        const inlierIndices = residuals
          .map((residual, index) => ({ residual, index }))
          .filter(({ residual }) => residual <= maximumPlaneResidualM)
          .map(({ index }) => index);
        if (inlierIndices.length < minimumInlierCount) continue;

        const meanResidualM = inlierIndices.reduce(
          (sum, index) => sum + residuals[index],
          0,
        ) / inlierIndices.length;
        if (
          !best ||
          inlierIndices.length > best.inlierIndices.length ||
          (
            inlierIndices.length === best.inlierIndices.length &&
            meanResidualM < best.meanResidualM
          )
        ) {
          best = {
            normal: orientedNormal,
            planeOffset,
            inlierIndices,
            meanResidualM,
          };
        }
      }
    }
  }

  if (!best) return null;
  const inlierPoints = best.inlierIndices.map((index) => validPoints[index]);
  const centroid = scaleVec3(
    inlierPoints.reduce((sum, point) => addVec3(sum, point), [0, 0, 0]),
    1 / inlierPoints.length,
  );
  const planePoint = scaleVec3(best.normal, best.planeOffset);
  const origin = projectPointOntoPlane(centroid, planePoint, best.normal);
  if (!origin) return null;

  return {
    origin,
    normal: best.normal,
    inlierCount: inlierPoints.length,
    meanResidualM: best.meanResidualM,
    projectedPoints: inlierPoints.map((point) => (
      projectPointOntoPlane(point, origin, best.normal)
    )),
  };
}

export function classifySurfaceNormal(normal, config = SURFACE_TRACKING_CONFIG) {
  const n = normalizeVec3(normal);
  if (!n) return "unknown";

  const absY = Math.abs(n[1]);
  if (absY <= config.verticalNormalYMax) return "vertical";
  if (absY >= config.horizontalNormalYMin) return "horizontal";
  return "inclined";
}

export function smoothPosition(previous, current, alpha = SURFACE_TRACKING_CONFIG.positionSmoothingAlpha) {
  return lerpVec3(previous, current, alpha);
}

export function smoothNormal(previous, current, alpha = SURFACE_TRACKING_CONFIG.normalSmoothingAlpha) {
  return normalizeVec3(lerpVec3(previous, current, alpha)) || previous;
}

export function smoothQuaternion(previous, current, alpha = SURFACE_TRACKING_CONFIG.quaternionSmoothingAlpha) {
  return slerpQuaternion(previous, current, alpha);
}

export class SurfaceTracker {
  constructor(config = SURFACE_TRACKING_CONFIG) {
    this.config = { ...SURFACE_TRACKING_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.state = SURFACE_STATES.SEARCHING;
    this.stableStreak = 0;
    this.firstHitTimeMs = null;
    this.firstStableTimeMs = null;
    this.lastHitTimeMs = null;
    this.lastClassification = "unknown";
    this.lastHit = null;
    this.smoothedHit = null;
    this.requiredStableFrameCount = this.config.stableFrameCount;
    this.lastError = "";
  }

  trackHit(hit, timestampMs) {
    const classification = hit?.classification || classifySurfaceNormal(hit?.normal, this.config);
    this.lastClassification = classification;

    if (classification !== "vertical") {
      return this.markMiss(timestampMs, classification);
    }

    const normalizedHit = this.#normalizeHit(hit, timestampMs, classification);
    if (!normalizedHit) {
      return this.markMiss(timestampMs, "unknown");
    }

    if (this.firstHitTimeMs === null) this.firstHitTimeMs = timestampMs;

    const previous = this.smoothedHit;
    let closeEnough = false;
    if (previous) {
      const movement = getPlaneMovement(previous.position, normalizedHit.position, previous.normal);
      const normalDelta = angleBetweenVec3Deg(previous.normal, normalizedHit.normal);
      const quatDelta = quaternionAngleDeg(previous.quaternion, normalizedHit.quaternion);
      closeEnough =
        movement.perpendicularM <= this.config.planeDistanceToleranceM &&
        movement.tangentialM <= this.config.tangentialJumpToleranceM &&
        normalDelta <= this.config.normalAngleToleranceDeg &&
        quatDelta <= this.config.quaternionAngleToleranceDeg;
    }

    if (!previous || !closeEnough) {
      this.stableStreak = 1;
      this.smoothedHit = normalizedHit;
    } else {
      this.stableStreak += 1;
      const movement = getPlaneMovement(previous.position, normalizedHit.position, previous.normal);
      const positionAlpha = movement.tangentialM >= this.config.movementSmoothingThresholdM
        ? this.config.movementSmoothingAlpha
        : this.config.positionSmoothingAlpha;
      const position = smoothPosition(previous.position, normalizedHit.position, positionAlpha);
      const normal = smoothNormal(previous.normal, normalizedHit.normal, this.config.normalSmoothingAlpha);
      const quaternion = smoothQuaternion(previous.quaternion, normalizedHit.quaternion, this.config.quaternionSmoothingAlpha);
      this.smoothedHit = {
        ...normalizedHit,
        position,
        normal,
        quaternion,
        matrix: composeMatrixElements(position, quaternion),
      };
    }

    this.lastHit = normalizedHit;
    this.lastHitTimeMs = timestampMs;
    const requestedStableFrameCount = Number(normalizedHit.minimumStableFrameCount);
    this.requiredStableFrameCount = Number.isFinite(requestedStableFrameCount)
      ? Math.max(this.config.stableFrameCount, Math.ceil(requestedStableFrameCount))
      : this.config.stableFrameCount;
    this.state = this.stableStreak >= this.requiredStableFrameCount
      ? SURFACE_STATES.STABLE
      : SURFACE_STATES.CANDIDATE;

    if (this.state === SURFACE_STATES.STABLE && this.firstStableTimeMs === null) {
      this.firstStableTimeMs = timestampMs;
    }

    return this.getStatus(timestampMs);
  }

  markMiss(timestampMs, classification = "unknown") {
    this.lastClassification = classification;
    const hitAgeMs = this.lastHitTimeMs === null
      ? Number.POSITIVE_INFINITY
      : timestampMs - this.lastHitTimeMs;
    const sparseHitGraceMs = Math.min(
      this.config.candidateMissGracePeriodMs,
      this.config.lostGracePeriodMs,
    );
    const canBridgeSparseWallHit = Boolean(
      this.smoothedHit &&
      this.stableStreak > 0 &&
      classification !== "horizontal" &&
      hitAgeMs <= sparseHitGraceMs
    );

    if (canBridgeSparseWallHit) {
      this.state = SURFACE_STATES.LOST;
      return this.getStatus(timestampMs);
    }

    this.stableStreak = 0;

    if (this.lastHitTimeMs !== null && hitAgeMs <= this.config.lostGracePeriodMs) {
      this.state = SURFACE_STATES.LOST;
      return this.getStatus(timestampMs);
    }

    this.state = SURFACE_STATES.SEARCHING;
    this.stableStreak = 0;
    this.lastHit = null;
    this.smoothedHit = null;
    return this.getStatus(timestampMs);
  }

  canPlace(timestampMs) {
    return Boolean(
      this.state === SURFACE_STATES.STABLE &&
      this.smoothedHit &&
      this.lastHitTimeMs !== null &&
      timestampMs - this.lastHitTimeMs <= this.config.maximumHitAgeMs
    );
  }

  getStableHit(timestampMs) {
    if (!this.canPlace(timestampMs)) return null;
    return this.smoothedHit;
  }

  getStatus(timestampMs = this.lastHitTimeMs || 0) {
    return {
      state: this.state,
      stableStreak: this.stableStreak,
      requiredStableFrameCount: this.requiredStableFrameCount,
      classification: this.lastClassification,
      lastHitAgeMs: this.lastHitTimeMs === null ? null : Math.max(0, timestampMs - this.lastHitTimeMs),
      firstHitTimeMs: this.firstHitTimeMs,
      firstStableTimeMs: this.firstStableTimeMs,
      smoothedHit: this.smoothedHit,
    };
  }

  #normalizeHit(hit, timestampMs, classification) {
    const matrix = hit?.matrix ? Array.from(hit.matrix) : null;
    const position = hit?.position || (matrix ? getPositionFromMatrixElements(matrix) : null);
    const normal = hit?.normal || (matrix ? extractSurfaceNormalFromMatrixElements(matrix) : null);
    const quaternion = hit?.quaternion || (matrix ? quaternionFromRotationMatrixElements(matrix) : [0, 0, 0, 1]);

    const normalizedPosition = normalizeFiniteVec3(position);
    const normalizedNormal = normalizeVec3(normal);
    if (!normalizedPosition || !normalizedNormal) return null;

    return {
      ...hit,
      rawMatrix: matrix,
      matrix: composeMatrixElements(normalizedPosition, quaternion),
      position: normalizedPosition,
      normal: normalizedNormal,
      quaternion: normalizeQuaternion(quaternion),
      classification,
      timestampMs,
    };
  }
}

function normalizeFiniteVec3(vec) {
  if (!Array.isArray(vec) || vec.length < 3) return null;
  const out = [Number(vec[0]), Number(vec[1]), Number(vec[2])];
  return out.every(Number.isFinite) ? out : null;
}

function cleanZero(value) {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function medianSorted(sortedValues) {
  if (!sortedValues.length) return 0;
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

export function getHorizontalForwardFromCameraMatrix(matrixElements) {
  if (!matrixElements || matrixElements.length < 16) return [0, 0, -1];
  const forward = normalizeVec3([-matrixElements[8], 0, -matrixElements[10]]);
  return forward || [0, 0, -1];
}

export function getHorizontalRightFromCameraMatrix(matrixElements) {
  const forward = getHorizontalForwardFromCameraMatrix(matrixElements);
  const right = normalizeVec3(crossVec3(forward, [0, 1, 0]));
  return right || [1, 0, 0];
}

export function makeSurfaceQuaternionFromNormal(surfaceNormal) {
  const faceDir = normalizeVec3(surfaceNormal) || [0, 0, 1];
  const worldUp = [0, 1, 0];
  let right = normalizeVec3(crossVec3(worldUp, faceDir));
  if (!right) right = [1, 0, 0];
  let up = normalizeVec3(crossVec3(faceDir, right));
  if (!up) up = worldUp;
  const matrix = [
    right[0], right[1], right[2], 0,
    up[0], up[1], up[2], 0,
    faceDir[0], faceDir[1], faceDir[2], 0,
    0, 0, 0, 1,
  ];
  return quaternionFromRotationMatrixElements(matrix);
}

export function makeWallFacingQuaternion(normalToCamera, rotationRad = 0) {
  const faceDir = normalizeVec3(normalToCamera) || [0, 0, 1];
  const worldUp = [0, 1, 0];
  let right = normalizeVec3(crossVec3(worldUp, faceDir));
  if (!right) right = [1, 0, 0];
  let up = normalizeVec3(crossVec3(faceDir, right));
  if (!up) up = worldUp;

  if (Math.abs(rotationRad) > EPSILON) {
    right = rotateVec3AroundAxis(right, faceDir, rotationRad);
    up = rotateVec3AroundAxis(up, faceDir, rotationRad);
  }

  const matrix = [
    right[0], right[1], right[2], 0,
    up[0], up[1], up[2], 0,
    faceDir[0], faceDir[1], faceDir[2], 0,
    0, 0, 0, 1,
  ];
  return quaternionFromRotationMatrixElements(matrix);
}

export function rotateVec3AroundAxis(vec, axis, angleRad) {
  const n = normalizeVec3(axis);
  if (!n) return vec.slice();
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const term1 = scaleVec3(vec, cos);
  const term2 = scaleVec3(crossVec3(n, vec), sin);
  const term3 = scaleVec3(n, dotVec3(n, vec) * (1 - cos));
  return addVec3(addVec3(term1, term2), term3);
}

export function createManualPlacement(cameraMatrix, controls = {}, config = MANUAL_PLACEMENT_CONFIG) {
  const cameraPosition = getPositionFromMatrixElements(cameraMatrix);
  const wallForward = getHorizontalForwardFromCameraMatrix(cameraMatrix);
  const right = getHorizontalRightFromCameraMatrix(cameraMatrix);
  const distanceM = clampManualDistance(
    controls.distanceM ?? config.defaultDistanceM,
    config,
  );
  const heightOffsetM = clamp(
    controls.heightOffsetM ?? 0,
    config.minHeightOffsetM,
    config.maxHeightOffsetM,
  );
  const horizontalOffsetM = clamp(
    controls.horizontalOffsetM ?? 0,
    config.minHorizontalOffsetM,
    config.maxHorizontalOffsetM,
  );
  const rotationDeg = clamp(
    controls.rotationDeg ?? 0,
    -config.maxRotationDeg,
    config.maxRotationDeg,
  );
  const yawDeg = clamp(
    controls.yawDeg ?? 0,
    -(config.maxYawDeg ?? 45),
    config.maxYawDeg ?? 45,
  );

  const planeCenter = addVec3(cameraPosition, scaleVec3(wallForward, distanceM));
  const shifted = addVec3(
    addVec3(planeCenter, scaleVec3(right, horizontalOffsetM)),
    [0, heightOffsetM, 0],
  );
  const normalToCamera = rotateVec3AroundAxis(
    scaleVec3(wallForward, -1),
    [0, 1, 0],
    yawDeg * Math.PI / 180,
  );
  const quaternion = makeWallFacingQuaternion(normalToCamera, rotationDeg * Math.PI / 180);

  return {
    mode: SURFACE_STATES.MANUAL,
    position: shifted,
    wallForward,
    normalToCamera,
    quaternion,
    distanceM,
    heightOffsetM,
    horizontalOffsetM,
    yawDeg,
    rotationDeg,
    isEstimate: true,
  };
}

export function resolveManualDistance({
  selectedDistanceM,
  depthDistanceM,
  depthAgeMs,
  trackingConfig = SURFACE_TRACKING_CONFIG,
  manualConfig = MANUAL_PLACEMENT_CONFIG,
} = {}) {
  const depthIsFresh = Number.isFinite(depthDistanceM) && depthDistanceM > 0 &&
    Number.isFinite(depthAgeMs) && depthAgeMs >= 0 && depthAgeMs <= trackingConfig.maximumDepthAgeMs;
  return clampManualDistance(
    depthIsFresh ? depthDistanceM : selectedDistanceM ?? manualConfig.defaultDistanceM,
    manualConfig,
  );
}

export function shouldShowManualFallback(status, elapsedMs, config = SURFACE_TRACKING_CONFIG) {
  return Boolean(
    elapsedMs >= config.manualFallbackAfterMs &&
    status?.state !== SURFACE_STATES.STABLE &&
    status?.firstStableTimeMs === null
  );
}

export function canPlaceNativeFrame(surfaceTracker, timestampMs) {
  return Boolean(surfaceTracker?.canPlace(timestampMs));
}

export function shouldOfferNativePlacement({ manualMode = false, placementMode = "", nativeStable = false } = {}) {
  return Boolean(nativeStable && (manualMode || placementMode === SURFACE_STATES.MANUAL));
}

export function selectPreferredWallHit(hits = []) {
  const validHits = hits.filter(Boolean);
  return validHits.find((hit) => hit.classification === "vertical") || validHits[0] || null;
}

export function selectPlacementHit({ transientHit = null, stableHit = null, timestampMs, config = SURFACE_TRACKING_CONFIG } = {}) {
  const stableIsFresh = Boolean(
    stableHit &&
    stableHit.classification === "vertical" &&
    timestampMs - stableHit.timestampMs <= config.maximumHitAgeMs
  );
  if (!stableIsFresh) return null;

  // Transient touchscreen hit-test follows the tap coordinate. The placement
  // control is near the bottom of the screen, so that ray must never replace
  // the center reticle's stable wall depth.
  return { ...stableHit, source: stableHit.source || "viewer" };
}

export function computePhysicalModelScale(
  { widthCm, heightCm },
  bounds,
) {
  // KALIBRASI EMPIRIS — JANGAN DIUBAH tanpa pengujian fisik ulang di
  // perangkat. Nilai ini divalidasi langsung dengan lukisan nyata: input
  // 33×47 cm tampil tepat 33×47 cm di dinding.
  const compensationX = 1.45; // 49 / 35
  const compensationY = 1.66; // 63 / 39

  const widthM = cmToMeters(widthCm * compensationX, 40);
  const heightM = cmToMeters(heightCm * compensationY, 60);

  const modelWidth = Number(bounds?.x);
  const modelHeight = Number(bounds?.y);
  const modelDepth = Number(bounds?.z);

  if (!Number.isFinite(modelWidth) || modelWidth <= EPSILON ||
    !Number.isFinite(modelHeight) || modelHeight <= EPSILON) {
    return null;
  }

  const x = widthM / modelWidth;
  const y = heightM / modelHeight;

  // Pertahankan profil/tonjolan asli GLB. Ketebalan dihitung TANPA faktor
  // kompensasi lebar/tinggi — jika ikut terkompensasi, tebal bingkai
  // membengkak ~55% dan pusat model terdorong menjauh dari dinding sehingga
  // bingkai tampak mengambang (kurang menempel tembok).
  const z = Math.sqrt(
    (widthM / compensationX / modelWidth) * (heightM / compensationY / modelHeight),
  );
  const depthM = Number.isFinite(modelDepth) && modelDepth > EPSILON
    ? modelDepth * z
    : 0;

  return {
    x,
    y,
    z,
    widthM,
    heightM,
    depthM,
    aspectRatio: widthM / heightM,
  };
}

/**
 * Memperkirakan tebal lis (molding) bingkai pada satu sumbu dari sebaran
 * vertex model (group space, +Z menghadap pemirsa). Lis adalah bagian yang
 * menonjol ke depan; kanvas/lukisan berada lebih ke belakang, sehingga
 * vertex dengan z di atas titik tengah kedalaman dianggap bagian lis.
 * Untuk sumbu X: lihat pita tengah tinggi (|y| kecil) — di situ hanya lis
 * kiri/kanan yang menonjol — lalu ukur jarak tepi dalamnya dari tepi luar.
 * Mengembalikan null jika model tidak berbentuk bingkai yang dikenali.
 */
export function estimateFrameBorderThickness(points, { axis = "x", crossBandRatio = 0.2 } = {}) {
  if (!Array.isArray(points) || points.length < 4) return null;
  const mainIndex = axis === "y" ? 1 : 0;
  const crossIndex = axis === "y" ? 0 : 1;

  let halfSpanMain = 0;
  let halfSpanCross = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    const main = Math.abs(Number(point[mainIndex]));
    const cross = Math.abs(Number(point[crossIndex]));
    const depth = Number(point[2]);
    if (!Number.isFinite(main) || !Number.isFinite(cross) || !Number.isFinite(depth)) return null;
    if (main > halfSpanMain) halfSpanMain = main;
    if (cross > halfSpanCross) halfSpanCross = cross;
    if (depth < minZ) minZ = depth;
    if (depth > maxZ) maxZ = depth;
  }
  if (halfSpanMain <= EPSILON || halfSpanCross <= EPSILON || maxZ - minZ <= EPSILON) return null;

  const zMid = minZ + (maxZ - minZ) * 0.5;
  const crossBand = halfSpanCross * crossBandRatio;
  let innerEdge = Infinity;
  for (const point of points) {
    if (Math.abs(Number(point[crossIndex])) > crossBand) continue;
    if (Number(point[2]) < zMid) continue;
    const main = Math.abs(Number(point[mainIndex]));
    if (main < innerEdge) innerEdge = main;
  }
  if (!Number.isFinite(innerEdge)) return null;

  const thickness = halfSpanMain - innerEdge;
  // Sanity: tebal lis wajar antara 2%–60% dari setengah bentang.
  if (thickness <= halfSpanMain * 0.02 || thickness >= halfSpanMain * 0.6) return null;
  return thickness;
}

/**
 * Remap koordinat satu sumbu ala 9-slice: zona lis di tepi hanya digeser
 * (tebalnya dipertahankan), bagian tengah direntang/dipadatkan agar bentang
 * total mencapai target. Dipakai agar lis kiri/kanan sama tebal dengan lis
 * atas/bawah walau skala lebar dan tinggi berbeda.
 */
export function remapSpanPreservingBorder(value, { halfSourceSpan, halfTargetSpan, borderThickness }) {
  const source = Number(halfSourceSpan);
  const target = Number(halfTargetSpan);
  const border = Number(borderThickness);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (!Number.isFinite(source) || source <= EPSILON || !Number.isFinite(target) || target <= EPSILON) {
    return numeric;
  }

  const innerSource = source - (Number.isFinite(border) ? border : 0);
  const innerTarget = target - (Number.isFinite(border) ? border : 0);
  if (!Number.isFinite(border) || border <= 0 || innerSource <= EPSILON || innerTarget <= EPSILON) {
    // Fallback: skala linear biasa jika zona lis tidak masuk akal.
    return numeric * (target / source);
  }

  const sign = numeric < 0 ? -1 : 1;
  const magnitude = Math.abs(numeric);
  if (magnitude >= innerSource) {
    // Zona lis: geser ke dalam tanpa mengubah tebal.
    return sign * Math.max(0, target - (source - magnitude));
  }
  return sign * (magnitude * (innerTarget / innerSource));
}

/**
 * Menentukan rotasi kanonis untuk aset bingkai yang bidang utamanya tidak
 * selalu berada pada sumbu X/Y. Banyak GLB dari Sketchfab memakai X/Z sebagai
 * bidang bingkai dan Y sebagai kedalaman.
 */
export function resolveModelAxisNormalization(bounds) {
  const dimensions = {
    x: Number(bounds?.x),
    y: Number(bounds?.y),
    z: Number(bounds?.z),
  };
  if (Object.values(dimensions).some((value) => !Number.isFinite(value) || value <= EPSILON)) {
    return null;
  }

  const depthAxis = Object.entries(dimensions)
    .sort(([, a], [, b]) => a - b)[0][0];

  if (depthAxis === "y") {
    return {
      depthAxis,
      rotationXDeg: 90,
      rotationYDeg: 0,
      rotationZDeg: 0,
      widthAxis: "x",
      heightAxis: "z",
    };
  }
  if (depthAxis === "x") {
    return {
      depthAxis,
      rotationXDeg: 0,
      rotationYDeg: 90,
      rotationZDeg: 0,
      widthAxis: "z",
      heightAxis: "y",
    };
  }
  return {
    depthAxis: "z",
    rotationXDeg: 0,
    rotationYDeg: 0,
    rotationZDeg: 0,
    widthAxis: "x",
    heightAxis: "y",
  };
}

export function computeWallContactOffset(
  physicalDepthM,
  surfaceGapM = FRAME_PLACEMENT_CONFIG.surfaceGapM,
  wallSinkM = FRAME_PLACEMENT_CONFIG.wallSinkM,
) {
  const depthM = Number(physicalDepthM);
  const gapM = Number(surfaceGapM);
  const sinkM = Number(wallSinkM);
  const safeDepthM = Number.isFinite(depthM) && depthM > 0 ? depthM : 0;
  const safeGapM = Number.isFinite(gapM) && gapM > 0 ? gapM : 0;
  const safeSinkM = Number.isFinite(sinkM) && sinkM > 0 ? sinkM : 0;
  return Math.max(0, safeDepthM / 2 + safeGapM - safeSinkM);
}

export function confirmManualPlacement(cameraMatrix, controls = {}, config = MANUAL_PLACEMENT_CONFIG) {
  return {
    confirmed: true,
    placement: createManualPlacement(cameraMatrix, controls, config),
  };
}

export async function detectImmersiveARSupport(navigatorLike) {
  const xr = navigatorLike?.xr;
  if (!xr || typeof xr.isSessionSupported !== "function") {
    return { immersiveAr: false, reason: "navigator.xr unavailable" };
  }
  try {
    const immersiveAr = await xr.isSessionSupported("immersive-ar");
    return { immersiveAr: Boolean(immersiveAr), reason: immersiveAr ? "" : "immersive-ar unsupported" };
  } catch (error) {
    return { immersiveAr: false, reason: error?.message || "isSessionSupported failed" };
  }
}

export function buildXRSessionInit({ domOverlayRoot = null, minimal = false } = {}) {
  if (minimal) {
    const init = { requiredFeatures: ["hit-test"] };
    if (domOverlayRoot) {
      init.optionalFeatures = ["dom-overlay"];
      init.domOverlay = { root: domOverlayRoot };
    }
    return init;
  }

  const init = {
    requiredFeatures: ["hit-test"],
    optionalFeatures: [...XR_OPTIONAL_FEATURES],
    depthSensing: {
      usagePreference: ["cpu-optimized"],
      dataFormatPreference: ["luminance-alpha", "float32"],
    },
  };

  if (domOverlayRoot) {
    init.domOverlay = { root: domOverlayRoot };
  }

  return init;
}

export function createEmptyCapabilities() {
  return {
    immersiveAr: false,
    hitTest: false,
    transientHitTest: false,
    anchors: false,
    planeDetection: false,
    depthSensing: false,
    domOverlay: false,
    lightEstimation: false,
    sessionMode: "none",
  };
}

export async function requestARSession(navigatorLike, domOverlayRoot = null, options = {}) {
  const capabilities = createEmptyCapabilities();
  const support = options.skipSupportCheck
    ? { immersiveAr: true, reason: "" }
    : await detectImmersiveARSupport(navigatorLike);
  capabilities.immersiveAr = support.immersiveAr;

  if (!support.immersiveAr) {
    return {
      session: null,
      capabilities,
      mode: "unsupported",
      errors: [support.reason],
    };
  }

  const xr = navigatorLike.xr;
  const errors = [];
  const preferFull = options.preferFull !== false;

  if (preferFull) {
    try {
      const session = await xr.requestSession("immersive-ar", buildXRSessionInit({ domOverlayRoot }));
      capabilities.sessionMode = "full";
      capabilities.domOverlay = Boolean(session?.domOverlayState);
      return { session, capabilities, mode: "full", errors };
    } catch (error) {
      errors.push(error?.message || "full session failed");
      options.logger?.warn?.("[AR] Full WebXR session failed, retrying minimal session", error);
    }
  }

  try {
    const session = await xr.requestSession("immersive-ar", buildXRSessionInit({
      domOverlayRoot,
      minimal: true,
    }));
    capabilities.sessionMode = "minimal";
    capabilities.domOverlay = Boolean(session?.domOverlayState);
    return { session, capabilities, mode: "minimal", errors };
  } catch (error) {
    errors.push(error?.message || "minimal session failed");
    return { session: null, capabilities, mode: "failed", errors };
  }
}

export async function requestTransientHitTestSource(sessionLike, profile = "generic-touchscreen") {
  if (!sessionLike || typeof sessionLike.requestHitTestSourceForTransientInput !== "function") {
    return null;
  }
  try {
    return await sessionLike.requestHitTestSourceForTransientInput({
      profile,
      entityTypes: ["plane"],
    });
  } catch {
    try {
      return await sessionLike.requestHitTestSourceForTransientInput({ profile });
    } catch {
      return null;
    }
  }
}

export function deleteXRAnchor(anchor) {
  if (!anchor || typeof anchor.delete !== "function") return false;
  try {
    anchor.delete();
    return true;
  } catch {
    return false;
  }
}

export class XRSourceRegistry {
  constructor() {
    this.sources = [];
    this.listeners = [];
  }

  addSource(source) {
    if (source) this.sources.push(source);
    return source;
  }

  addListener(target, eventName, handler) {
    if (target && eventName && handler && typeof target.addEventListener === "function") {
      target.addEventListener(eventName, handler);
      this.listeners.push({ target, eventName, handler });
    }
  }

  cleanup() {
    this.sources.forEach((source) => {
      try {
        source?.cancel?.();
      } catch { }
    });
    this.sources = [];

    this.listeners.forEach(({ target, eventName, handler }) => {
      try {
        target?.removeEventListener?.(eventName, handler);
      } catch { }
    });
    this.listeners = [];
  }

  get activeSourceCount() {
    return this.sources.length;
  }

  get listenerCount() {
    return this.listeners.length;
  }
}
