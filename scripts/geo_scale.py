"""Estimate roof and tree heights from 2020 USGS lidar at playable Broomfield sites.

Requires numpy, scipy, rasterio, laspy and lazrs. Run after the city GIS exports:
python scripts/geo_scale.py --cache /tmp/flappy-region-cache
"""
from argparse import ArgumentParser
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

import laspy
import numpy as np
from rasterio.features import geometry_mask
from affine import Affine
from scipy.ndimage import binary_erosion
from scipy.spatial import cKDTree

from geo_export import BASE, mx, my, scale

SOURCE = 'https://usgs-lidar-public.s3.amazonaws.com/CO_DRCOG_2_2020/'
# Each site is a bounded rectangle of local ground meters. Trees and roofs outside
# the lidar coverage retain the city's height classes and building-use estimates.
SITES = [(-690, 690, -690, 690), (-437, 283, -1188, -468),
         (1167, 1887, -2202, -1482), (775, 1495, -1348, -628)]


def cached(cache, name):
    dest = cache / name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix('.part')
        subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '45',
                        SOURCE + name, '-o', str(temp)], check=True)
        temp.replace(dest)
    return dest


def point_blocks(cache):
    info = json.loads(cached(cache, 'ept.json').read_bytes())
    xmin, ymin, zmin, xmax, ymax, zmax = info['bounds']
    def wanted(key):
        depth, x, y, z = map(int, key.split('-'))
        if depth > 9:
            return False
        side = (xmax - xmin) / (2 ** depth)
        # Block Z is NAVD88 orthometric elevation; this broad range covers all buildings/trees.
        if zmin + z * side > 1840 or zmin + (z + 1) * side < 1480:
            return False
        left = (xmin + x * side - mx) * scale
        bottom = (my - ymin - y * side) * scale
        return any(left <= e and left + side * scale >= w and bottom >= n and
                   bottom - side * scale <= s for w, e, n, s in SITES)
    pending, blocks = ['0-0-0-0'], []
    while pending:
        root = pending.pop()
        layer = json.loads(cached(cache, 'ept-hierarchy/' + root + '.json').read_bytes())
        for key, count in layer.items():
            if wanted(key):
                if count == -1:
                    pending.append(key)
                elif count > 0:
                    blocks.append(key)
    print(f'Reading {len(blocks)} survey blocks', flush=True)
    def read(key):
        chunk = laspy.read(cached(cache, 'ept-data/' + key + '.laz'))
        x, z = (np.asarray(chunk.x) - mx) * scale, (my - np.asarray(chunk.y)) * scale
        keep = np.zeros(len(x), dtype=bool)
        for w, e, n, s in SITES:
            keep |= (x >= w) & (x <= e) & (z >= n) & (z <= s)
        category = np.asarray(chunk.classification)
        keep &= np.isin(category, [1, 2, 3, 4, 5, 6])
        return np.column_stack((x[keep], z[keep], np.asarray(chunk.z)[keep], category[keep]))
    with ThreadPoolExecutor(10) as pool:
        return np.concatenate(list(pool.map(read, blocks)))


def world_points(tree):
    return [tree['x'], tree['z']]


def export(cache):
    cache.mkdir(parents=True, exist_ok=True)
    file = cache / 'course-survey-depth9.npz'
    if not file.exists():
        points = point_blocks(cache)
        np.savez_compressed(file, points=points.astype(np.float32))
    else:
        points = np.load(file)['points']
    ground = points[points[:, 3] == 2]
    objects = points[points[:, 3] != 2]
    if not len(objects) or not len(ground):
        raise ValueError('Survey lacks above-ground or ground returns')
    # Nearby bare-earth laser returns supply a local datum, including on sloping lots.
    _, nearest = cKDTree(ground[:, :2]).query(objects[:, :2], k=3, workers=-1)
    objects[:, 2] -= np.median(ground[nearest, 2], axis=1)
    objects = objects[(objects[:, 2] >= 1.2) & (objects[:, 2] < 70)]
    index = cKDTree(objects[:, :2])
    paths = [BASE / 'broomfield.json', *sorted((BASE / 'region').glob('*.json'))]
    docs = {path: json.loads(path.read_bytes()) for path in paths}
    all_trees = [t for data in docs.values() for t in data['trees']]
    tree_index = cKDTree([world_points(t) for t in all_trees])
    _, owners = tree_index.query(objects[:, :2], workers=-1)
    tree_ids = {id(tree): i for i, tree in enumerate(all_trees)}
    # Regional rows store the same representative class heights as the core.
    # Accept historic crowns only where the sample agrees with a reported band.
    bands = {3.5: (0, 4.57), 7: (4.57, 9.15), 11.5: (9.15, 13.72), 15.5: (13.72, 34)}
    # A newer planting may occupy the same mapped location as a former mature tree.
    tree_dates = {}
    raw = cache / 'turkey-broomfield-data-Forestry.json'
    if not raw.exists():
        from geo_export import features
        features('Forestry', cache)
    from geo_export import local
    for feature in json.loads(raw.read_bytes())['features']:
        geom, attrs = feature['geometry'], feature['attributes']
        tree_dates[tuple(local([geom['x'], geom['y']]))] = attrs.get('PLANT_DATE') or 0
    mapped_roof = np.zeros(len(objects), dtype=bool)
    stats = Counter()
    for data in docs.values():
        for building in data['buildings']:
            building.pop('roofHeight', None)
            polygon = np.array(building['points'])
            left, top = polygon.min(axis=0)
            right, bottom = polygon.max(axis=0)
            center = [(left + right) / 2, (top + bottom) / 2]
            if not any(w < left and right < e and n < top and bottom < s for w, e, n, s in SITES):
                continue
            ids = np.array(index.query_ball_point(center, np.hypot(right - left, bottom - top) / 2))
            if not len(ids): continue
            # Rasterize the GIS polygon at one meter. Inset by one cell so a
            # tree overhanging a wall contributes fewer hits to the roof sample.
            origin = np.floor([left, top]) - 1
            shape = np.ceil([bottom - origin[1], right - origin[0]]).astype(int) + 1
            mask = geometry_mask([{'type': 'Polygon', 'coordinates': [building['points']]}], shape,
                                 Affine.translation(*origin), invert=True)
            cells = np.floor(objects[ids, :2] - origin).astype(int)
            valid = (cells[:, 0] >= 0) & (cells[:, 1] >= 0) & (cells[:, 0] < shape[1]) & (cells[:, 1] < shape[0])
            ids, cells = ids[valid], cells[valid]
            mapped_roof[ids[mask[cells[:, 1], cells[:, 0]]]] = True
            inside = ids[binary_erosion(mask)[cells[:, 1], cells[:, 0]]]
            roof = objects[inside]
            classified = roof[roof[:, 3] == 6]
            if len(classified) >= 8: roof = classified
            else: roof = roof[np.isin(roof[:, 3], [1, 6])]
            if len(roof) < 8: continue
            h = np.percentile(roof[:, 2], 85)
            if 2.5 <= h <= 60:
                building['roofHeight'] = round(float(h), 1)
                stats['roofs'] += 1
    for data in docs.values():
        for tree in data['trees']:
            tree.pop('surveyHeight', None)
            center = world_points(tree)
            if tree_dates.get(tuple(center), 0) >= 1591920000000: continue
            if not any(w+4 < center[0] < e-4 and n+4 < center[1] < s-4 for w,e,n,s in SITES): continue
            ids = np.asarray(index.query_ball_point(center, max(2.3, min(6.5, tree['height'] * 0.44))), dtype=int)
            ids = ids[(owners[ids] == tree_ids[id(tree)]) & ~mapped_roof[ids] & (objects[ids, 3] != 6)]
            if len(ids) < 4: continue
            h = np.percentile(objects[ids, 2], 95)
            lower, upper = bands.get(tree['height'], (0, 34))
            if max(2.0, lower) <= h < upper:
                tree['surveyHeight'] = round(float(h), 1)
                stats['trees'] += 1
    for p, data in docs.items():
        output = json.dumps(data, separators=(',', ':')) + '\n'
        if output != p.read_text():
            p.write_text(output)
    print(stats)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    export(parser.parse_args().cache)
