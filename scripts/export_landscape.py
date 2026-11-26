"""Prepare the game's grass clumps and placement maps. Requires NumPy and Pillow."""
import io
import json
import math
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SCENERY = ROOT / 'public/scenery'
GEO = ROOT / 'public/geo'


class SourceGLB:
    def __init__(self, name):
        with (ROOT / 'download-models' / name).open('rb') as f:
            f.seek(12)
            size, _ = struct.unpack('<II', f.read(8))
            self.doc = json.loads(f.read(size))
            f.read(8)
            self.binary = f.read()

    def values(self, index):
        acc = self.doc['accessors'][index]
        view = self.doc['bufferViews'][acc['bufferView']]
        dtype = np.dtype({5123: '<u2', 5125: '<u4', 5126: '<f4'}[acc['componentType']])
        columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[acc['type']]
        return np.ndarray((acc['count'], columns), dtype, self.binary,
                          view.get('byteOffset', 0) + acc.get('byteOffset', 0),
                          (view.get('byteStride', dtype.itemsize * columns), dtype.itemsize))

    def image(self, index):
        view = self.doc['bufferViews'][self.doc['images'][index]['bufferView']]
        start = view.get('byteOffset', 0)
        return Image.open(io.BytesIO(self.binary[start:start + view['byteLength']]))


def grass_cards(source, mesh):
    """Find connected, separately oriented cutout cards in the example patch."""
    prim = source.doc['meshes'][mesh]['primitives'][0]
    pos = source.values(prim['attributes']['POSITION'])
    uv = source.values(prim['attributes']['TEXCOORD_0'])
    faces = source.values(prim['indices']).reshape(-1, 3)
    groups = np.arange(len(pos))
    for triangle in faces:
        ids = groups[triangle]
        groups[np.isin(groups, ids)] = ids.min()
    cards = []
    for group in np.unique(groups):
        triangles = faces[groups[faces[:, 0]] == group]
        if len(triangles) < 3:
            continue
        ids, indices = np.unique(triangles.ravel(), return_inverse=True)
        # The FBX's local Z axis is up. Remove its display translation and
        # center each card at the roots before assembling a meter-high master.
        p = pos[ids][:, [0, 2, 1]].copy()
        p[:, 2] *= -1
        p[:, 1] -= p[:, 1].min()
        roots = p[p[:, 1] <= p[:, 1].max() * .18]
        p[:, [0, 2]] -= roots.mean(axis=0)[[0, 2]]
        p /= p[:, 1].max()
        _, _, axes = np.linalg.svd(p[:, [0, 2]] - p[:, [0, 2]].mean(axis=0), full_matrices=False)
        cards.append((p, uv[ids], indices, axes[0]))
    return cards


def write_grass():
    source = SourceGLB('grass.glb')
    reeds, base = grass_cards(source, 0), grass_cards(source, 1)
    # UV windows and output atlas rectangles. Keep the November blades and heads.
    selections = [
        ('Lawn', [c for c in base if c[1][:, 0].max() < .51 and c[1][:, 1].max() < .25],
         2, (0, 0, .5, .25), (0, 0, 512, 256)),
        ('Dry', [c for c in base if c[1][:, 0].max() < .51 and c[1][:, 1].min() >= .74],
         2, (0, .75, .5, 1), (0, 256, 512, 512)),
        ('Reeds', [c for c in reeds if len(c[2]) == 29 * 3],
         0, (0, 0, 1, 1), (512, 0, 1024, 512)),
    ]
    atlas = Image.new('RGBA', (1024, 512))
    blob, views, accessors, meshes = bytearray(), [], [], []

    def append(raw):
        blob.extend(bytes(-len(blob) % 4))
        views.append(dict(buffer=0, byteOffset=len(blob), byteLength=len(raw)))
        blob.extend(raw)
        return len(views) - 1

    def attribute(values, kind, dimension):
        acc = dict(bufferView=append(values.tobytes()), componentType=kind, count=len(values), type=dimension)
        if dimension == 'VEC3':
            acc.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        accessors.append(acc)
        return len(accessors) - 1

    for name, cards, img, box, rect in selections:
        source_image = source.image(img).convert('RGBA')
        cropped = source_image.crop(tuple(round(v * source_image.width) for v in box))
        x, y, right, bottom = rect
        w, h = right - x - 4, bottom - y - 4
        cropped = cropped.resize((w, h), Image.Resampling.LANCZOS)
        atlas.paste(cropped, (x + 2, y + 2))
        # Two source cards with complementary directions retain volume from every bearing.
        first = cards[0]
        second = min(cards[1:], key=lambda c: abs(c[3] @ first[3]))
        positions, uvs, indices = [], [], []
        for p, uv, tri, _ in (first, second):
            indices.extend(tri + len(positions))
            positions.extend(p)
            mapped = np.clip((uv - box[:2]) / np.subtract(box[2:], box[:2]), 0, 1)
            uvs.extend((mapped * [w, h] + [x + 2, y + 2]) / atlas.size)
        meshes.append(dict(name=name, primitives=[dict(
            attributes=dict(POSITION=attribute(np.array(positions, '<f4'), 5126, 'VEC3'),
                            TEXCOORD_0=attribute(np.array(uvs, '<f4'), 5126, 'VEC2')),
            indices=attribute(np.array(indices, '<u2'), 5123, 'SCALAR'), material=0)]))
    art = io.BytesIO()
    atlas.save(art, 'WEBP', quality=87, method=6)
    image_view = append(art.getvalue())
    doc = dict(asset=dict(version='2.0', extras=source.doc['asset']['extras']), scene=0,
               scenes=[dict(nodes=list(range(len(meshes))))],
               nodes=[dict(name=m['name'], mesh=i) for i, m in enumerate(meshes)], meshes=meshes,
               accessors=accessors, bufferViews=views, buffers=[dict(byteLength=len(blob))],
               extensionsUsed=['EXT_texture_webp', 'KHR_materials_unlit'], extensionsRequired=['EXT_texture_webp'],
               images=[dict(bufferView=image_view, mimeType='image/webp')],
               textures=[dict(extensions=dict(EXT_texture_webp=dict(source=0)))],
               materials=[dict(doubleSided=True, alphaMode='MASK', alphaCutoff=.28,
                               extensions=dict(KHR_materials_unlit={}),
                               pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0))])
    header = json.dumps(doc, separators=(',', ':')).encode()
    header += b' ' * (-len(header) % 4)
    blob.extend(bytes(-len(blob) % 4))
    out = ROOT / 'public/models/field-grasses.glb'
    out.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(header) + len(blob)) +
                    struct.pack('<I4s', len(header), b'JSON') + header + struct.pack('<I4s', len(blob), b'BIN\0') + blob)


def grass_mask(image, bounds, size, roads, paths, buildings, water, landmarks):
    """Classify the aerial and cut openings at surveyed hard surfaces."""
    photo = Image.open(image).convert('RGB').resize((size, size), Image.Resampling.BILINEAR)
    r, g, b = np.asarray(photo, dtype=np.float32).transpose(2, 0, 1)
    lawn = (g >= r*.98) & (g > b*1.16) & (g > 52) & (r > b*.99)
    dormant = (r >= g*.98) & (g > r*.90) & (g-b > 15) & (g > 55) & (r < 184)
    field = Image.fromarray(np.where(lawn, 1, np.where(dormant, 2, 0)).astype('uint8'))
    scale = size / (bounds['maxX']-bounds['minX'])
    def pixel(x, z):
        return ((x-bounds['minX'])*scale, (z-bounds['minZ'])*scale)
    def shape(points):
        return [pixel(*p) for p in points]
    draw = ImageDraw.Draw(field)
    for spot in landmarks:
        if spot['type'] == 'soccer' and spot['name'] == 'Blue Pod':
            x, z = spot['x'], spot['z']
            for cz in (z-34, z+34):
                draw.rectangle([pixel(x-51,cz-30), pixel(x+51,cz+30)], fill=1)
    for ring in water:
        line = shape(ring['points'])
        # Seed heads occur on the grassy bank, just outside the mapped water.
        shore = Image.new('L', field.size)
        ImageDraw.Draw(shore).line(line+[line[0]], fill=255, width=max(1, round(6*scale)))
        bank = (np.asarray(shore)>0) & (np.asarray(field)>0)
        field.paste(3, mask=Image.fromarray(bank))
        draw.polygon(line, fill=0)
        draw.line(line+[line[0]], fill=0, width=2)
    for polygon in buildings:
        line = shape(polygon['points'])
        draw.polygon(line, fill=0)
        draw.line(line+[line[0]], fill=0, width=max(3, math.ceil(scale*1.2)))
    for line in [*roads, *paths]:
        w = math.ceil((line['width'] + 0.6)*scale) + 2
        draw.line(shape(line['points']), fill=0, width=w, joint='curve')
    return field


def write_masks():
    park = json.loads((GEO/'broomfield.json').read_text())
    region = json.loads((GEO/'region.json').read_text())
    sites = json.loads((GEO/'courses/maps.json').read_text())
    buildings = list(park['buildings'])
    for tile in region['tiles']:
        buildings.extend(json.loads((ROOT/'public'/tile['url'].lstrip('/')).read_text())['buildings'])
    roads = park['roads'] + region['roads']
    paths = park['paths'] + [line for site in sites for line in site['paths']]
    areas = [('park',park['bounds'],GEO/'aerial.jpg',1024,0,2048,park['landmarks'])]
    for i, site in enumerate(sites):
        areas.append((site['id'],site['bounds'],GEO/'courses'/(site['id']+'.jpg'),512,
                      1024 + i%2*512,2048 + i//2*512,site['landmarks']))
    areas.append(('region',region['bounds'],GEO/'region-aerial.jpg',2048,0,0,[]))
    atlas = Image.new('L', (2048, 3584))
    catalog = []
    for name, bounds, photo, size, x, y, landmarks in areas:
        def nearby(features):
            for f in features:
                xs, zs = zip(*f['points'])
                if max(xs)>=bounds['minX']-15 and min(xs)<=bounds['maxX']+15 and max(zs)>=bounds['minZ']-15 and min(zs)<=bounds['maxZ']+15:
                    yield f
        mask = grass_mask(photo, bounds, size, nearby(roads), nearby(paths), nearby(buildings),
                          nearby(park['water']), landmarks)
        atlas.paste(mask, (x,y))
        catalog.append(dict(id=name,bounds=bounds,size=size,x=x,y=y))
    # Four indices fit in two bits per pixel. Keep browser decoding on the PNG path.
    atlas = atlas.convert('P')
    atlas.putpalette([v for i in range(4) for v in [i*85]*3])
    atlas.save(SCENERY/'grass-cover.png', bits=2, optimize=True)
    (ROOT/'src/world/grass-areas.json').write_text(json.dumps(catalog, separators=(',', ':'))+'\n')


if __name__ == '__main__':
    write_grass()
    write_masks()
