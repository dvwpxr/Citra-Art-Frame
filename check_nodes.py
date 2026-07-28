import json, struct

with open('backend/uploads/models/1784746714583535000-thick_simple_picture_frame.glb', 'rb') as f:
    data = f.read()

chunk0_len = struct.unpack('<I', data[12:16])[0]
json_data = data[20:20+chunk0_len].decode('utf-8')
gltf = json.loads(json_data)

nodes = gltf.get('nodes', [])
print(f"Total nodes: {len(nodes)}")
for i, n in enumerate(nodes):
    print(f"Node {i}: {n.get('name', 'unnamed')}")
    if 'matrix' in n:
        print(f"  matrix: {n['matrix']}")
    if 'rotation' in n:
        print(f"  rotation: {n['rotation']}")
