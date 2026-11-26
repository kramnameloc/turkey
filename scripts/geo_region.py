"""Build regional streaming tiles, aerial imagery and elevation for Broomfield.

Requires Pillow to decode the USGS float TIFF. Supply --cache to reuse public
source downloads. Run after geo_export.py when refreshing both levels of detail.
"""
from argparse import ArgumentParser
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import time

from PIL import Image
from geo_export import BASE, CITY, USGS, BUILDING_HEIGHTS, TREE_HEIGHTS, ROAD_WIDTHS, get_bytes, local, mx, my, scale, clip_line, clip_ring

MIN_X, MAX_X, MIN_Z, MAX_Z = -8600, 10600, -15400, 3800
BOUNDS = {'minX': MIN_X, 'maxX': MAX_X, 'minZ': MIN_Z, 'maxZ': MAX_Z}
TILE = 1200
INTERVAL = 150
COLUMNS = 129
DEM = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
FIELDS = {
    'BuildingFootprints': 'OBJECTID,BUILDING_TYPE,PLACE_NAME,STATUS', 'Streets': 'OBJECTID,FUNCTIONAL_CLASS,FULL_STREETNAME,STREET_STATUS',
    'Forestry': 'OBJECTID,TYPE,COMMON_NAME,HEIGHT,STATUS', 'PlaceNames': 'OBJECTID,FEATURE_TYPE,LANDMARK_NAME,FLAG'}


def envelope(padding=0):
    return ','.join(f'{a:.6f}' for a in (mx + (MIN_X-padding)/scale, my - (MAX_Z+padding)/scale,
                                         mx + (MAX_X+padding)/scale, my - (MIN_Z-padding)/scale))


def download(cache, name, url, params):
    path = cache / name
    if path.is_file():
        return path.read_bytes()
    for attempt in range(3):
        try:
            raw = get_bytes(url, params)
            if raw.startswith(b'{') and 'error' in json.loads(raw):
                raise ValueError(json.loads(raw)['error'])
            path.write_bytes(raw)
            return raw
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def download_layer(cache, layer):
    url = CITY + layer + '/FeatureServer/0/query'
    params = {'f':'json','where':'1=1','outFields':FIELDS[layer], 'geometryType':'esriGeometryEnvelope','geometry':envelope(),
              'inSR':3857,'outSR':3857,'returnGeometry':'true','spatialRel':'esriSpatialRelIntersects', 'geometryPrecision':1,
              'orderByFields':'OBJECTID','resultRecordCount':2000}
    if layer in ('Streets', 'BuildingFootprints'):
        params['maxAllowableOffset'] = 2.4 if layer == 'Streets' else 1.8
    result = []
    while True:
        params['resultOffset'] = len(result)
        raw = download(cache, f'{layer}-{len(result)}.json', url, params)
        page = json.loads(raw)
        result.extend(page['features'])
        if not page.get('exceededTransferLimit'):
            break
        if not page['features']:
            raise ValueError(f'Empty page while fetching {layer}')
    print(f'{layer}: {len(result)} features', flush=True)
    return result


def download_aerial(cache):
    params = {'f': 'image','bbox':envelope(),'bboxSR':3857,'imageSR':3857,'size':'4096,4096','format':'jpg'}
    raw = download(cache, 'region.jpg', USGS + '/export', params)
    with Image.open(io.BytesIO(raw)) as image:
        assert image.size == (4096, 4096) and image.format == 'JPEG'
        image.save(BASE / 'region-aerial.jpg', format='JPEG', quality=82, optimize=True)


def download_elevation(cache):
    params = {'f':'image','bbox':envelope(INTERVAL/2),'bboxSR':3857,'imageSR':3857,'size':f'{COLUMNS},{COLUMNS}',
              'format':'tiff','pixelType':'F32','renderingRule':'{"rasterFunction":"None"}','interpolation':'RSP_BilinearInterpolation'}
    raw = download(cache, 'elevation.tif', DEM + '/exportImage', params)
    with Image.open(io.BytesIO(raw)) as image:
        assert image.size == (COLUMNS,COLUMNS) and image.mode == 'F'
        values = [round(float(h), 1) for h in image.get_flattened_data()]
    if min(values) < 1000 or max(values) > 2500:
        raise ValueError('Elevation samples outside expected terrain range')
    fx, fz = -MIN_X / INTERVAL, -MIN_Z / INTERVAL
    ix, iz = int(fx), int(fz)
    v = sum(values[(iz + dz)*COLUMNS + ix + dx] * (1-abs(dx-(fx-ix))) * (1-abs(dz-(fz-iz))) for dx in (0,1) for dz in (0,1))
    return {'bounds':BOUNDS,'columns':COLUMNS,'rows':COLUMNS,'values':values,'originMeters':round(v,1)}


def rounded(point):
    return list(map(round, local(point)))


def inside(x, z):
    return MIN_X <= x <= MAX_X and MIN_Z <= z <= MAX_Z


def tile_id(x, z):
    return min(15, max(0, (x - MIN_X) // TILE)), min(15, max(0, (z - MIN_Z) // TILE))


def save(path, data):
    path.write_text(json.dumps(data, separators=(',', ':')) + '\n')


def outside_core(points, polygon):
    """Emit only geometry outside the detailed core, clipped to the region."""
    xs, zs = zip(*points)
    within_region = min(xs) >= MIN_X and max(xs) <= MAX_X and min(zs) >= MIN_Z and max(zs) <= MAX_Z
    if within_region and (min(xs) >= 680 or max(xs) <= -680 or min(zs) >= 680 or max(zs) <= -680):
        yield points
        return
    if max(max(xs), -min(xs), max(zs), -min(zs)) <= 680:
        return
    rectangles = [(MIN_X, -680, MIN_Z, MAX_Z), (680, MAX_X, MIN_Z, MAX_Z),
                  (-680, 680, MIN_Z, -680), (-680, 680, 680, MAX_Z)]
    for extent in rectangles:
        if polygon:
            ring = clip_ring(points, extent)
            if len(set(map(tuple, ring))) >= 3:
                yield ring
        else:
            yield from clip_line(points, extent)


def build_geometry(features):
    tiles = defaultdict(lambda: {'buildings': [], 'trees': []})
    for feature in features['BuildingFootprints']:
        attrs = feature['attributes']
        if attrs['STATUS'] != 'Active' or not feature.get('geometry'):
            continue
        for ring in feature['geometry']['rings']:
            points = list(map(rounded, ring))
            if points and points[0] == points[-1]:
                points.pop()
            if len(set(map(tuple, points))) < 3:
                continue
            # Clockwise ArcGIS shells become positive-area rings in x/east, z/south.
            # Skip interior rings so courtyards never become independent buildings.
            signed_area = sum(x*bz-bx*z for (x,z), (bx,bz) in zip(points,points[1:]+points[:1]))
            if signed_area <= 0:
                continue
            for part in outside_core(points, polygon=True):
                x, z = [round(sum(axis)/len(axis)) for axis in zip(*part)]
                tiles[tile_id(x, z)]['buildings'].append({'points':part, 'type':attrs['BUILDING_TYPE'],
                    'height':BUILDING_HEIGHTS.get(attrs['BUILDING_TYPE'], 5), 'name':(attrs['PLACE_NAME'] or '').strip()})
    for feature in features['Forestry']:
        attrs, geom = feature['attributes'], feature.get('geometry')
        if attrs['STATUS'] != 'Active' or not geom:
            continue
        x, z = rounded([geom['x'], geom['y']])
        if inside(x, z) and max(abs(x), abs(z)) > 680:
            tiles[tile_id(x, z)]['trees'].append({'x':x, 'z':z, 'type':attrs['TYPE'] or 'Deciduous',
                'species':attrs['COMMON_NAME'] or '', 'height':TREE_HEIGHTS.get(attrs['HEIGHT'], 6)})
    return tiles


def regional_roads(features):
    roads = []
    for feature in features:
        attrs, geom = feature['attributes'], feature.get('geometry')
        kind = attrs['FUNCTIONAL_CLASS']
        if not geom or attrs['STREET_STATUS'] != 'Constructed' or kind in ('Parking Lot', 'Private'):
            continue
        for path in geom['paths']:
            points = list(map(rounded, path))
            if len(set(map(tuple, points))) < 2:
                continue
            for part in outside_core(points, polygon=False):
                roads.append({'points':part, 'name':attrs['FULL_STREETNAME'] or '', 'type':kind, 'width':ROAD_WIDTHS.get(kind, 7)})
    return roads


def regional_places(features):
    places = []
    seen = set()
    for feature in features:
        attrs, geom = feature['attributes'], feature.get('geometry')
        if attrs['FLAG'] != 'Visible' or not geom or not attrs['LANDMARK_NAME']:
            continue
        x, z = rounded([geom['x'], geom['y']])
        name = attrs['LANDMARK_NAME'].strip()
        if inside(x,z) and max(abs(x), abs(z)) > 680 and (name, x, z) not in seen:
            places.append({'x':x, 'z':z, 'name':name, 'type':attrs['FEATURE_TYPE']})
            seen.add((name, x, z))
    return places


def convert(cache):
    cache.mkdir(parents=True, exist_ok=True)
    tile_dir = BASE / 'region'
    tile_dir.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as executor:
        layers = {name: executor.submit(download_layer, cache, name) for name in FIELDS}
        aerial = executor.submit(download_aerial, cache)
        elevation = executor.submit(download_elevation, cache)
        features = {name: job.result() for name, job in layers.items()}
        aerial.result()
        heights = elevation.result()
    tiles = build_geometry(features)
    region = {'bounds':BOUNDS, 'orthophoto':{'url':'/geo/region-aerial.jpg', 'bounds':BOUNDS},
              'roads':regional_roads(features['Streets']), 'landmarks':regional_places(features['PlaceNames']),
              'tiles':[], 'elevation':heights}
    for (col, row), data in sorted(tiles.items()):
        x, z = MIN_X + col*TILE, MIN_Z + row*TILE
        name = f'{col}-{row}.json'
        save(tile_dir / name, data)
        region['tiles'].append({'bounds':{'minX':x, 'maxX':x+TILE, 'minZ':z, 'maxZ':z+TILE}, 'url':'/geo/region/'+name})
    save(BASE/'region.json', region)
    print(f'{len(tiles)} tiles, {len(region["roads"])} streets, {len(region["landmarks"])} places, terrain {min(heights["values"])} to {max(heights["values"])} m', flush=True)


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    convert(parser.parse_args().cache)
