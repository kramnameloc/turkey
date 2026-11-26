"""Refresh the georeferenced Dover course imagery from Colorado's CC0 DRAPP tiles."""
import json

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT

from geo_export import BASE, mx, my, scale

TILES = ('N2W176b', 'N2W177a', 'N2W166d', 'N2W167c')
SOURCE = 'https://colorado-public-imagery.s3.us-west-2.amazonaws.com/DRAPP/DRAPP2020/Imagery/'
SIZE = 3072


def export(bounds=None):
    folder = BASE / 'courses'
    if bounds is None:
        bounds = next(s['bounds'] for s in json.loads((folder / 'maps.json').read_text()) if s['id'] == 'dover')
    b = bounds
    transform = from_bounds(mx + b['minX']/scale, my - b['maxZ']/scale,
                            mx + b['maxX']/scale, my - b['minZ']/scale, SIZE, SIZE)
    rgb = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
    covered = np.zeros((SIZE, SIZE), dtype=bool)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='45',
              CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.ovr', GDAL_HTTP_MULTIRANGE='SERIAL'):
        for tile in TILES:
            with rasterio.open(SOURCE + tile + '.tif') as src, WarpedVRT(
                src, crs='EPSG:3857', transform=transform, width=SIZE, height=SIZE,
                resampling=Resampling.bilinear, add_alpha=True
            ) as ortho:
                # Read together so alpha and RGB share the same range requests.
                bands = ortho.read([1, 2, 3, ortho.count])
                valid = bands[3] > 0
                rgb[valid] = np.moveaxis(bands[:3], 0, -1)[valid]
                covered |= valid
                print(tile, round(100 * covered.mean(), 2), '% covered', flush=True)
    if not covered.all():
        raise ValueError('Dover orthophoto is incomplete')
    target = folder / 'dover.jpg'
    temporary = target.with_suffix('.tmp')
    Image.fromarray(rgb).save(temporary, format='JPEG', quality=89, optimize=True)
    temporary.replace(target)


if __name__ == '__main__':
    export()
