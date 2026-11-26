"""Run in background Blender to rebuild the November oak library from the supplied GLB."""
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'download-models/oak_trees_pack_17var_lods_seasons_gameready.glb'
OUTPUT = ROOT / 'public/models/november-oaks.glb'
# The city inventory ranges up to 18.2 m. The pack's 25–28 m parkland giants are
# larger than the mapped sites. Keep multiple silhouettes at each playable size.
FORMS = {
    'sapling': ('Sapling_oak_tree_', ('late', 'gold')),
    'small': ('Small_oak_tree__', ('gold', 'late', 'bare')),
    'medium': ('Medium_oak_tree__', ('late', 'bare', 'gold')),
    'mature': ('Big_oak_tree__', ('bare', 'gold', 'late')),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.ops.object.select_all(action='DESELECT')


def surface(name, source_name, size, foliage=False):
    source = bpy.data.materials[source_name].node_tree.nodes.get('Principled BSDF')
    image = source.inputs['Base Color'].links[0].from_node.image
    image.scale(*size)
    image.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = 1
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    if foliage:
        mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
    return mat


bark = surface('Oak bark', 'Bark_Mat', (512, 1024))
leaves = {
    season: surface('Oak ' + season, 'Cluster_Mat_' + source, (1024, 1024), True)
    for season, source in [('gold', 'Early_autumn_EX'), ('late', 'Late_Autumn_EX'), ('bare', 'Winter_EX')]
}


def thin_sprays(mesh, limit):
    # A spray is an independent 3–6 triangle UV island. Edge collapse stretches
    # twig textures. Retain complete sprays spread evenly through the 3D crown.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for v in bm.verts:
        v.tag = False
    sprays = []
    for v in bm.verts:
        if v.tag:
            continue
        stack = [v]
        v.tag = True
        spray = []
        while stack:
            current = stack.pop()
            spray.append(current)
            for edge in current.link_edges:
                neighbor = edge.other_vert(current)
                if not neighbor.tag:
                    neighbor.tag = True
                    stack.append(neighbor)
        sprays.append(spray)
    centers = [sum((v.co for v in group), Vector()) / len(group) for group in sprays]
    keep = set()
    distance = [float('inf')] * len(sprays)
    next_index = 0
    for _ in range(min(limit, len(sprays))):
        keep.add(next_index)
        center = centers[next_index]
        distance = [min(d, (p - center).length_squared) for p, d in zip(centers, distance)]
        next_index = max(range(len(sprays)), key=distance.__getitem__)
    spread = min(1.45, (len(sprays) / len(keep)) ** 0.36)
    for i in keep:
        for v in sprays[i]:
            v.co = centers[i] + (v.co - centers[i]) * spread
    bmesh.ops.delete(bm, geom=[v for i, group in enumerate(sprays) if i not in keep for v in group],
                     context='VERTS')
    bm.to_mesh(mesh)
    bm.free()


def copy_part(node, material, name, budget):
    # All display translations are staging offsets. The mesh origin itself is
    # the trunk pivot. Retain the authored axes and ignore the showroom layout.
    mesh = node.data.copy()
    mesh.transform(node.matrix_world.to_3x3().to_4x4())
    mesh.materials.clear()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if budget and len(mesh.polygons) > budget:
        modifier = obj.modifiers.new('Distant limbs', 'DECIMATE')
        modifier.ratio = budget / len(mesh.polygons)
        deps = bpy.context.evaluated_depsgraph_get()
        result = bpy.data.meshes.new_from_object(obj.evaluated_get(deps), depsgraph=deps)
        obj.modifiers.clear()
        obj.data = result
    obj.select_set(True)
    return obj


catalog = {}
for size, (prefix, seasons) in FORMS.items():
    catalog[size] = []
    for number, season in enumerate(seasons, 1):
        form = f'{size}{number}'
        detailed = size in ('medium', 'mature')
        # At street level keep full small trees and the artist's first reduced
        # mature crowns. At long range retain volumetric limbs and leaf clusters.
        for level, lod in enumerate((1, 2, 2) if detailed else (0, 1, 2)):
            source = f'{prefix}{number:03}_LOD{lod}'
            distant = level == 2 and detailed
            trunk = copy_part(bpy.data.objects[source + '_Bark_Mat_0'], bark,
                              f'{form}_{level}_bark', 135 if distant else None)
            foliage = copy_part(bpy.data.objects[source + '_Cluster_Mat_0'], leaves[season],
                                f'{form}_{level}_leaves', None)
            if distant:
                thin_sprays(foliage.data, 125 if size == 'mature' else 82)
            points = [obj.data.vertices[i].co for obj in (trunk, foliage)
                      for i in {loop.vertex_index for loop in obj.data.loops}]
            floor = min(p.z for p in points)
            height = max(p.z for p in points) - floor
            width = max(max(p[k] for p in points) - min(p[k] for p in points) for k in (0, 1))
            if level == 0:
                root = max(v.co.xy.length for v in trunk.data.vertices if v.co.z < floor + height * 0.015)
                low = min(v.co.z for v in foliage.data.vertices)
                catalog[size].append(dict(id=form, aspect=round(width/height, 4),
                                          trunk=round(root/width, 4), low=round((low-floor)/height, 4)))
            # All LODs share a root and physical dimensions, including on slopes.
            normalize = Matrix.Diagonal((1/width, 1/width, 1/height, 1)) @ Matrix.Translation((0, 0, -floor))
            for obj in (trunk, foliage):
                obj.data.transform(normalize)

bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT), use_selection=True, export_format='GLB', export_animations=False,
    export_image_format='WEBP', export_image_quality=84, export_image_webp_fallback=False,
    export_copyright='Oak trees pack (17var, LODs, seasons, gameready) by LOLIPOP, CC BY 4.0',
)
(ROOT / 'src/world/oak-forms.json').write_text(json.dumps(catalog, indent=2) + '\n')
