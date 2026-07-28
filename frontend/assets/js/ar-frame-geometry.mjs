/**
 * CITRA ARTFRAME - Penyesuaian geometri bingkai (9-slice) untuk skala non-uniform.
 *
 * Saat rasio input pengguna berbeda dari rasio model GLB, skala X dan Y
 * berbeda sehingga lis kiri/kanan tampak lebih tipis (atau lebih tebal)
 * daripada lis atas/bawah. Modul ini menerapkan skala UNIFORM sebesar sumbu
 * terbesar, lalu me-remap vertex pada sumbu yang kekurangan bentang: zona lis
 * di tepi hanya digeser (tebal dipertahankan), bagian tengah dipadatkan.
 * Hasilnya keempat sisi lis sama tebal dan dimensi luar tetap presisi.
 */

import * as THREE from "three";
import {
  estimateFrameBorderThickness,
  remapSpanPreservingBorder,
} from "./ar-surface-utils.mjs?v=20260726-border-slice-1";

// Di bawah selisih ini skala dianggap seragam dan remap tidak diperlukan.
const UNIFORMITY_RATIO_TOLERANCE = 1.05;

/**
 * Terapkan skala fisik ke instance bingkai. Mengembalikan "border-slice"
 * bila remap 9-slice diterapkan, atau "plain" bila memakai skala non-uniform
 * biasa (fallback aman — perilaku lama).
 *
 * PENTING: frame harus merupakan clone segar dari aset master; geometri mesh
 * di-clone sebelum dimutasi sehingga aset master tidak pernah berubah.
 */
export function applyBorderPreservingFrameScale(frame, physicalScale) {
  const plain = () => {
    frame.scale.set(physicalScale.x, physicalScale.y, physicalScale.z);
    return "plain";
  };

  const { x, y, z, widthM, heightM } = physicalScale || {};
  if (
    !frame ||
    ![x, y, z, widthM, heightM].every((value) => Number.isFinite(value) && value > 0)
  ) {
    return plain();
  }

  const ratio = Math.max(x, y) / Math.min(x, y);
  if (ratio <= UNIFORMITY_RATIO_TOLERANCE) return plain();

  const uniformScale = Math.max(x, y);
  const axis = x < y ? "x" : "y"; // sumbu yang bentangnya harus dikoreksi
  const halfTargetSpan = (axis === "x" ? widthM : heightM) / uniformScale / 2;

  frame.updateMatrixWorld(true);
  const rootInverse = frame.matrixWorld.clone().invert();

  const meshes = [];
  frame.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position) meshes.push(child);
  });
  if (!meshes.length) return plain();

  // Pass 1: kumpulkan vertex dalam group space untuk mengukur bentang dan
  // memperkirakan tebal lis dari geometri sebenarnya.
  const groupPoints = [];
  const vertex = new THREE.Vector3();
  const relativeMatrices = meshes.map((mesh) => {
    const relative = rootInverse.clone().multiply(mesh.matrixWorld);
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(relative);
      groupPoints.push([vertex.x, vertex.y, vertex.z]);
    }
    return relative;
  });

  let halfSourceSpan = 0;
  const mainIndex = axis === "y" ? 1 : 0;
  for (const point of groupPoints) {
    const magnitude = Math.abs(point[mainIndex]);
    if (magnitude > halfSourceSpan) halfSourceSpan = magnitude;
  }
  if (halfSourceSpan <= 0) return plain();

  const borderThickness = estimateFrameBorderThickness(groupPoints, { axis });
  if (
    !Number.isFinite(borderThickness) ||
    borderThickness === null ||
    halfTargetSpan - borderThickness <= halfSourceSpan * 0.02
  ) {
    // Model tidak dikenali sebagai bingkai, atau target terlalu sempit untuk
    // mempertahankan lis — kembali ke perilaku lama yang selalu aman.
    return plain();
  }

  // Pass 2: mutasi geometri per mesh (geometri di-clone agar master utuh).
  frame.scale.set(uniformScale, uniformScale, z);
  const remapConfig = { halfSourceSpan, halfTargetSpan, borderThickness };
  meshes.forEach((mesh, meshIndex) => {
    const relative = relativeMatrices[meshIndex];
    const inverseRelative = relative.clone().invert();
    const geometry = mesh.geometry.clone();
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(relative);
      if (axis === "x") {
        vertex.x = remapSpanPreservingBorder(vertex.x, remapConfig);
      } else {
        vertex.y = remapSpanPreservingBorder(vertex.y, remapConfig);
      }
      vertex.applyMatrix4(inverseRelative);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  });

  return "border-slice";
}
