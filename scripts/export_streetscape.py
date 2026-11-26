"""Extract street, landscape, house and spectator models with headless Blender."""
from math import radians
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'download-models/streetscape'
bpy.ops.wm.read_factory_settings(use_empty=True)
library = []


def load(file):
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / file))


def parts(root):
    parent = bpy.data.objects[root]
    return [o for o in [parent, *parent.children_recursive] if o.type == 'MESH']


def extent(obj):
    values = np.empty(len(obj.data.vertices) * 3, dtype='f4')
    obj.data.vertices.foreach_get('co', values)
    values = values.reshape(-1, 3)
    return values.min(axis=0), values.max(axis=0)


def extract(name, meshes, height, turn=0, pole=False):
    bpy.ops.object.select_all(action='DESELECT')
    rotation = Matrix.Rotation(radians(turn), 4, 'Z')
    for obj in meshes:
        transform = rotation @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
        obj.select_set(True)
    mesh = meshes[0]
    bpy.context.view_layer.objects.active = mesh
    if len(meshes) > 1:
        bpy.ops.object.join()
    low, high = extent(mesh)
    center = (low + high) / 2
    center[2] = low[2]
    if pole:
        feet = np.array([v.co[:] for v in mesh.data.vertices if v.co.z < low[2] + (high[2]-low[2]) * .015])
        center[:2] = (feet.min(axis=0) + feet.max(axis=0))[:2] / 2
    scale = height / (high[2] - low[2])
    mesh.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-Vector(center)))
    mesh.name = mesh.data.name = name
    library.append(mesh)
    return mesh


def simple(name, rgb, texture=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = .82
    if texture:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(texture))
        node.image.pack()
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    return mat


load('city_props_pack.glb')
for name, source, height in [
    ('Hydrant', 'Fire Hydrant_38', .76), ('LitterBin', 'Trash Bin_37', .91),
    ('RecyclingBin', 'Recycle Bin_36', .91), ('StopSign', 'Stop Sign 5_35', 2.68),
    ('Streetlamp', 'Streetlight_0', 7.7),
]:
    obj = extract(name, parts(source), height, pole=name == 'Streetlamp')
    if name in ('LitterBin','RecyclingBin'):
        obj.data.transform(Matrix.Diagonal((.67,.67,1,1)))

# Preserve the mast, pedestrian stop hand and three signal heads. The author's
# fictional street names do not belong on Broomfield's surveyed street blades.
mast = [o for o in parts('Stretlight with Arm_14')
        if o.parent.name.startswith(('Stretlight', 'Cylinder', 'Traffic Light', 'Crosswalk Lights', 'Crosswalk - Stop'))]
extract('Signal', mast, 8.3, pole=True)
for name in ('Metal','Traffic_Light'):
    shader = bpy.data.materials[name].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = .16
    if name == 'Traffic_Light':
        shader.inputs['Base Color'].default_value = (.57,.29,.043,1)
# Remove coplanar subdivision in the lettering without losing the glyph outlines.
for name in ('StopSign', 'Signal'):
    obj = bpy.data.objects[name]
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('Simplify flat faces', 'DECIMATE')
    modifier.decimate_type = 'DISSOLVE'
    modifier.angle_limit = radians(1)
    modifier.delimit = {'MATERIAL'}
    bpy.ops.object.modifier_apply(modifier=modifier.name)
for key, color, lit in [('Red', (.67,.012,.005), True), ('Yellow', (.18,.10,.008), False),
                        ('Green', (.003,.12,.065), False)]:
    shader = bpy.data.materials['Traffic_Light_' + key].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Emission Strength'].default_value = .8 if lit else 0

with TemporaryDirectory() as folder:
    folder = Path(folder)
    with ZipFile(SOURCE / 'street-props-bench-potbox-stopsign-street-light.zip') as archive:
        archive.extract('source/streat props.rar', folder)
        wood = Path(archive.extract('textures/TexturesCom_Wood_Worn3_512_albedo.png', folder))
    # Read only the FBX bytes. The nested archive never creates paths or links.
    fbx = folder / 'streat props.fbx'
    with fbx.open('xb') as output:
        subprocess.run(['bsdtar', '-xOf', str(folder / 'source/streat props.rar'), fbx.name],
                       stdout=output, check=True)
    bpy.ops.import_scene.fbx(filepath=str(fbx))
    wood = simple('Weathered park bench slats', (.36,.21,.1), wood)
    iron = simple('Painted bench frame', (.055,.065,.06))
    pieces = []
    for i in [7,8,11,13,16,17,18,19,20]:
        obj = bpy.data.objects[f'Line{i:03}']
        obj.data.materials.clear()
        obj.data.materials.append(iron if i in (7,13,16,20) else wood)
        pieces.append(obj)
    bench = extract('Bench', pieces, .91, -90)
    bench.data.transform(Matrix.Diagonal((1.15,.8,1,1)))
    lamp = [bpy.data.objects[n] for n in ('Cylinder001', 'Line001', 'Box001')]
    for part in lamp:
        part.data.materials.clear()
        part.data.materials.append(iron)
    extract('PathLamp', lamp, 4.35, pole=True)

load('free_pack_-_lowpoly_people.glb')
# The source provides unpainted posed figures. Use flat face colors so a coat,
# its collar, and the trousers retain a crisp silhouette at curbside distances.
costumes = [(.13,.21,.31),(.37,.12,.071),(.14,.26,.18),(.32,.18,.29),(.55,.34,.10),(.14,.29,.34)]
skins = [(.65,.35,.21),(.36,.17,.105),(.78,.48,.34),(.46,.24,.15),(.68,.39,.25),(.29,.14,.09)]
cloth = simple('Spectator clothing', (1,1,1))
vc = cloth.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Clothing'
cloth.node_tree.links.new(vc.outputs['Color'],cloth.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
for i in range(6):
    obj = extract('Onlooker'+str(i+1), parts(f'SM_People_Lowpoly_{i+3:02}'), 1.70)
    obj.data.materials.clear()
    obj.data.materials.append(cloth)
    colors = obj.data.color_attributes.new(name='Clothing',type='BYTE_COLOR',domain='CORNER')
    for face in obj.data.polygons:
        x,y,z = face.center
        rgb = ((.048,.039,.034) if z<.13 else (.085,.105,.13) if z<.80 else
               (.055,.036,.025) if z>1.59 or (z>1.47 and face.normal.y>.45) else
               skins[i] if z>1.39 else costumes[i])
        for j in face.loop_indices:
            colors.data[j].color = (*rgb,1)

load('bush_models_pack_gameready_lods.glb')
for label, source, height in [('LowShrub','Bush_small_002_LOD2',.62),('RoundShrub','Bush_medium_003_LOD2',1.03)]:
    extract(label, parts(source), height)
for key in ['Brunch_material', 'Bark_material']:
    mat = bpy.data.materials[key]
    shader = mat.node_tree.nodes.get('Principled BSDF')
    for socket in ['Normal','Metallic','Roughness']:
        for link in list(shader.inputs[socket].links):
            mat.node_tree.links.remove(link)
    shader.inputs['Roughness'].default_value=.94
    # Remove unused normal and packed ORM textures from the export.
    for node in list(mat.node_tree.nodes):
        if node.type=='TEX_IMAGE' and not any(out.is_linked for out in node.outputs):
            mat.node_tree.nodes.remove(node)

load('suburban_home.glb')
house = []
for obj in bpy.context.selected_objects:
    if obj.type != 'MESH' or not obj.data.polygons or obj.data.materials[0].name == 'Grass_Dark_Green':
        continue
    # Remove the demonstration lawn, foundation slab and driveway beyond the eaves.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    discard = [v for v in bm.verts if not (141 < (p:=obj.matrix_world @ v.co).x < 514 and -11 < p.y < 268)]
    bmesh.ops.delete(bm, geom=discard, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    if obj.data.polygons:
        house.append(obj)
ranch = extract('RanchHouse', house, 5.0)
brick_ranch = ranch.copy()
brick_ranch.data = ranch.data.copy()
bpy.context.collection.objects.link(brick_ranch)
brick_ranch.name = brick_ranch.data.name = 'BrickRanch'
library.append(brick_ranch)
brick = bpy.data.materials['Brick_Rough_Dark'].copy()
brick.name = 'Main Street warm brick'
shader = brick.node_tree.nodes.get('Principled BSDF')
tex = shader.inputs['Base Color'].links[0].from_node
warm = tex.image.copy()
warm.name = 'Warm ranch masonry'
pixels = np.empty(len(warm.pixels), dtype='f4')
warm.pixels.foreach_get(pixels)
pixels.reshape(-1,4)[:,:3] *= (.98,.54,.33)
warm.pixels.foreach_set(pixels)
warm.pack()
tex.image = warm
for slot in brick_ranch.material_slots:
    if slot.material.name == 'Cladding_Siding_White':
        slot.material = brick
uv = brick_ranch.data.uv_layers[0].data
for face in brick_ranch.data.polygons:
    if brick_ranch.data.materials[face.material_index] != brick:
        continue
    for loop in face.loop_indices:
        co = brick_ranch.data.vertices[brick_ranch.data.loops[loop].vertex_index].co
        uv[loop].uv = ((co.x if abs(face.normal.y)>abs(face.normal.x) else co.y)*1.15, co.z*.77)
glass = simple('Residential window glass', (.24,.34,.39))
for h in (ranch,brick_ranch):
    for slot in h.material_slots:
        if slot.material.name == 'Translucent_Glass_Safety':
            slot.material = glass

# Pack only the selected source art. Keep alpha for leaf cutouts.
bpy.ops.object.select_all(action='DESELECT')
for obj in library:
    if obj.data.uv_layers:
        obj.data.uv_layers.active_index = 0
        obj.data.uv_layers[0].active_render = True
    obj.select_set(True)
for image in bpy.data.images:
    if image.users and max(image.size) > 1024:
        w,h=image.size
        image.scale(round(w*1024/max(w,h)),round(h*1024/max(w,h)))
        image.pack()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/streetscape.glb'),use_selection=True,
                          export_format='GLB', export_animations=False, export_image_format='WEBP',
                          export_image_quality=84, export_image_webp_fallback=False,
                          export_copyright='Artist credits and adaptations in /scenery/sources.json')
