"""Refresh the higher-detail imagery and trails for the regional hunting grounds."""
import concurrent.futures
import json
from pathlib import Path

from geo_export import BASE, CITY, USGS, PATH_WIDTHS, clip_line, get_bytes, local, mx, my, scale

SITES = [
    ('brunner', -77, -828), ('commons', 1527, -1842), ('dover', 1135, -988),
    ('flatiron', -5500, -1420), ('northmoor', 876, -2127), ('derda', 2710, -1727),
]
OUT = BASE / 'courses'

def export_site(site):
    name, x, z = site
    left, right, top, bottom = x - 360, x + 360, z - 360, z + 360
    bbox = ','.join(str(v) for v in (mx + left/scale, my - bottom/scale, mx + right/scale, my - top/scale))
    image = get_bytes(USGS + '/export', dict(bbox=bbox, bboxSR=3857, imageSR=3857,
                      size='1024,1024', format='jpg', f='image'))
    if image[:2] != b'\xff\xd8':
        raise ValueError('Missing orthophoto for ' + name)
    attrs = 'STATUS,TRAIL_TYPE,WIDTH,SITE_NAME,ALTERNATE_NAME'
    query = dict(f='json', where="STATUS='EXISTING'", geometry=bbox,
                 geometryType='esriGeometryEnvelope', inSR=3857, outSR=3857,
                 spatialRel='esriSpatialRelIntersects', outFields=attrs,
                 geometryPrecision=2, returnGeometry='true')
    data = json.loads(get_bytes(CITY + 'Trails/FeatureServer/0/query', query))
    if data.get('exceededTransferLimit') or 'features' not in data:
        raise ValueError('Incomplete trails for ' + name)
    paths = []
    for f in data['features']:
        a = f['attributes']
        typ = a['TRAIL_TYPE']
        width = round(a['WIDTH'] * 0.3048, 1) if a['WIDTH'] else PATH_WIDTHS.get(typ, 2)
        for line in f['geometry']['paths']:
            for points in clip_line(list(map(local, line)), (left, right, top, bottom)):
                paths.append(dict(points=points, width=width, type=typ, name=a['SITE_NAME'] or a['ALTERNATE_NAME'] or ''))
    query.update(where='1=1', outFields='AMENITY_TYPE,SPECIFIC_NAME')
    amenities = json.loads(get_bytes(CITY + 'OpenspaceParksTrails/FeatureServer/1/query', query))
    landmarks = []
    for feature in amenities['features']:
        geometry, a = feature['geometry'], feature['attributes']
        px, pz = local((geometry['x'], geometry['y']))
        if a['SPECIFIC_NAME'] and left < px < right and top < pz < bottom:
            landmarks.append(dict(x=px,z=pz,type=a['AMENITY_TYPE'],name=a['SPECIFIC_NAME']))
    (OUT / (name + '.jpg')).write_bytes(image)
    return dict(id=name, bounds=dict(minX=left,maxX=right,minZ=top,maxZ=bottom), paths=paths, landmarks=landmarks)

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        courses = list(pool.map(export_site, SITES))
    (OUT / 'maps.json').write_text(json.dumps(courses, separators=(',', ':')) + '\n')
    for c in courses:
        print(c['id'], len(c['paths']), 'trail segments')
