"""Build seven game-scale Broomfield landmarks from city outlines, 3DEP and photos.

Run geo_scale.py first to populate the shared survey cache. Put the two CC0
originals named below in --cache. Requires NumPy, SciPy and Pillow.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from survey_roof import sample_roof

from brunner_farmhouse import farmhouse, pergola
from landmark_materials import farm_materials, library_materials
from landmark_mesh import Mesh, write_glb

PUBLIC = Path(__file__).resolve().parents[1] / "public"
LIBRARY = "Mamie Doud Eisenhower Public Library"
CIVIC = [
    LIBRARY,
    "City & County Broomfield",
    "Broomfield Municipal Court",
    "U.S. Post Office",
    "North Metro Fire Rescue Headquarters",
]
PHOTO_NAMES = [
    "Entrance_to_the_Broomfield_Library_and_Auditorium.jpg",
    "The_back_of_the_Broomfield_Library_and_Auditorium_building.jpg",
]


def civic_mesh(building, survey, aerial_bounds):
    ring, points, triangles, edge_ids, heights, center = sample_roof(building, survey)
    library = building["name"] == LIBRARY
    if library:
        # The 2020 returns include trees and ground beside the reading terrace.
        # Fit the two perpendicular roof pitches and the shared flat deck using
        # the interior scan profiles. Keep the low end annexes at their own eaves.
        along = (points[:, 0] + 10) * 0.545 - (points[:, 1] - 96) * 0.838
        across = (points[:, 0] + 10) * 0.838 + (points[:, 1] - 96) * 0.545
        auditorium = 13.55 - 0.67 * np.abs(along + 21.45)
        annex = 6.8 - 0.59 * np.abs(across)
        north_pitch = np.minimum(14.3 - 0.58 * np.abs(across + 5), 9.65 + np.maximum(along - 9, 0))
        heights = np.maximum(9.65, north_pitch)
        heights = np.where(along < -12.5, np.maximum(auditorium, annex), heights)
        heights = np.where(along > 33.3, 5.25, heights)
        lobby = (np.abs(along + 1.3) < 5) & (across > 12)
        heights[lobby] = 10.75
    # A stable, interior anchor also identifies the corresponding runtime footprint.
    anchor = center.round(3)
    mesh = Mesh(building["name"], anchor)
    vertices = [(x - anchor[0], float(y), z - anchor[1]) for (x, z), y in zip(points, heights)]
    left, top, right, bottom = aerial_bounds
    roof_uv = [((x - left) / (right - left), (z - top) / (bottom - top)) for x, z in points]
    for tri in triangles:
        # Delaunay's winding in the east/south plane faces down in Three.js.
        order = tri[::-1]
        mesh.face("RoofAerial", [vertices[i] for i in order], [roof_uv[i] for i in order])
    for i, edge in enumerate(edge_ids):
        j = (i + 1) % len(edge_ids)
        a, b = ring[edge], ring[(edge + 1) % len(ring)]
        length = np.linalg.norm(b - a)
        start, end = (np.linalg.norm(points[k] - a) for k in (i, j))
        name = "CivicBay"
        low = -4.0
        if library:
            name = "LibraryBay"
            # Pick facade directions from their local coordinates, so the
            # facade assignment survives city ring reordering.
            mid = (a + b) / 2 - [-10, 96]
            u, v = mid @ np.array([[0.545, 0.838], [-0.838, 0.545]])
            if -25 < u < -17 and abs(v) > 15 and length > 14:
                name = "EntryGable" if v > 0 else "ParkGable"
            elif abs(u) < 8 and v > 11:
                name = "LobbyGlass"

        def wall_uv(k, distance, h):
            if name in ("EntryGable", "ParkGable"):
                u = (points[k, 0] + 10) * 0.545 - (points[k, 1] - 96) * 0.838
                left, right = (-30.7, -12.6) if name == "EntryGable" else (-30.1, -13.9)
                s = float(np.clip((u - left) / (right - left), 0.001, 0.999))
                return (s if name == "EntryGable" else 1 - s, 1 - h / 13.65)
            if name == "LibraryBay":
                return (distance / 6, 1 - h / 9.7)
            return (
                distance / (4 if name == "LobbyGlass" else 8),
                -h / (3.6 if name == "LobbyGlass" else 7),
            )

        x, y, z = vertices[i]
        bx, by, bz = vertices[j]
        mesh.face(
            name,
            [(x, low, z), (bx, low, bz), (bx, by, bz), (x, y, z)],
            [wall_uv(i, start, low), wall_uv(j, end, low), wall_uv(j, end, by), wall_uv(i, start, y)],
        )
    print(f"{mesh.name}: {len(triangles)} roof triangles")
    return mesh


def export(cache):
    park = json.loads((PUBLIC / "geo/broomfield.json").read_bytes())
    selected = [next(b for b in park["buildings"] if b["name"] == name) for name in CIVIC]
    survey = np.load(cache / "course-survey-depth9.npz")["points"]
    # Crop all five actual roofs together at the resolution of the park orthophoto.
    photo = Image.open(PUBLIC / "geo/aerial.jpg")
    bounds = park["bounds"]
    scale = photo.width / (bounds["maxX"] - bounds["minX"])
    pts = np.concatenate([b["points"] for b in selected])
    origin = np.array([bounds["minX"], bounds["minZ"]])
    start = np.floor((pts.min(axis=0) - origin) * scale - 2).astype(int)
    stop = np.ceil((pts.max(axis=0) - origin) * scale + 2).astype(int)
    aerial_bounds = (*list(start / scale + origin), *list(stop / scale + origin))
    images = dict(
        RoofAerial=photo.crop((*start, *stop)),
        CivicBay=Image.open(PUBLIC / "scenery/civic-facade.webp"),
    )
    images.update(
        library_materials(
            *(
                ImageOps.exif_transpose(Image.open(cache / name)).convert("RGB")
                for name in PHOTO_NAMES
            )
        )
    )
    images.update(farm_materials())
    models = [civic_mesh(b, survey, aerial_bounds) for b in selected] + [farmhouse(), pergola()]
    colors = dict(
        PorchWhite="e6e2d5", Sash="37424b", Door="755c46", Foundation="998c7a", ChimneyBrick="8c5945"
    )
    write_glb(PUBLIC / "models/broomfield-landmarks.glb", models, images, colors)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    export(parser.parse_args().cache)
