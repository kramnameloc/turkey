"""Export the Community Park scene from Broomfield GIS and USGS orthoimagery.

Run `python3 scripts/geo_export.py` to refresh bundled data. An optional
`--cache DIRECTORY` reuses downloaded ArcGIS query responses for repeat builds.
"""
import argparse
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent.parent / 'public' / 'geo'
CITY = 'https://services1.arcgis.com/vXSRPZbyyOmH9pek/arcgis/rest/services/'
USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer'
LAT, LON, HALF = 39.9185, -105.0688, 680
R = 6378137
scale = math.cos(math.radians(LAT))
mx = R * math.radians(LON)
my = R * math.asinh(math.tan(math.radians(LAT)))
half_projected = HALF / scale
envelope = [mx - half_projected, my - half_projected, mx + half_projected, my + half_projected]
bbox_string = ','.join(f'{n:.7f}' for n in envelope)
bounds = {'minX': -HALF, 'maxX': HALF, 'minZ': -HALF, 'maxZ': HALF}


def local(point):
    return [round((point[0] - mx) * scale, 1), round((my - point[1]) * scale, 1)]


def inside(point):
    return all(-HALF <= a <= HALF for a in point)


def clip_ring(points, extent=(-HALF, HALF, -HALF, HALF)):
    """Sutherland–Hodgman clipping against this scene's square boundary."""
    points = points[:-1] if points[0] == points[-1] else points
    left, right, top, bottom = extent
    for axis, edge, sign in [(0, left, 1), (0, right, -1), (1, top, 1), (1, bottom, -1)]:
        if not points:
            break
        out = []
        a = points[-1]
        for b in points:
            if (a[axis] - edge) * (b[axis] - edge) < 0:
                t = (edge - a[axis]) / (b[axis] - a[axis])
                out.append([round(v + (w - v) * t, 1) for v, w in zip(a, b)])
            if (b[axis] - edge) * sign >= 0:
                out.append(b)
            a = b
        points = out
    return points


def clip_line(points, extent=(-HALF, HALF, -HALF, HALF)):
    """Liang–Barsky segment clipping; preserve genuine breaks between runs."""
    left, right, top, bottom = extent
    runs = []
    for a, b in zip(points, points[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        lo, hi = 0, 1
        for p, q in [(-dx, a[0] - left), (dx, right - a[0]), (-dz, a[1] - top), (dz, bottom - a[1])]:
            if p < 0:
                lo = max(lo, q / p)
            elif p > 0:
                hi = min(hi, q / p)
            elif q < 0:
                hi = -1
        if lo >= hi:
            continue
        start, end = [[round(a[0] + t * dx, 1), round(a[1] + t * dz, 1)] for t in (lo, hi)]
        if start == end:
            continue
        if runs and runs[-1][-1] == start:
            runs[-1].append(end)
        else:
            runs.append([start, end])
    return runs


def get_bytes(url, params):
    request = urllib.request.Request(url + '?' + urllib.parse.urlencode(params), headers={'User-Agent': 'FlappyTurkey-MapExport/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def features(layer, cache):
    cached = cache / ('turkey-broomfield-data-' + layer + '.json') if cache else None
    if cached and cached.exists():
        data = json.loads(cached.read_bytes())
    else:
        params = {'f': 'json', 'where': '1=1', 'geometry': bbox_string, 'geometryType': 'esriGeometryEnvelope', 'inSR': 3857,
                  'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'outSR': 3857, 'geometryPrecision': 2,
                  'returnGeometry': 'true'}
        data = json.loads(get_bytes(CITY + layer + '/FeatureServer/0/query', params))
        if cached and 'features' in data:
            cached.write_text(json.dumps(data))
    if data.get('exceededTransferLimit') or 'features' not in data:
        raise ValueError(f'Incomplete GIS response for {layer}')
    return [(f['attributes'], f['geometry']) for f in data['features']]


BUILDING_HEIGHTS = {'Single Family': 5.5, 'Townhome': 7.5, 'Government': 10, 'Office': 8,
                    'Commercial': 6, 'Apartment': 9, 'Cultural': 10, 'Education': 6, 'Religious': 9,
                    'Recreation': 4, 'Parking': 3, 'Assisted Living': 9, 'Community Center': 8, 'Other': 3.3}
TREE_HEIGHTS = {'less than 15 ft': 3.5, '16 ft - 30 ft': 7, '31 ft - 45 ft': 11.5, 'greater than 45 ft': 15.5}
ROAD_WIDTHS = {'Regional Arterial': 13, 'Minor Arterial': 11, 'Connector': 9, 'Local': 8, 'Parking Lot': 5, 'Private': 6}
PATH_WIDTHS = {'Multi-Use Path': 3, 'Detached Sidewalk': 1.7, 'Attached Sidewalk': 1.7, 'Cross-walk': 3,
               'On-street Bike Lane': 1.5, 'Soft Surface Trail': 1.8}
# Hand-traced shorelines on the north-up USGS image, at a working resolution of 800 × 800.
SHORES = {
    'Community Park Pond': [(406,421),(408,415),(413,409),(418,404),(419,399),(423,394),(431,392),(448,391),(461,391),(467,394),(468,399),(467,411),(467,421),(467,427),(463,430),(457,430),(450,428),(443,430),(434,431),(428,433),(419,431),(413,429),(409,426)],
    'Brunner Reservoir': [(615,218),(622,214),(630,213),(646,207),(662,200),(674,193),(690,186),(703,181),(712,178),(714,181),(713,201),(711,219),(708,242),(704,269),(700,297),(695,331),(690,359),(686,380),(677,380),(656,375),(640,372),(626,368),(618,363),(615,356),(616,341),(617,326),(618,313),(615,296),(617,284),(616,271),(618,257),(615,244),(613,231)]
}


def export(cache, keep_image):
    BASE.mkdir(exist_ok=True, parents=True)
    if cache:
        cache.mkdir(exist_ok=True, parents=True)
    data = {'origin': {'lat': LAT, 'lon': LON}, 'bounds': bounds, 'orthophoto': {'url': '/geo/aerial.jpg', 'bounds': bounds},
            'buildings': [], 'water': [], 'roads': [], 'paths': [], 'trees': [], 'landmarks': []}
    for attrs, geom in features('BuildingFootprints', cache):
        if attrs['STATUS'] != 'Active':
            continue
        for ring in geom['rings']:
            points = clip_ring(list(map(local, ring)))
            if len(points) < 3:
                continue
            kind = attrs['BUILDING_TYPE'] or 'Other'
            data['buildings'].append({'points': points, 'name': (attrs['PLACE_NAME'] or '').strip(), 'type': kind,
                                      'height': BUILDING_HEIGHTS.get(kind, 5)})
    for name, shore in SHORES.items():
        data['water'].append({'name': name, 'points': [[round((coord / 800 * 2 - 1) * HALF, 1) for coord in p] for p in shore]})
    for layer, collection in [('Trails', 'paths'), ('Streets', 'roads')]:
        for attrs, geom in features(layer, cache):
            if collection == 'paths':
                if attrs['STATUS'] != 'EXISTING':
                    continue
                kind = attrs['TRAIL_TYPE']
                width = round(attrs['WIDTH'] * 0.3048, 1) if attrs['WIDTH'] else PATH_WIDTHS.get(kind, 2)
                name = attrs['SITE_NAME'] or attrs['ALTERNATE_NAME']
            else:
                if attrs['STREET_STATUS'] != 'Constructed':
                    continue
                kind = attrs['FUNCTIONAL_CLASS']
                width = ROAD_WIDTHS.get(kind, 7)
                name = attrs['FULL_STREETNAME']
            for line in geom['paths']:
                for part in clip_line(list(map(local, line))):
                    road_or_path = {'points': part, 'type': kind, 'width': width, 'name': name or ''}
                    if collection == 'roads' and attrs.get('ONE_WAY') in ('FT', 'TF'):
                        road_or_path['oneWay'] = True
                    data[collection].append(road_or_path)
    for attrs, geom in features('Forestry', cache):
        x, z = local([geom['x'], geom['y']])
        if inside((x, z)) and attrs['STATUS'] == 'Active':
            data['trees'].append({'x': x, 'z': z, 'type': attrs['TYPE'] or 'Deciduous', 'species': attrs['COMMON_NAME'] or '',
                                  'height': TREE_HEIGHTS.get(attrs['HEIGHT'], 6)})
    seen = set()
    for attrs, geom in features('PlaceNames', cache):
        name = attrs['LANDMARK_NAME']
        x, z = local([geom['x'], geom['y']])
        named_park_features = {'Broomfield Auditorium', 'Broomfield Skate Park', 'Broomfield Amphitheater'}
        visible = attrs['FLAG'] == 'Visible' or name in named_park_features
        if not inside((x, z)) or name.casefold() in seen or not visible:
            continue
        seen.add(name.casefold())
        data['landmarks'].append({'name': name, 'x': x, 'z': z, 'type': attrs['FEATURE_TYPE']})
    if not keep_image:
        image = get_bytes(USGS + '/export', {'bbox': bbox_string, 'bboxSR': 3857, 'imageSR': 3857, 'size': '2048,2048', 'format': 'jpg', 'f': 'image'})
        if image[:2] != b'\xff\xd8':
            raise ValueError('Expected JPEG from USGS')
        (BASE / 'aerial.jpg').write_bytes(image)
    (BASE / 'broomfield.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path)
    parser.add_argument('--keep-image', action='store_true', help='Keep the existing aerial.jpg')
    args = parser.parse_args()
    export(args.cache, args.keep_image)
