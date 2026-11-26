"""Bake the western Front Range from USGS 1-arc-second DEMs and orthoimagery.

Run with Pillow installed: python scripts/geo_peaks.py --cache /tmp/peaks-cache
The cache holds about 200 MB of source data. Only the compact results ship.
"""
from argparse import ArgumentParser
from array import array
from math import atan, degrees, radians, sinh, sqrt, tan
from pathlib import Path
from struct import pack
import sys
from urllib.parse import urlencode
from urllib.request import urlretrieve

from PIL import Image
from geo_export import BASE, USGS, R, mx, my, scale

SCENERY = BASE.parent / "scenery"
WEST, NORTH, STEP = -96900, -87040, 85
WIDTH, HEIGHT = 1025, 2049
STAGED = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current"
GRID = 513


def source(cache, name, url):
    path = cache / name
    if not path.is_file():
        print(f"Downloading {name}", flush=True)
        urlretrieve(url, path)
    return path


def reproject_dem(cache):
    # The six-pixel overlap of these north-up NAD83 rasters extends past
    # the named integer-degree boundary. Read the exact registration tags.
    mosaic = Image.new("F", (7200, 7200))
    for north in (40, 41):
        for west in (-107, -106):
            name = f"n{north}w{-west}"
            path = source(cache, f"turkey-peaks-{name}.tif",
                          f"{STAGED}/{name}/USGS_1_{name}.tif")
            with Image.open(path) as im:
                _, _, _, left, top, _ = im.tag_v2[33922]
                dx, dy, _ = im.tag_v2[33550]
                x, y = round((west-left)/dx), round((top-north)/dy)
                mosaic.paste(im.crop((x, y, x+3600, y+3600)),
                             ((west+107)*3600, (41-north)*3600))

    def pixel_x(x):
        return (degrees((mx + x / scale) / R) + 107) * 3600

    def pixel_y(z):
        return (41 - degrees(atan(sinh((my - z / scale) / R)))) * 3600

    left = pixel_x(WEST - STEP/2)
    right = pixel_x(WEST + STEP*(WIDTH - 0.5))
    mapping = []
    for row in range(0, HEIGHT, 32):
        end = min(row + 32, HEIGHT)
        top, bottom = (pixel_y(NORTH + STEP*(y - 0.5)) for y in (row, end))
        mapping.append(((0, row, WIDTH, end),
                        (left, top, left, bottom, right, bottom, right, top)))
    dem = mosaic.transform((WIDTH, HEIGHT), Image.Transform.MESH, mapping,
                           resample=Image.Resampling.BILINEAR)
    mosaic.close()
    if min(dem.getextrema()) < 900 or max(dem.getextrema()) < 4250:
        raise ValueError("DEM outside the expected range")
    return dem


def grid_mesh(dem):
    # Right-triangulated irregular network. Enforce the same splitting error
    # on the hypotenuse of both adjoining triangles to keep every seam closed.
    n = GRID-1
    heights = array("H", (round(dem.getpixel((x*2, y*4)))
                          for y in range(GRID) for x in range(GRID)))
    # Keep the photographed skyline and visible faces detailed at five
    # viewpoints spanning the playable city. Valleys behind them can use
    # longer triangles. Elevations of retained vertices always stay measured.
    tolerance = bytearray([190]) * (GRID*GRID)
    for view_x, view_z in ((0,0),(-8500,-15300),(10500,3700),
                           (-8500,3700),(10500,-15300)):
        for bearing in range(-870, 871, 2):
            tangent = tan(radians(bearing/10))
            top, summit = -1, None
            for x in range(n, -1, -1):
                dx = view_x - (WEST + x*170)
                index_z = (view_z + dx*tangent - NORTH) / 340
                z = int(index_z)
                if not 0 <= index_z < n:
                    break
                i = z*GRID+x
                h = heights[i] + (heights[i+GRID]-heights[i])*(index_z-z)
                distance = dx*sqrt(1+tangent*tangent)
                slope = (h-1624.7)/distance-distance/15000000
                if slope >= top-0.0008:
                    tolerance[i] = min(48, tolerance[i])
                    tolerance[i+GRID] = min(48, tolerance[i+GRID])
                if slope > top:
                    top, summit = slope, (x,z)
            if summit:
                x, z = summit
                for j in range(max(0,z-2),min(n,z+2)+1):
                    for k in range(max(0,x-2),min(n,x+2)+1):
                        tolerance[j*GRID+k] = 12

    errors = array("f", [0]) * (GRID*GRID)
    levels = [array("H", (0,0,n,n,n,0, n,n,0,0,0,n))]
    while len(levels[-1]) < 6*n*n:
        tris = levels[-1]
        children = array("H")
        for i in range(0, len(tris), 6):
            ax, ay, bx, by, cx, cy = tris[i:i+6]
            hx, hy = (ax+bx)//2, (ay+by)//2
            children.extend((cx,cy,ax,ay,hx,hy, bx,by,cx,cy,hx,hy))
        levels.append(children)
    for level in reversed(levels):
        for i in range(0, len(level), 6):
            ax, ay, bx, by, cx, cy = level[i:i+6]
            hx, hy = (ax+bx)//2, (ay+by)//2
            center = hy*GRID+hx
            diff = abs(heights[center] - 0.5*(heights[ay*GRID+ax]+heights[by*GRID+bx])) / tolerance[center]
            if level is not levels[-1]:
                diff = max(diff, errors[((ay+cy)//2)*GRID+(ax+cx)//2],
                           errors[((by+cy)//2)*GRID+(bx+cx)//2])
            errors[center] = max(diff, errors[center])
    vertices, triangles, ids = array("H"), array("H"), {}

    def emit(ax, ay, bx, by, cx, cy):
        hx, hy = (ax+bx)//2, (ay+by)//2
        if abs(ax-cx)+abs(ay-cy) > 1 and errors[hy*GRID+hx] > 1:
            emit(cx,cy,ax,ay,hx,hy)
            emit(bx,by,cx,cy,hx,hy)
            return
        for x,y in ((ax,ay),(bx,by),(cx,cy)):
            i = y*GRID+x
            if i not in ids:
                ids[i] = len(ids)
                vertices.extend((x, heights[i], y))
            triangles.append(ids[i])
    emit(0,0,n,n,n,0)
    emit(n,n,0,0,0,n)
    if sys.byteorder != "little":
        vertices.byteswap()
        triangles.byteswap()
    with (SCENERY / "front-range.mesh").open("wb") as f:
        f.write(pack("<II", len(ids), len(triangles)))
        vertices.tofile(f)
        triangles.tofile(f)
    print(f"{len(ids):,} vertices, {len(triangles)//3:,} triangles", flush=True)


def clamp(value):
    return max(0, min(1, value))


def surface(cache, dem):
    east, south = WEST+(WIDTH-1)*STEP, NORTH+(HEIGHT-1)*STEP
    bbox = ",".join(f"{v:.4f}" for v in
                    (mx+WEST/scale, my-south/scale, mx+east/scale, my-NORTH/scale))
    url = USGS+"/export?"+urlencode({"f":"image", "bbox":bbox, "bboxSR":3857,
                                     "imageSR":3857, "size":"1024,2048", "format":"jpg"})
    with Image.open(source(cache, "turkey-peaks-ortho.jpg", url)) as photo:
        ortho = photo.convert("RGB").load()
    h = dem.load()
    raster = bytearray(1024*2048*3)
    for y in range(2048):
        for x in range(1024):
            z = (h[x,y]+h[x+1,y]+h[x,y+1]+h[x+1,y+1])*0.25
            dx = (h[x+1,y]-h[x,y]+h[x+1,y+1]-h[x,y+1])/(2*STEP)
            dz = (h[x,y+1]-h[x,y]+h[x+1,y+1]-h[x+1,y])/(2*STEP)
            slope = sqrt(dx*dx+dz*dz)
            light = max(0, (0.55-0.63*dx-0.55*dz)/sqrt(1+slope*slope))
            r,g,b = ortho[x,y]
            lum = 0.27*r+0.57*g+0.16*b
            # Exposed south faces and steep cliffs retain less snow. The
            # ortho separates shaded stands of conifers from open tundra.
            snowline = 3230 - 220*dz + 400*max(0, slope-0.57) - 1.65*(lum-90)
            snow = clamp((z-snowline)/265)
            snow *= snow*(3-2*snow)
            rock = (44+0.61*r, 53+0.56*g, 60+0.52*b)
            ice = (146+106*light, 164+87*light, 181+64*light)
            shade = 0.73+0.35*light
            i = (y*1024+x)*3
            for c in range(3):
                raster[i+c] = round(min(255, rock[c]*shade*(1-snow)+ice[c]*snow))
    image = Image.frombytes("RGB", (1024,2048), bytes(raster))
    image.save(SCENERY/"front-range.webp", quality=90, method=6)


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    cache = parser.parse_args().cache
    cache.mkdir(exist_ok=True, parents=True)
    dem = reproject_dem(cache)
    grid_mesh(dem)
    surface(cache, dem)
