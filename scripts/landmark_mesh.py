"""Small indexed, textured glTF mesh writer for the surveyed landmarks."""

from collections import defaultdict
import io
import json
import struct

import numpy as np


class Mesh:
    def __init__(self, name, anchor, footprint_name=None):
        self.name = name
        self.anchor = list(anchor)
        self.extras = dict(
            anchor=self.anchor, footprintName=name if footprint_name is None else footprint_name
        )
        self.parts = defaultdict(list)

    def face(self, material, vertices, uv=None):
        uv = uv or [(0, 1), (1, 1), (1, 0), (0, 0)][: len(vertices)]
        for i in range(1, len(vertices) - 1):
            self.parts[material].extend(tuple(vertices[j]) + tuple(uv[j]) for j in (0, i, i + 1))

    def box(self, material, center, size):
        x, y, z = center
        a, b, c = (n / 2 for n in size)
        p = [
            (x + i * a, y + j * b, z + k * c)
            for i, j, k in [
                (-1, -1, -1),
                (1, -1, -1),
                (1, 1, -1),
                (-1, 1, -1),
                (-1, -1, 1),
                (1, -1, 1),
                (1, 1, 1),
                (-1, 1, 1),
            ]
        ]
        for face in [
            (3, 2, 1, 0),
            (4, 5, 6, 7),
            (0, 4, 7, 3),
            (5, 1, 2, 6),
            (3, 7, 6, 2),
            (0, 1, 5, 4),
        ]:
            self.face(material, [p[i] for i in face])


def write_glb(path, models, images, colors):
    blob = bytearray()
    views, accessors, materials, textures, pictures, meshes, nodes = [], [], [], [], [], [], []

    def append(raw):
        blob.extend(bytes(-len(blob) % 4))
        views.append(dict(buffer=0, byteOffset=len(blob), byteLength=len(raw)))
        blob.extend(raw)
        return len(views) - 1

    names = list(images) + list(colors)
    for name in names:
        pbr = dict(metallicFactor=0, roughnessFactor=0.88)
        if name in images:
            img = io.BytesIO()
            images[name].convert("RGB").save(img, "JPEG", quality=87, optimize=True)
            pbr["baseColorTexture"] = dict(index=len(textures))
            textures.append(
                dict(
                    source=len(pictures),
                    sampler=int(name in ("EntryGable", "ParkGable", "LibraryBay")),
                )
            )
            pictures.append(dict(name=name, mimeType="image/jpeg", bufferView=append(img.getvalue())))
        else:
            rgb = np.array(list(bytes.fromhex(colors[name]))) / 255.0
            linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
            pbr["baseColorFactor"] = [*linear, 1.0]
        materials.append(dict(name=name, pbrMetallicRoughness=pbr, doubleSided=True))

    def attribute(a, kind, component):
        acc = dict(bufferView=append(a.tobytes()), componentType=component, count=len(a), type=kind)
        if kind == "VEC3":
            acc.update(min=a.min(axis=0).tolist(), max=a.max(axis=0).tolist())
        accessors.append(acc)
        return len(accessors) - 1

    for mesh in models:
        primitives = []
        for name, rows in mesh.parts.items():
            # Preserve hard edges on roofs, trim and sills across material seams.
            data = np.array(rows, dtype="<f4").reshape(-1, 3, 5)
            normals = np.cross(data[:, 1, :3] - data[:, 0, :3], data[:, 2, :3] - data[:, 0, :3])
            lengths = np.linalg.norm(normals, axis=1)
            valid = lengths > 1e-6
            normals = np.repeat((normals[valid] / lengths[valid, None])[:, None, :], 3, axis=1)
            full = np.concatenate((data[valid], normals), axis=2).reshape(-1, 8).round(5)
            vertices, indices = np.unique(full, axis=0, return_inverse=True)
            attrs = dict(
                POSITION=attribute(vertices[:, :3], "VEC3", 5126),
                NORMAL=attribute(vertices[:, 5:], "VEC3", 5126),
            )
            if name in images:
                attrs["TEXCOORD_0"] = attribute(vertices[:, 3:5], "VEC2", 5126)
            if len(vertices) > 65535:
                raise ValueError("Landmark exceeds 16-bit vertex budget")
            primitives.append(
                dict(
                    attributes=attrs,
                    indices=attribute(indices.ravel().astype("<u2"), "SCALAR", 5123),
                    material=names.index(name),
                )
            )
        nodes.append(dict(name=mesh.name, mesh=len(meshes), extras=mesh.extras))
        meshes.append(dict(name=mesh.name, primitives=primitives))
    doc = dict(
        asset=dict(version="2.0", generator="Turkey Takeover landmark exporter"),
        scene=0,
        scenes=[dict(nodes=list(range(len(nodes))))],
        nodes=nodes,
        meshes=meshes,
        materials=materials,
        samplers=[dict(wrapS=10497, wrapT=10497), dict(wrapS=10497, wrapT=33071)],
        textures=textures,
        images=pictures,
        buffers=[dict(byteLength=len(blob))],
        bufferViews=views,
        accessors=accessors,
    )
    manifest = json.dumps(doc, separators=(",", ":")).encode()
    manifest += b" " * (-len(manifest) % 4)
    blob.extend(bytes(-len(blob) % 4))
    path.write_bytes(
        struct.pack("<4sIIII", b"glTF", 2, 28 + len(manifest) + len(blob), len(manifest), 0x4E4F534A)
        + manifest
        + struct.pack("<II", len(blob), 0x004E4942)
        + blob
    )
