"""Sample building roofs within concave city footprints using the USGS point cloud."""
import math

import numpy as np
from scipy.spatial import Delaunay, cKDTree


def inside(points, ring):
    x, z = points.T
    result = np.zeros(len(x), dtype=bool)
    for a, b in zip(ring, np.roll(ring, -1, axis=0)):
        if a[1] != b[1]:
            result ^= ((a[1] > z) != (b[1] > z)) & (
                x < a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            )
    return result


def roof_topology(ring, spacing=2):
    """Conform each roof to its concave GIS boundary, retaining edge IDs for wall UVs."""
    boundary, edges = [], []
    for edge, (a, b) in enumerate(zip(ring, np.roll(ring, -1, axis=0))):
        n = max(1, math.ceil(np.linalg.norm(b - a) / spacing))
        for i in range(n):
            boundary.append(a + (b - a) * i / n)
            edges.append(edge)
    low, high = ring.min(axis=0), ring.max(axis=0)
    grid = np.mgrid[low[0] : high[0] : spacing, low[1] : high[1] : spacing].reshape(2, -1).T
    interior = grid[inside(grid, ring) & (cKDTree(boundary).query(grid)[0] > spacing * 0.75)]
    # Bisect missing boundary constraints so no triangle can bridge a recess.
    for _ in range(10):
        points = np.vstack((boundary, interior))
        tris = Delaunay(points).simplices
        links = {tuple(sorted((int(i), int(j)))) for t in tris for i, j in zip(t, np.roll(t, 1))}
        missing = [
            i
            for i in range(len(boundary))
            if tuple(sorted((i, (i + 1) % len(boundary)))) not in links
        ]
        if not missing:
            return points, tris[inside(points[tris].mean(axis=1), ring)], edges
        for i in reversed(missing):
            boundary.insert(i + 1, (boundary[i] + boundary[(i + 1) % len(boundary)]) / 2)
            edges.insert(i + 1, edges[i])
    raise ValueError("Could not retain all roof edges")


def residential_planes(returns, query, points, datum, fallback):
    """Fit coherent pitched roof surfaces while discarding scattered canopy returns."""
    origin = returns[:, :2].mean(axis=0)
    xy = returns[:, :2] - origin
    samples = np.column_stack((xy, np.ones(len(xy))))
    h = returns[:, 2] - datum
    remaining = np.arange(len(h))
    planes, distances = [], []
    rng = np.random.default_rng(2020)
    for _ in range(6):
        if len(remaining) < 16:
            break
        best = []
        for triplet in rng.choice(remaining, size=(500,3)):
            tri = samples[triplet]
            if abs(np.linalg.det(tri)) < 2:
                continue
            plane = np.linalg.solve(tri, h[triplet])
            if np.linalg.norm(plane[:2]) > .85:
                continue
            support = remaining[np.abs(samples[remaining] @ plane - h[remaining]) < .14]
            if len(support) > len(best):
                best = support
        if len(best) < max(12, len(h)*.04):
            break
        plane = np.linalg.lstsq(samples[best], h[best], rcond=None)[0]
        planes.append(np.column_stack((points-origin,np.ones(len(points)))) @ plane)
        distances.append(cKDTree(returns[best,:2]).query(query,k=3)[0].mean(axis=1))
        remaining = np.setdiff1d(remaining,best)
    if not planes:
        return fallback
    winner = np.argmin(distances,axis=0)
    estimate = np.array(planes)[winner,np.arange(len(points))]
    # Boundary probes sit up to 0.85 m inside the drip line. Limit extrapolation
    # to that offset at the accepted pitch so sparse canopy returns cannot
    # pull a garage below its opening or introduce a spike at a roof corner.
    return np.maximum(2.45, np.clip(estimate, fallback - .73, fallback + .73))


def sample_roof(building, survey, residential=False):
    ring = np.array(building["points"])
    lo, hi = ring.min(axis=0), ring.max(axis=0)
    local = survey[np.all((survey[:, :2] > lo - 5) & (survey[:, :2] < hi + 5), axis=1)]
    ground = local[local[:, 3] == 2]
    datum = np.median(ground[cKDTree(ground[:, :2]).query(ring, k=3)[1], 2])
    returns = local[(local[:, 3] != 2) & inside(local[:, :2], ring)]
    returns = returns[
        (returns[:, 2] > datum + 2) & (returns[:, 2] < datum + building["roofHeight"] + (1.2 if residential else 5))
    ]
    if len(returns) < 35:
        raise ValueError("Insufficient roof returns for " + building["name"])
    points, triangles, edge_ids = roof_topology(ring, spacing=1.6 if residential else 2)
    # Pull boundary samples slightly inward to avoid trees and ground at the eaves.
    query = points.copy()
    # The triangle centroid nearest the bounds center lies inside concave buildings too.
    centers = points[triangles].mean(axis=1)
    center = centers[np.argmin(np.linalg.norm(centers - (lo + hi) / 2, axis=1))]
    for i, edge in enumerate(edge_ids):
        a, b = ring[edge], ring[(edge + 1) % len(ring)]
        d = b - a
        normal = np.array([-d[1], d[0]]) / np.linalg.norm(d)
        sign = 1 if inside(np.array([(a + b) / 2 + 0.12 * normal]), ring)[0] else -1
        query[i] += normal * sign * 0.85
    nearby = cKDTree(returns[:, :2]).query(query, k=7)[1]
    heights = np.median(returns[nearby, 2], axis=1) - datum
    if residential:
        heights = residential_planes(returns, query, points, datum, heights)
    return ring, points, triangles, edge_ids, heights, center
