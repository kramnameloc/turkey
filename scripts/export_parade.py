"""Rebuild the parade balloon pack with headless Blender."""
import json
from pathlib import Path
import struct
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ('Jett', 'jett_from_super_wings_balloon_3d_model.glb', 8.1, 14500),
    ('Elf', 'the_elf_on_the_shelf_balloon_3d_model.glb', 10.2, 9000),
    ('Thomas', 'thomas_the_tank_engine_balloon_3d_model.glb', 10.4, 24000),
    ('Chase', 'ballons/chase_from_paw_patrol_balloon_3d_model.glb', 9.6, 14000),
    ('Goku', 'ballons/1st_version_goku_balloon_3d_model.glb', 7.9, 6500),
    ('CharlieBrown', 'ballons/2nd_version_charlie_brown_balloon_3d_model.glb', 9.4, 14000),
    ('Scrat', 'ballons/ice_ages_scrat_and_his_acorn_balloon_3d_model.glb', 7.0, 17000),
    ('Sonic', 'ballons/macys_thanksgiving_day_parade_-_sonic_1993.glb', 10.3, 20000),
]
bpy.ops.wm.read_factory_settings(use_empty=True)
balloons = []

def import_balloon(path):
    # Sonic uses the legacy spec/gloss extension. Carry its actual diffuse maps
    # into core glTF before Blender imports the meshes and UVs.
    if 'sonic' not in path.name:
        bpy.ops.import_scene.gltf(filepath=str(path))
        return
    raw = path.read_bytes()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_size])
    for material in doc['materials']:
        diffuse = material.pop('extensions')['KHR_materials_pbrSpecularGlossiness']
        material['pbrMetallicRoughness'] = {
            'baseColorTexture': diffuse['diffuseTexture'], 'metallicFactor': 0,
        }
    doc.pop('extensionsUsed')
    doc.pop('extensionsRequired')
    meta = json.dumps(doc, separators=(',', ':')).encode()
    meta += b' ' * (-len(meta) % 4)
    binary = raw[20 + json_size:]
    with TemporaryDirectory() as folder:
        converted = Path(folder) / 'sonic-diffuse.glb'
        converted.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 20 + len(meta) + len(binary),
                                          len(meta), 0x4e4f534a) + meta + binary)
        bpy.ops.import_scene.gltf(filepath=str(converted))


def balloon_texture(mesh):
    images = [next(n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
              for m in mesh.materials]
    unique = list(dict.fromkeys(images))
    if len(unique) == 1:
        image = unique[0]
        image.scale(1024, 1024)
        image.pack()
        return image

    # Sonic's eyes, muzzle, spines, gloves and shoes have separate artwork.
    # Put each image in its own padded atlas cell and remap only its face UVs.
    edge, tile, pad = 2048, 512, 4
    assert len(unique) <= (edge // tile) ** 2
    atlas = np.zeros((edge, edge, 4), dtype='f4')
    origins = {}
    for i, image in enumerate(unique):
        x, y = (i % 4) * tile, (i // 4) * tile
        origins[image] = np.array([x + pad, y + pad])
        inner = tile - 2 * pad
        image.scale(inner, inner)
        pixels = np.empty(inner * inner * 4, dtype='f4')
        image.pixels.foreach_get(pixels)
        atlas[y:y + tile, x:x + tile] = np.pad(pixels.reshape(inner, inner, 4),
                                               ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    uv = mesh.uv_layers[0]
    for poly in mesh.polygons:
        origin = origins[images[poly.material_index]]
        for loop in poly.loop_indices:
            coord = np.asarray(uv.data[loop].uv)
            uv.data[loop].uv = (origin + np.clip(coord, 0, 1) * inner) / edge
    while len(mesh.uv_layers) > 1:
        mesh.uv_layers.remove(mesh.uv_layers[-1])
    image = bpy.data.images.new('Sonic fabric atlas', width=edge, height=edge, alpha=False)
    image.pixels.foreach_set(atlas.ravel())
    image.pack()
    return image


for name, file, height, budget in SOURCES:
    import_balloon(ROOT / 'download-models' / file)
    parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        transform = part.matrix_world.copy()
        part.parent = None
        part.matrix_world = Matrix.Identity(4)
        part.data.transform(transform)
        part.select_set(True)
    obj = parts[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.name = name
    obj.data.name = name
    # Join seams between the source export batches before simplifying Thomas.
    for kind in ['WELD', 'DECIMATE']:
        if len(obj.data.polygons) <= budget:
            break
        modifier = obj.modifiers.new(kind, kind)
        if kind == 'WELD':
            modifier.merge_threshold = .000015
        else:
            modifier.ratio = budget / len(obj.data.polygons)
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    positions = np.empty(len(obj.data.vertices)*3, dtype='f4')
    obj.data.vertices.foreach_get('co', positions)
    positions = positions.reshape(-1,3)
    lo, hi = positions.min(axis=0), positions.max(axis=0)
    center = (lo+hi)/2
    center[2] = lo[2]
    positions = (positions-center) * (height/(hi[2]-lo[2]))
    obj.data.vertices.foreach_set('co', positions.ravel())
    obj.data.update()
    # Preserve the photographic UVs, with one lit fabric material per balloon.
    image = balloon_texture(obj.data)
    mat = bpy.data.materials.new(name+' balloon fabric')
    mat.use_nodes = True
    surface = mat.node_tree.nodes.get('Principled BSDF')
    surface.inputs['Roughness'].default_value = .56
    color = mat.node_tree.nodes.new('ShaderNodeTexImage')
    color.image = image
    mat.node_tree.links.new(color.outputs['Color'], surface.inputs['Base Color'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj.data.polygons.foreach_set('material_index', np.zeros(len(obj.data.polygons), dtype='i4'))
    balloons.append(obj)
    print(name, len(obj.data.polygons), 'triangles;', np.ptp(positions,axis=0), 'meters', flush=True)

bpy.ops.object.select_all(action='DESELECT')
for balloon in balloons:
    balloon.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/parade-balloons.glb'),
    use_selection=True, export_format='GLB', export_animations=False, export_image_format='WEBP',
    export_image_quality=87, export_image_webp_fallback=False,
    export_copyright='Parade balloon models by Macys Parade and Sonic (1993) by pika39019, CC BY 4.0. Full credits in /scenery/sources.json.')
