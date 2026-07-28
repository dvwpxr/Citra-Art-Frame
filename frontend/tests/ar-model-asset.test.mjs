import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePhysicalModelScale } from "../assets/js/ar-surface-utils.mjs";

function multiplyMatrix4(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        out[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
      }
    }
  }
  return out;
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function parseFrameAsset() {
  const data = readFileSync(new URL("../assets/3d/frame.glb", import.meta.url));
  assert.equal(data.toString("ascii", 0, 4), "glTF");
  const jsonLength = data.readUInt32LE(12);
  const json = data.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, "");
  return JSON.parse(json);
}

function getMeshWorldMatrix(gltf) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let nodeIndex = gltf.scenes[gltf.scene || 0].nodes[0];
  let world = identity;
  while (nodeIndex !== undefined) {
    const node = gltf.nodes[nodeIndex];
    world = multiplyMatrix4(world, node.matrix || identity);
    if (node.mesh !== undefined) return { matrix: world, mesh: gltf.meshes[node.mesh] };
    nodeIndex = node.children?.[0];
  }
  throw new Error("Mesh node not found in frame.glb");
}

test("frame.glb maps X to width, Y to height, and Z to shallow depth", () => {
  const gltf = parseFrameAsset();
  const { matrix, mesh } = getMeshWorldMatrix(gltf);
  const positionAccessor = gltf.accessors[mesh.primitives[0].attributes.POSITION];
  const corners = [];
  for (const x of [positionAccessor.min[0], positionAccessor.max[0]]) {
    for (const y of [positionAccessor.min[1], positionAccessor.max[1]]) {
      for (const z of [positionAccessor.min[2], positionAccessor.max[2]]) {
        corners.push(transformPoint(matrix, [x, y, z]));
      }
    }
  }

  const min = [0, 1, 2].map((axis) => Math.min(...corners.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...corners.map((point) => point[axis])));
  const bounds = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };

  assert.ok(bounds.x > 0 && bounds.y > 0 && bounds.z > 0);
  assert.ok(bounds.y > bounds.x, "The source frame should be portrait in local X/Y axes");
  assert.ok(bounds.z < Math.min(bounds.x, bounds.y) * 0.2, "Local Z should remain the shallow frame depth");

  // 1.45/1.66 adalah kalibrasi empiris perangkat (divalidasi dengan lukisan
  // nyata 33×47 cm) — jangan diubah tanpa pengujian fisik ulang di HP.
  const scale = computePhysicalModelScale({ widthCm: 40, heightCm: 60 }, bounds);
  assert.equal(Number((bounds.x * scale.x).toFixed(6)), Number((0.4 * 1.45).toFixed(6)));
  assert.equal(Number((bounds.y * scale.y).toFixed(6)), Number((0.6 * 1.66).toFixed(6)));
  // Ketebalan tetap proporsional tanpa kompensasi agar bingkai menempel dinding.
  const proportionalDepth = bounds.z * Math.sqrt((0.4 / bounds.x) * (0.6 / bounds.y));
  assert.equal(
    Number((bounds.z * scale.z).toFixed(6)),
    Number(proportionalDepth.toFixed(6)),
  );
});
