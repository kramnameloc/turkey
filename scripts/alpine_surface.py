"""Fit the Snowy Mountain height field and snow artwork to Front Range summits."""
import numpy as np
from PIL import Image

from export_landscape import SourceGLB


def model_surface():
    source = SourceGLB('snowy_mountain.glb')
    # The eight draw batches share one regular UV / height grid. The source
    # root flips Y, so the most negative OBJ height is the summit.
    samples = []
    for mesh in source.doc['meshes']:
        prim = mesh['primitives'][0]['attributes']
        samples.append(np.column_stack([source.values(prim['TEXCOORD_0']),
                                        -source.values(prim['POSITION'])[:, 1]]))
    samples = np.vstack(samples)
    side = len(np.unique(samples[:, 0]))
    height = np.full((side, side), np.nan, np.float32)
    u, v = np.rint(samples[:, :2].T * (side-1)).astype(int)
    height[v, u] = samples[:, 2]
    if not np.isfinite(height).all():
        raise ValueError('The mountain model no longer forms a complete height grid')
    return height, np.asarray(source.image(0).convert('L'), dtype=np.float32)


def sample(grid, u, v):
    x = np.clip(u, 0, 1) * (grid.shape[1]-1)
    y = np.clip(v, 0, 1) * (grid.shape[0]-1)
    i, j = x.astype(int), y.astype(int)
    ii, jj = np.minimum(i+1, grid.shape[1]-1), np.minimum(j+1, grid.shape[0]-1)
    fx, fy = x-i, y-j
    return ((1-fy)*((1-fx)*grid[j,i]+fx*grid[j,ii]) +
            fy*((1-fx)*grid[jj,i]+fx*grid[jj,ii]))


def fit_summits(dem, step):
    heights = np.asarray(dem, dtype=np.float32)
    relief, snow_map = model_surface()
    top_v, top_u = np.array(np.unravel_index(relief.argmax(), relief.shape)) / (np.array(relief.shape)-1)
    total = np.zeros_like(heights)
    displacement = np.zeros_like(heights)
    strength = np.zeros_like(heights)
    snow = np.zeros_like(heights)

    # Start at the highest sample in each ~2 km square. Space the selected
    # summits far enough apart for the visible faces to have distinct flanks.
    candidates = []
    for y in range(0, heights.shape[0], 24):
        for x in range(0, heights.shape[1], 24):
            block = heights[y:y+24,x:x+24]
            j, i = np.unravel_index(block.argmax(), block.shape)
            px, py = x+int(i), y+int(j)
            neighbors = heights[max(0,py-16):py+17,max(0,px-16):px+17]
            if block[j,i] >= 3480 and block[j,i] == neighbors.max():
                candidates.append((float(block[j,i]), px, py))
    summits = []
    for elevation, x, y in sorted(candidates, reverse=True):
        if any((x-px)**2+(y-py)**2 < (8500/step)**2 for px,py in summits):
            continue
        summits.append((x,y))
        span = (13300 + 3.2*(elevation-3480)) / step
        radius = int(np.ceil(span*.51))
        window = np.s_[max(0,y-radius):y+radius+1, max(0,x-radius):x+radius+1]
        base = heights[window]
        yy, xx = np.indices(base.shape)
        yy += window[0].start
        xx += window[1].start
        dx, dy = (xx-x)/span, (yy-y)/span
        angle = ((x*17 + y*11) % 360) * np.pi / 180
        u = top_u + np.cos(angle)*dx - np.sin(angle)*dy
        v = top_v + np.sin(angle)*dx + np.cos(angle)*dy
        edge = np.minimum.reduce([u,v,1-u,1-v])
        weight = np.clip((.50-np.hypot(dx,dy))/.19,0,1) * np.clip(edge/.12,0,1)
        weight *= np.clip((base-3100)/460,0,1)
        weight = weight**2*(3-2*weight)
        # Keep the measured summit anchored. Allow up to 145 m of artistic
        # relief on a flank, blending back into the surveyed foothills.
        form = elevation + (sample(relief,u,v)-relief.max()) * 4.0
        delta = np.clip((form-base)*.48,-145,145)
        displacement[window] += weight*delta
        snow[window] += weight*sample(snow_map,u,v)
        total[window] += weight
        np.maximum(strength[window], weight, out=strength[window])

    divisor = np.maximum(total, 1e-6)
    adjusted = heights + strength*displacement/divisor
    snow /= divisor
    dz, dx = np.gradient(adjusted, step)
    light = np.clip((.57-.75*dx-.50*dz) / np.sqrt(1+dx*dx+dz*dz),0,1)
    exposed = np.clip((snow-81)/125, 0, 1)
    # Windward cliffs show rock through the source snow. Gentler upper slopes
    # collect a continuous snowpack, which stays legible at the park's distance.
    deposition = (.60 * np.clip((adjusted-3240)/640, 0, 1)
                  * np.clip((1.08-np.hypot(dx,dz))/.73, .12, 1))
    cover = deposition + (1-deposition)*(1-(1-exposed)**1.4)
    rock = [57, 65, 76]
    ice = [243, 247, 250]
    rgb = np.stack([dark*(.66+.39*light)*(1-cover) + bright*(.84+.17*light)*cover
                    for dark,bright in zip(rock,ice)], axis=-1)
    # Terrain colors represent grid cells, halfway between the height samples.
    def cell_centers(field):
        return (field[:-1,:-1]+field[1:,:-1]+field[:-1,1:]+field[1:,1:])*.25
    color = Image.fromarray(np.uint8(np.clip(cell_centers(rgb),0,255)))
    mask = Image.fromarray(np.uint8(cell_centers(strength)*240))
    print(f'Fitted Snowy Mountain to {len(summits)} high-country summits', flush=True)
    return Image.fromarray(adjusted), color, mask
