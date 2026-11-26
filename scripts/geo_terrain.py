"""Sample public USGS 3DEP bare-earth elevations for the park and later courses.

Requires rasterio. Run: python scripts/geo_terrain.py --cache /tmp/flappy-region-cache
"""
from argparse import ArgumentParser
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds, Window

from geo_export import BASE, mx, my, scale

SOURCE = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n40w106/USGS_13_n40w106.tif'
BOUNDS = {'minX': -800, 'maxX': 2020, 'minZ': -2320, 'maxZ': 800}
INTERVAL = 10


def export(cache):
    cache.mkdir(parents=True, exist_ok=True)
    patch = cache / 'course-sites-3dep.tif'
    b = BOUNDS
    cols = (b['maxX'] - b['minX']) // INTERVAL + 1
    rows = (b['maxZ'] - b['minZ']) // INTERVAL + 1
    pixel = INTERVAL / scale
    transform = from_origin(mx + b['minX'] / scale - pixel / 2,
                            my - b['minZ'] / scale + pixel / 2, pixel, pixel)
    if not patch.is_file():
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
            with rasterio.open('/vsicurl/' + SOURCE) as src:
                # Read only the necessary tiles and retain a source pixel halo for bilinear interpolation.
                box = rasterio.transform.array_bounds(rows, cols, transform)
                raw = from_bounds(*transform_bounds('EPSG:3857', src.crs, *box), src.transform)
                window = Window(int(raw.col_off) - 2, int(raw.row_off) - 2, int(raw.width) + 6, int(raw.height) + 6)
                array = src.read(1, window=window)
                with rasterio.open(patch, 'w', driver='GTiff', count=1, width=array.shape[1], height=array.shape[0],
                                   dtype=array.dtype, transform=src.window_transform(window), crs=src.crs, nodata=src.nodata) as dst:
                    dst.write(array, 1)
    grid = np.zeros((rows, cols), dtype=np.float32)
    with rasterio.open(patch) as src:
        reproject(rasterio.band(src, 1), grid, dst_crs='EPSG:3857', dst_transform=transform,
                  resampling=Resampling.bilinear, dst_nodata=-9999)
    if not (1500 < grid.min() < grid.max() < 1800):
        raise ValueError('Missing or implausible bare-earth samples')
    data = {'bounds': b, 'columns': cols, 'rows': rows, 'values': [round(float(h), 1) for h in grid.flat]}
    (BASE / 'park-elevation.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(f'{cols} × {rows} at {INTERVAL} m; {grid.min():.1f}–{grid.max():.1f} m above sea level')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    export(parser.parse_args().cache)
