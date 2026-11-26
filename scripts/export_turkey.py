"""Run in background Blender to rebuild the player from the supplied FBX and PNG."""
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'download-models' / 'A_Turkey_BourbonRed'
OUTPUT = ROOT / 'public' / 'models' / 'bourbon-red.glb'
CLIPS = ('Stand', 'Walk', 'Run', 'Jump', 'Attack')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(SOURCE / 'A_Turkey_BourbonRed.fbx'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
face = body.data.shape_keys

# The FBX also plugs its color texture into a normal slot. Use the supplied
# color map as sRGB and retain the model's authored vertex normals.
material = body.data.materials[0]
nodes = material.node_tree.nodes
nodes.clear()
surface = nodes.new('ShaderNodeBsdfPrincipled')
surface.inputs['Roughness'].default_value = 0.86
color = nodes.new('ShaderNodeTexImage')
color.image = bpy.data.images.load(str(SOURCE / 'A_Turkey_Bourbon_Red.png'), check_existing=False)
color.image.colorspace_settings.name = 'sRGB'
link = material.node_tree.links.new
link(color.outputs['Color'], surface.inputs['Base Color'])
link(surface.outputs['BSDF'], nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])

def action(owner, name):
    return bpy.data.actions[f'{owner.name}|{name}|Turkey-BourbonRed|{name}']

for owner in (rig, face):
    owner.animation_data.action = action(owner, 'Stand')
    owner.animation_data.action_slot = action(owner, 'Stand').slots[0]
bpy.context.scene.frame_set(1)

# Extract the right wing from the standing pose, preserving its UV island.
# The viewmodel shares the skin material with the complete animated bird.
standing = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
group = body.vertex_groups['Wing_R'].index
members = {v.index for v in body.data.vertices if any(g.group == group and g.weight > 0.5 for g in v.groups)}
polys = [p for p in standing.data.polygons if all(i in members for i in p.vertices)]
indices = sorted({i for p in polys for i in p.vertices})
local_index = {i: n for n, i in enumerate(indices)}
points = [standing.matrix_world @ standing.data.vertices[i].co for i in indices]
center = Vector([(min(p[k] for p in points) + max(p[k] for p in points)) / 2 for k in range(3)])
mesh = bpy.data.meshes.new('PlayerWing')
mesh.from_pydata([p - center for p in points], [], [[local_index[i] for i in p.vertices] for p in polys])
uv = mesh.uv_layers.new()
for dst, src in zip(mesh.polygons, polys):
    dst.use_smooth = src.use_smooth
    for new, old in zip(dst.loop_indices, src.loop_indices):
        uv.data[new].uv = standing.data.uv_layers.active.data[old].uv
mesh.materials.append(material)
wing = bpy.data.objects.new('FirstPersonWing', mesh)
bpy.context.collection.objects.link(wing)

# Matching NLA track names combine skeletal and facial animation into one
# glTF clip per gameplay action. Only ship actions used by the player.
for owner in (rig, face):
    actions = {name: action(owner, name) for name in CLIPS}
    owner.animation_data.action = None
    for name, take in actions.items():
        track = owner.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, take)
        strip.action_slot = take.slots[0]
        strip.extrapolation = 'NOTHING'
        track.mute = True

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT), export_format='GLB', export_animation_mode='NLA_TRACKS',
    export_animations=True, export_anim_slide_to_zero=True, export_rest_position_armature=True,
    export_morph=True, export_morph_normal=False, export_morph_animation=True,
    export_texcoords=True, export_normals=True, export_vertex_color='NONE', export_extras=False,
)
