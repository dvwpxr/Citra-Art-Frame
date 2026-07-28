import json, struct, math

with open('backend/uploads/models/1784746714583535000-thick_simple_picture_frame.glb', 'rb') as f:
    data = f.read()

chunk0_len = struct.unpack('<I', data[12:16])[0]
json_data = data[20:20+chunk0_len].decode('utf-8')
gltf = json.loads(json_data)

nodes = gltf.get('nodes', [])
root_node = nodes[0]
m = root_node.get('matrix', [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])

def apply_matrix(pt, m):
    x, y, z = pt
    nx = x * m[0] + y * m[4] + z * m[8] + m[12]
    ny = x * m[1] + y * m[5] + z * m[9] + m[13]
    nz = x * m[2] + y * m[6] + z * m[10] + m[14]
    return [nx, ny, nz]

min_pt = [-83.8278, -34.7906, -81.1459]
max_pt = [161.6081, 0.3347, 111.9449]

corners = [
    [min_pt[0], min_pt[1], min_pt[2]],
    [min_pt[0], min_pt[1], max_pt[2]],
    [min_pt[0], max_pt[1], min_pt[2]],
    [min_pt[0], max_pt[1], max_pt[2]],
    [max_pt[0], min_pt[1], min_pt[2]],
    [max_pt[0], min_pt[1], max_pt[2]],
    [max_pt[0], max_pt[1], min_pt[2]],
    [max_pt[0], max_pt[1], max_pt[2]],
]

transformed_corners = [apply_matrix(c, m) for c in corners]

t_min = [min(c[i] for c in transformed_corners) for i in range(3)]
t_max = [max(c[i] for c in transformed_corners) for i in range(3)]
span = [t_max[i] - t_min[i] for i in range(3)]

print(f"Transformed Bounding Box Span:")
print(f"  X: {span[0]:.4f}")
print(f"  Y: {span[1]:.4f}")
print(f"  Z: {span[2]:.4f}")

# Check all accessors to find the TRUE overall bounds!
overall_min = [float('inf'), float('inf'), float('inf')]
overall_max = [float('-inf'), float('-inf'), float('-inf')]

accessors = gltf.get('accessors', [])
for a in accessors:
    if a.get('type') == 'VEC3' and 'min' in a and 'max' in a:
        for i in range(3):
            overall_min[i] = min(overall_min[i], a['min'][i])
            overall_max[i] = max(overall_max[i], a['max'][i])

print(f"Overall Raw Bounding Box:")
print(f"  min: {overall_min}")
print(f"  max: {overall_max}")

raw_corners = [
    [overall_min[0], overall_min[1], overall_min[2]],
    [overall_min[0], overall_min[1], overall_max[2]],
    [overall_min[0], overall_max[1], overall_min[2]],
    [overall_min[0], overall_max[1], overall_max[2]],
    [overall_max[0], overall_min[1], overall_min[2]],
    [overall_max[0], overall_min[1], overall_max[2]],
    [overall_max[0], overall_max[1], overall_min[2]],
    [overall_max[0], overall_max[1], overall_max[2]],
]

tf_corners = [apply_matrix(c, m) for c in raw_corners]
tf_min = [min(c[i] for c in tf_corners) for i in range(3)]
tf_max = [max(c[i] for c in tf_corners) for i in range(3)]
tf_span = [tf_max[i] - tf_min[i] for i in range(3)]

print(f"Overall Transformed Bounding Box Span:")
print(f"  X: {tf_span[0]:.4f}")
print(f"  Y: {tf_span[1]:.4f}")
print(f"  Z: {tf_span[2]:.4f}")
