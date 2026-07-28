const THREE = require('three');

const m = new THREE.Matrix4().set(
  0.9894, -0.1385, -0.0429, 0.0,
  -0.000, -0.2962,  0.9551, 0.0,
 -0.1450, -0.9450, -0.2931, 0.0,
  0.0,     0.0,     0.0,    1.0
);

const euler = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
console.log("Original YXZ:", euler.x * 180/Math.PI, euler.y * 180/Math.PI, euler.z * 180/Math.PI);

euler.x = 0; // Remove pitch? Wait, in YXZ, X is pitch. But what if we want to remove the pitch RELATIVE to the world?
const newM = new THREE.Matrix4().makeRotationFromEuler(euler);

console.log("New Matrix Y-axis:", newM.elements[4], newM.elements[5], newM.elements[6]);
console.log("New Matrix Z-axis:", newM.elements[8], newM.elements[9], newM.elements[10]);

// Try another order
const eulerZYX = new THREE.Euler().setFromRotationMatrix(m, 'ZYX');
console.log("Original ZYX:", eulerZYX.x * 180/Math.PI, eulerZYX.y * 180/Math.PI, eulerZYX.z * 180/Math.PI);
