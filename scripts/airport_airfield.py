"""Dusk apron and pickup curb for the Jeppesen arrivals set, in game metres."""

from math import cos, pi, sin

import numpy as np
from PIL import Image, ImageDraw


def twilight(directory):
    # The fixed panorama holds the stars and mountains. The shader drifts a
    # separate tile of cloud density across it at two different altitudes.
    w, h = 2048, 1024
    rng = np.random.default_rng(510)
    x = np.arange(w) / w
    y = np.arange(h)[:, None] / h
    stops = [0, 0.26, 0.37, 0.44, 0.49, 0.53, 1]
    colors = [
        [15, 22, 53],
        [39, 58, 91],
        [82, 98, 131],
        [150, 138, 155],
        [246, 181, 142],
        [178, 145, 145],
        [56, 65, 77],
    ]
    sky = np.stack([np.interp(y, stops, c) for c in np.array(colors).T], axis=-1)
    sky = np.broadcast_to(sky, (h, w, 3)).copy()
    sky -= (
        (0.5 + 0.5 * np.cos(2 * pi * (x - 0.55)))[None, :, None]
        * np.exp(-(((y - 0.48) / 0.075) ** 2))[:, :, None]
        * np.array([65, 37, 10])
    )
    image = Image.fromarray(sky.clip(0, 255).astype("uint8"))
    draw = ImageDraw.Draw(image)
    for _ in range(720):
        px, py = rng.integers(w), rng.integers(int(h * 0.35))
        light = int(rng.integers(42, 108) * (1 - py / (h * 0.4)))
        draw.point((px, py), fill=tuple(min(255, v + light) for v in image.getpixel((px, py))))
    for base, relief, color in [(0.479, 0.036, "#766e83"), (0.493, 0.019, "#5a6074")]:
        ridge = np.zeros(w)
        for count, strength in [(9, 0.6), (36, 0.3), (140, 0.1)]:
            peaks = rng.random(count)
            ridge += np.interp(x * count, np.arange(count + 1), [*peaks, peaks[0]]) * strength
        edge = base - relief * ridge * (0.55 + 0.45 * np.cos(2 * pi * x))
        draw.polygon([*(zip(range(w), (edge * h).astype(int))), (w - 1, h), (0, h)], fill=color)
    image.save(directory / "airport-twilight.webp", quality=88)

    size = 512
    density = np.zeros((size, size))
    for cells, weight in [(5, 0.46), (11, 0.28), (24, 0.15), (53, 0.075), (110, 0.035)]:
        grid = rng.integers(0, 256, (cells, cells), dtype="uint8")
        tiled = Image.fromarray(np.tile(grid, (3, 3))).resize(
            (size * 3, size * 3), Image.Resampling.BICUBIC
        )
        density += weight * np.asarray(tiled)[size : 2 * size, size : 2 * size]
    Image.fromarray(density.astype("uint8")).save(directory / "airport-clouds.webp", lossless=True)


def regional_jet(s, cx, cz, yaw):
    def p(x, y, z):
        return (cx + x * cos(yaw) - z * sin(yaw), y, cz + x * sin(yaw) + z * cos(yaw))

    # Rings taper separately at the radome and raised tail cone.
    sections = [
        (-15, 2.75, 0.09),
        (-14.4, 2.85, 0.8),
        (-12.7, 3.12, 1.45),
        (-10.6, 3.25, 1.68),
        (7.6, 3.25, 1.68),
        (11.2, 3.48, 1.28),
        (14.6, 4.0, 0.26),
    ]
    for (x0, y0, r0), (x1, y1, r1) in zip(sections, sections[1:]):
        for i in range(16):
            a, b = i * pi / 8, (i + 1) * pi / 8
            mat = "Linen" if cos((a + b) / 2) > -0.35 else "Tile"
            s.face(
                mat,
                [
                    p(x, y + r * cos(t), r * sin(t))
                    for x, y, r, t in [
                        (x0, y0, r0, a),
                        (x0, y0, r0, b),
                        (x1, y1, r1, b),
                        (x1, y1, r1, a),
                    ]
                ],
            )
    for side in (-1, 1):

        def side_face(mat, points):
            s.face(mat, [p(x, y, side * z) for x, y, z in points])

        side_face(
            "Ink",
            [(-14.22, 3.18, 0.89), (-13.2, 3.29, 1.36), (-13.22, 3.78, 1.22), (-14.15, 3.48, 0.90)],
        )
        side_face(
            "Ink",
            [
                (-13.06, 3.30, 1.40),
                (-12.08, 3.39, 1.57),
                (-12.40, 3.91, 1.39),
                (-13.09, 3.81, 1.25),
            ],
        )
        for x in np.arange(-10, 8, 0.95):
            side_face(
                "Ink",
                [(x, 3.4, 1.68), (x + 0.42, 3.4, 1.68), (x + 0.42, 3.88, 1.58), (x, 3.88, 1.58)],
            )
        side_face("Silver", [(-4, 2.72, 1.2), (3.7, 2.65, 1.2), (7, 3.35, 13.1), (5.3, 3.38, 13.2)])
        side_face("Tile", [(5.3, 3.38, 13.2), (7, 3.35, 13.1), (7.45, 4.72, 13.65)])
        side_face("Silver", [(8.3, 3.95, 0.6), (12, 4, 0.4), (14.3, 4.8, 5.8), (12.9, 4.8, 5.9)])
        s.tube("Steel", p(-2.2, 1.91, side * 5.7), p(0.95, 1.91, side * 5.7), 0.8, 0.58, n=14)
        s.tube("Silver", p(-2.44, 1.91, side * 5.7), p(-2.19, 1.91, side * 5.7), 0.81, n=14)
        s.tube("Ink", p(-2.42, 1.91, side * 5.7), p(-2.46, 1.91, side * 5.7), 0.66, n=14)
        for x, z in [(-10, 0.37), (1.8, 1.85)]:
            s.tube("Steel", p(x, 0.48, side * z), p(x, 2.35, side * z), 0.12, n=6)
            s.tube("Ink", p(x, 0.52, side * z), p(x, 0.52, side * (z + 0.26)), 0.52, n=12)
    fin = [(7.7, 4.4), (12.7, 10.1), (14.4, 10.1), (13.7, 4.1)]
    s.face("Tile", [p(x, y, 0) for x, y in fin])
    s.face("Amber", [p(10.2, 7.2, 0.04), p(14.07, 7.65, 0.04), p(14.18, 8.55, 0.04)])
    s.face("Amber", [p(10.2, 7.2, -0.04), p(14.07, 7.65, -0.04), p(14.18, 8.55, -0.04)])


def airfield(s):
    # Across the return loop, cylinders and flared, glazed cab read in silhouette.
    x, z = 50, 56
    for mat, low, high, r0, r1 in [
        ("Steel", 0, 3, 3.5, 3.0),
        ("Silver", 3, 22, 2.1, 1.65),
        ("Steel", 22, 24.8, 1.65, 4.2),
        ("Amber", 24.8, 25.15, 4.2, 4.2),
        ("Glass", 25.15, 28.3, 3.75, 4.65),
        ("Ink", 28.3, 29.1, 4.95, 4.7),
        ("Silver", 29.1, 29.85, 4.7, 1.4),
        ("Steel", 29.85, 32, 0.15, 0.10),
        ("Candy", 32, 32.35, 0.18, 0.14),
    ]:
        s.tube(mat, (x, low, z), (x, high, z), r0, r1, n=10)
    for k in range(10):
        a = -pi / 2 - k * pi / 5
        s.tube(
            "Ink",
            (x + 3.78 * cos(a), 25.1, z + 3.78 * sin(a)),
            (x + 4.68 * cos(a), 28.3, z + 4.68 * sin(a)),
            0.095,
            n=5,
        )
        s.tube(
            "Steel",
            (x + 2.08 * cos(a), 3, z + 2.08 * sin(a)),
            (x + 1.64 * cos(a), 22, z + 1.64 * sin(a)),
            0.085,
            n=5,
        )
        # Lit consoles behind the sloping cab glass, separated at the mullions.
        b = a - pi / 5

        def pane(t, height, radius):
            return (
                x + radius * ((1 - t) * cos(a) + t * cos(b)),
                height,
                z + radius * ((1 - t) * sin(a) + t * sin(b)),
            )

        s.face(
            "Glow",
            [
                pane(0.15, 25.55, 3.92),
                pane(0.68, 25.55, 3.92),
                pane(0.68, 25.88, 4.03),
                pane(0.15, 25.88, 4.03),
            ],
        )
    for side in (-1, 1):
        s.pad("Road", 7, side * 67, 125, 45, -0.025)
        regional_jet(s, 21 if side > 0 else -2, side * 53, -0.24 if side > 0 else 0.43)
        # Maintenance hangars make a low, lit horizon behind the tails.
        for x in (-28, 5, 38):
            z = side * 78
            s.box("Steel", (x, 4, z), (31, 8, 14))
            s.box("Silver", (x, 8.2, z), (31.7, 0.4, 14.7))
            for dx in range(-12, 13, 3):
                s.box("Glass", (x + dx, 5.4, z - side * 7.08), (2.75, 2.55, 0.09))
            s.box("Glow", (x, 3.92, z - side * 7.12), (26, 0.13, 0.16))
            for dx in (-9, 0, 9):
                s.box("Ink", (x + dx, 1.75, z - side * 7.08), (8.7, 3.5, 0.12))
                for y in (0.9, 1.75, 2.6):
                    s.box("Slate", (x + dx, y, z - side * 7.16), (8.3, 0.07, 0.06))
        for dx in range(-48, 70, 5):
            s.box("Amber", (dx, 0.10, side * 45.4), (0.22, 0.18, 0.22))


def pickup_curb(s):
    for z in (-4, 17):
        # Zebra markings cross both traffic lanes at the lit waiting shelters.
        for x in np.arange(8.55, 16, 1.0):
            s.pad("Linen", x, z, 0.48, 2.4, 0.024)
        s.pad("Ochre", 7.46, z, 0.58, 2.45, 0.026)
        s.pad("Paving", 19.6, z, 6.5, 11, 0.16)
        s.box("Tile", (19.8, 3.55, z), (4.4, 0.27, 9.6))
        s.box("Amber", (17.58, 3.52, z), (0.08, 0.10, 9.6))
        s.box("Glow", (18.3, 3.39, z), (0.12, 0.04, 8.7))
        for dz in (-3.85, 3.85):
            s.box("Steel", (21, 1.8, z + dz), (0.17, 3.5, 0.17))
            s.tube("Silver", (21, 2.45, z + dz), (18.4, 3.44, z + dz), 0.085, n=6)
        s.extras["furniture"].append(["Bench", 20.6, z, -pi / 2])
    # Luminous curb markers are readable from either direction along the sidewalk.
    for z, number in [(25.6, "4"), (1.8, "5"), (-25.4, "6")]:
        x = 5.95
        s.block("Steel", x, z, 0.92, 0.42, 2.95)
        s.box("Amber", (x - 0.49, 1.9, z), (0.065, 2.0, 0.39))
        for side in (-1, 1):
            s.sign(
                number,
                x,
                2.23,
                z + side * 0.218,
                0.89,
                1.3,
                "#235761",
                yaw=0 if side > 0 else pi,
                sub="PICKUP",
            )
    for x, z in [(5.2, 24.45), (5.25, -26.6)]:
        s.barrier(x, z, 0.78, 1.18)
        s.box("Steel", (x, 0.23, z), (0.78, 0.09, 1.18))
        for dx in (-0.32, 0.32):
            for dz in (-0.44, 0.44):
                s.tube(
                    "Ink",
                    (x + dx - 0.044, 0.13, z + dz),
                    (x + dx + 0.044, 0.13, z + dz),
                    0.13,
                    n=10,
                )
            s.tube("Silver", (x + dx, 0.23, z + 0.42), (x + dx, 1.18, z + 0.63), 0.034)
        s.tube("Ink", (x - 0.36, 1.18, z + 0.63), (x + 0.36, 1.18, z + 0.63), 0.05)
        for y, dz, w, h, d, mat in [
            (0.50, 0, 0.7, 0.46, 0.85, "Pumpkin"),
            (0.88, 0.1, 0.61, 0.29, 0.65, "Holly"),
        ]:
            s.box(mat, (x, y, z + dz), (w, h, d))
            for dx in (-0.19, 0.19):
                s.box("Ochre", (x + dx, y, z + dz), (0.044, h + 0.014, d + 0.014))
            s.box("Ink", (x, y + h / 2 + 0.024, z + dz), (0.16, 0.04, 0.055))
