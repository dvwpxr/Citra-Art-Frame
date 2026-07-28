import math

# Matrix transposed because Three.js uses column-major arrays, but the numbers I provided are row-by-row visually
# Wait, no, Three.js set() takes row-major arguments!
# so m.elements in Three.js is column-major.
# Let's just do it manually.
# [ m00 m01 m02 m03 ]
# [ m10 m11 m12 m13 ]
# [ m20 m21 m22 m23 ]
# [ m30 m31 m32 m33 ]

m00 = 0.9894; m01 = -0.1385; m02 = -0.0429
m10 = -0.000; m11 = -0.2962; m12 =  0.9551
m20 = -0.1450; m21 = -0.9450; m22 = -0.2931

# Assuming YXZ order like Three.js default
# Y = asin( clamp( m02, -1, 1 ) )? No, Three.js Euler setFromRotationMatrix
# Pitch is X, Yaw is Y, Roll is Z

# Let's just output the matrix and check rotation around X
pitch = math.atan2(-m12, m22)
print("Pitch (atan2(-m12, m22)):", pitch * 180 / math.pi)

pitch2 = math.asin(m12)
print("Pitch (asin(m12)):", pitch2 * 180 / math.pi)

yaw = math.atan2(m02, m22)
print("Yaw (atan2(m02, m22)):", yaw * 180 / math.pi)
