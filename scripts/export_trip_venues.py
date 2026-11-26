"""Bake the four compact trip sets, their floor plans and collision into local GLBs.

Run with NumPy and Pillow. Coordinates are game meters, with north along -Z.
Dover itself continues to use the surveyed regional assets.
"""

from math import cos, pi, sin
from pathlib import Path
from random import Random

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from landmark_mesh import Mesh, write_glb

PUBLIC = Path(__file__).resolve().parents[1] / "public"
PALETTE = dict(
    Ink="202a39",
    Steel="536779",
    Glass="528699",
    Silver="a9b8c4",
    Linen="f0ebe0",
    Amber="ffc369",
    Glow="fff0bc",
    Plum="4a315a",
    Ice="83d6ed",
    Frost="c4f5fa",
    Glacier="4386ba",
    Violet="886ec5",
    Pumpkin="ed913b",
    Holly="2e776a",
    Candy="c94552",
    Timber="966a47",
    Slate="4c6264",
    Water="4ba7a4",
    Leaf="467450",
    Palm="59885a",
    Gold="d4ac65",
    Tile="278998",
    Cobalt="245181",
    Clay="b37b63",
    Brick="914f40",
    Copper="528b80",
    Ochre="d2a05b",
)


def ring(x, z, rx, rz, n=32):
    return [(x + rx * cos(2 * pi * i / n), z + rz * sin(2 * pi * i / n)) for i in range(n)]


class Venue(Mesh):
    def __init__(self, name, bounds):
        super().__init__(name, (0, 0))
        x0, x1, z0, z1 = bounds
        self.plan = dict(
            bounds=dict(minX=x0, maxX=x1, minZ=z0, maxZ=z1),
            buildings=[],
            roads=[],
            paths=[],
            water=[],
            places=[],
            trees=[],
        )
        self.extras = dict(plan=self.plan)
        self.images = {}

    def paint(self, key, filename, color=None):
        image = Image.open(PUBLIC / "scenery" / filename).convert("RGB")
        self.images[key] = ImageOps.colorize(image.convert("L"), *color) if color else image

    def pad(self, mat, x, z, w, d, top=0, tile=3):
        self.face(
            mat,
            [
                (x - w / 2, top, z + d / 2),
                (x + w / 2, top, z + d / 2),
                (x + w / 2, top, z - d / 2),
                (x - w / 2, top, z - d / 2),
            ],
            [(0, d / tile), (w / tile, d / tile), (w / tile, 0), (0, 0)],
        )

    def barrier(self, x, z, w, d):
        self.plan["buildings"].append(
            dict(
                points=[
                    [x - w / 2, z - d / 2],
                    [x + w / 2, z - d / 2],
                    [x + w / 2, z + d / 2],
                    [x - w / 2, z + d / 2],
                ]
            )
        )

    def block(self, mat, x, z, w, d, h):
        self.box(mat, (x, h / 2, z), (w, h, d))
        self.barrier(x, z, w, d)

    def place(self, name, x, z):
        self.plan["places"].append(dict(name=name, x=x, z=z))

    def way(self, points, width):
        self.plan["paths"].append(dict(points=points, width=width))

    def tube(self, mat, a, b, r, tip=None, n=10):
        a, b = np.array(a), np.array(b)
        axis = b - a
        axis = axis / np.linalg.norm(axis)
        ref = (1, 0, 0) if abs(axis[0]) < 0.8 else (0, 0, 1)
        u = np.cross(axis, ref)
        u /= np.linalg.norm(u)
        v = np.cross(axis, u)
        dirs = [u * cos(2 * pi * i / n) + v * sin(2 * pi * i / n) for i in range(n)]
        top = r if tip is None else tip
        for i, normal in enumerate(dirs):
            nxt = dirs[(i + 1) % n]
            self.face(mat, [a + r * normal, a + r * nxt, b + top * nxt, b + top * normal])
            if top:
                self.face(mat, [b, b + top * normal, b + top * nxt])

    def ellipsoid(self, mat, center, scale, n=20, layers=10):
        x, y, z = center
        rx, ry, rz = scale

        def point(i, j):
            a, b = 2 * pi * i / n, pi * (j / layers - 0.5)
            return (x + rx * cos(a) * cos(b), y + ry * sin(b), z + rz * sin(a) * cos(b))

        for j in range(layers):
            for i in range(n):
                self.face(mat, [point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j)])

    def sign(self, text, x, y, z, w, h, bg="#192e3f", fg="#fff4d3", yaw=0, sub=""):
        key = "Sign " + text
        img = Image.new("RGB", (768, max(72, round(768 * h / w))), bg)
        draw = ImageDraw.Draw(img)

        def line(words, center, limit):
            font = ImageFont.load_default(size=limit)
            size = max(12, int(limit * min(1, 710 / max(1, draw.textlength(words, font=font)))))
            draw.text(
                (384, center), words, font=ImageFont.load_default(size=size), fill=fg, anchor="mm"
            )

        draw.rectangle((6, 6, 761, img.height - 7), outline=fg, width=2)
        line(text, img.height * (0.40 if sub else 0.50), int(img.height * (0.43 if sub else 0.60)))
        if sub:
            line(sub, img.height * 0.77, int(img.height * 0.2))
        self.images[key] = img
        self.face(
            key,
            [
                (x + u * cos(yaw), y + v, z - u * sin(yaw))
                for u, v in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
            ],
        )

    def save(self):
        used = {
            name: PALETTE[name]
            for name in self.parts
            if name in PALETTE and name not in self.images
        }
        write_glb(PUBLIC / "models" / ("trip-" + self.name + ".glb"), [self], self.images, used)


def airport():
    s = Venue("airport", (-13, 13, -30, 27))
    s.paint("Road", "street-asphalt.webp")
    s.paint("Paving", "street-concrete.webp", ("#414957", "#b4b9c0"))
    s.extras["furniture"] = []
    for z in (-20, -6, 7, 20):
        s.extras["furniture"].append(["Bench", -11.7, z, pi / 2])
        s.barrier(-11.7, z, 0.9, 2)
    s.pad("Road", 0, 0, 170, 160)
    s.pad("Paving", -3, 0, 22, 62, 0.015)
    s.way([[0, 24], [0, -20], [7.6, -19]], 6)
    # West terminal curtain wall, a bank of sliding doors and scalloped tent bays.
    s.block("Glass", -15, 0, 3, 75, 7.5)
    for z in range(-36, 38, 3):
        s.box("Silver", (-13.43, 3.7, z), (0.16, 7.4, 0.10))
        s.box("Amber", (-13.34, 2.9, z), (0.12, 0.10, 2.88))
    for y in (1, 3.3, 6.7):
        s.box("Steel", (-13.37, y, 0), (0.15, 0.15, 74))
    for z in range(-36, 37, 12):
        for x in (-23, -9):
            for i in range(16):

                def canvas(j, t):
                    a = 2 * pi * j / 16
                    return (x + 9.6 * t * cos(a), 7.2 + 10.5 * (1 - t) ** 2, z + 8.4 * t * sin(a))

                for k in range(5):
                    s.face(
                        "Linen",
                        [
                            canvas(i, k / 5),
                            canvas(i, (k + 1) / 5),
                            canvas(i + 1, (k + 1) / 5),
                            canvas(i + 1, k / 5),
                        ],
                    )
        s.tube("Silver", (-4.4, 0, z), (-4.4, 7.6, z), 0.15)
        s.barrier(-4.4, z, 0.3, 0.3)
        s.box("Glow", (-7, 6.75, z), (9, 0.10, 0.28))
    # Lit entries and aluminum mullions break up the dark curtain wall.
    for z in range(-33, 37, 6):
        s.box("Glow", (-13.36, 5.62, z), (0.06, 0.14, 4.8))
        for dz in (-1.6, 1.6):
            s.box("Steel", (-13.25, 1.5, z + dz), (0.14, 3, 0.12))
        s.box("Silver", (-13.25, 3.0, z), (0.14, 0.15, 3.35))
        s.box("Amber", (-13.24, 0.86, z), (0.18, 0.055, 3.24))
    for i, (x, z) in enumerate([(-7, 17), (-8, -9), (-8.8, 12)]):
        s.block("Plum" if i % 2 else "Copper", x, z, 0.82, 0.48, 1.15)
        for side in (-1, 1):
            s.tube("Silver", (x + side * 0.17, 1.1, z), (x + side * 0.17, 1.46, z), 0.025)
            s.ellipsoid("Ink", (x + side * 0.32, 0.12, z + 0.2), (0.09, 0.11, 0.08), 8, 6)
        s.box("Ink", (x, 1.46, z), (0.4, 0.08, 0.08))
        for j in range(4):
            s.box("Steel", (x - 0.27 + j * 0.18, 0.65, z + 0.245), (0.03, 0.75, 0.025))
    for z in (-37, -12, 13, 38):
        s.tube("Silver", (16, 0, z), (16, 8, z), 0.10)
        s.box("Steel", (15.1, 8, z), (2.1, 0.13, 0.34))
        s.box("Glow", (14.5, 7.91, z), (0.82, 0.05, 0.3))
    s.sign(
        "DENVER INTERNATIONAL AIRPORT",
        -13.2,
        5,
        6,
        13,
        1.45,
        "#24364c",
        yaw=pi / 2,
        sub="JEPPESEN TERMINAL   /   ARRIVALS",
    )
    for z, num in ((15, "510"), (-9, "512")):
        s.sign(num, -13.24, 3.6, z, 3.2, 1.1, yaw=pi / 2)
    s.sign("DENVER", 0, 6, -29.6, 18, 3, sub="JEPPESEN TERMINAL   /   WEST ARRIVALS")
    s.box("Steel", (0, 5.95, -29.8), (18.15, 3.2, 0.3))
    for x in (-8, 8):
        s.block("Silver", x, -29.8, 0.3, 0.3, 5)
    for z in range(-27, 30, 5):
        s.pad("Linen", 11, z, 0.14, 2.2, 0.02)
    # Shuttle with divided windows, marker lights, wheel hubs and a curbside door.
    s.block("Linen", 10.6, -19, 2.7, 7.9, 2.65)
    for side in (-1, 1):
        x = 10.6 + side * 1.36
        for i in range(5):
            s.box("Glass", (x, 1.8, -22.1 + i * 1.44), (0.06, 1.04, 1.28))
        s.box("Tile", (x, 0.74, -19), (0.08, 0.33, 7.85))
        for z in (-21.5, -16.5):
            s.tube("Ink", (x - 0.12, 0.49, z), (x + 0.12, 0.49, z), 0.51, n=18)
            s.tube("Silver", (x - 0.15, 0.49, z), (x + 0.15, 0.49, z), 0.26, n=18)
    s.box("Glass", (10.6, 1.9, -15.02), (2.42, 0.85, 0.06))
    s.sign("DOVER SHUTTLE", 10.6, 2.47, -14.99, 2.5, 0.38)
    for x in (9.63, 11.57):
        s.box("Glow", (x, 0.66, -14.98), (0.46, 0.18, 0.09))
    s.sign("Ground transportation", 1, 3.8, 5, 6.8, 1.15, sub="SHUTTLES   /   ISLAND 5")
    for x in (-2.25, 4.25):
        s.block("Steel", x, 4.93, 0.13, 0.13, 4.4)
    s.place("Terminal West", -10, 10)
    s.place("Shuttle island", 8, -19)
    s.save()


def ice_gallery():
    s = Venue("ice", (-14, 14, -27, 27))
    s.paint("Frozen floor", "street-concrete.webp", ("#69799e", "#c2d6eb"))
    s.pad("Frozen floor", 0, 0, 30, 56)
    for x in (-14.6, 14.6):
        s.box("Ink", (x, 5.6, 0), (1, 11.2, 56))
        for z in range(-24, 25, 6):
            s.box("Violet", (x * 0.97, 2.4, z), (0.24, 4.8, 5.74))
            s.box("Ice", (x * 0.96, 0.32, z), (0.4, 0.3, 5.8))
    for z in (-27.5, 27.5):
        s.box("Plum", (0, 5.5, z), (30, 11, 1))
    s.box("Ink", (0, 11, 0), (30, 0.4, 56))
    for z in range(-24, 25, 8):
        s.box("Steel", (0, 10.65, z), (29, 0.34, 0.34))
        for x in (-8, 8):
            s.box("Ice", (x, 10.35, z), (4, 0.13, 0.25))
    rng = Random(26)
    for mat, colors in [
        ("Violet", ("#503b7f", "#c0abd9")),
        ("Glacier", ("#35588a", "#8fc9dd")),
        ("Ice", ("#5097b4", "#cdecf4")),
    ]:
        key = mat + " ice blocks"
        s.paint(key, "street-concrete.webp", colors)
        surface = s.images[key].resize((384, 128))
        draw = ImageDraw.Draw(surface, "RGBA")
        for j in range(35):
            x, y = rng.randrange(384), rng.randrange(128)
            dx, dy = rng.randrange(-22, 23), rng.randrange(-14, 15)
            base = [(x, y), (x + dx, y + dy), (x + dx + 17, y + dy - 5)]
            draw.line(base, fill=(217, 244, 255, rng.randrange(35, 115)), width=1)
        draw.line([(0, 127), (1, 1), (383, 1)], fill=(218, 244, 255, 160), width=3)
        s.images[key] = surface
    for z in range(-20, 24, 7):
        for x in (-12, -11, -9, 9, 11, 12):
            s.tube("Frost", (x, 10.6, z), (x, 8.2 + 0.65 * sin(x + z), z), 0.20, 0, 7)
    s.sign(
        "ICE!",
        0,
        6.6,
        -26.93,
        11,
        3.3,
        "#203453",
        "#c4f4ff",
        sub="GAYLORD ROCKIES   /   THE NIGHTMARE BEFORE CHRISTMAS",
    )
    # The hall is lined with staggered, chiseled blocks. Their bevels catch
    # alternating pools of cyan and violet light beneath the steel ceiling.
    for side in (-1, 1):
        for row in range(5):
            for col in range(14):
                z = -26 + col * 4 + (row % 2) * 1.45
                mat = ("Violet", "Glacier", "Ice", "Glacier")[(row + col // 3) % 4] + " ice blocks"
                s.box(
                    mat,
                    (side * (13.98 - (row % 2) * 0.045), 0.54 + row * 1.06, z),
                    (0.28, 1.00, 3.86),
                )
        for z in range(-22, 24, 5):
            for j in range(3):
                x = side * (12.5 + 0.34 * j)
                s.tube(
                    "Frost",
                    (x, 0, z + 0.36 * j),
                    (x + side * 0.23, 1.4 + 0.63 * j, z + 0.36 * j),
                    0.38,
                    0,
                    6,
                )
            s.barrier(side * 12.9, z + 0.35, 1.5, 1.8)
    for z in (-4, -22):
        for side in (-1, 1):
            x = side * 10.6
            s.block("Glacier", x, z, 3, 1.8, 2.95)
            s.tube("Violet", (x, 2.9, z), (x + side * 0.72, 5.8, z), 2.1, 0, 4)
            for dx in (-0.64, 0.64):
                s.box("Glow", (x + dx, 1.9, z + 0.92), (0.55, 0.77, 0.05))
                s.box("Violet", (x + dx, 1.9, z + 0.97), (0.052, 0.82, 0.07))
    # Spiral Hill is a tapering ribbon of violet ice against an amber moon.
    s.ellipsoid("Glow", (-5.7, 5.65, -1.8), (2.3, 2.3, 0.35), 40)
    s.block("Glacier", -6, 0, 7.6, 3, 0.65)
    spiral = [
        (-9, 0.4),
        (-8, 1.8),
        (-6.6, 3.1),
        (-5.4, 3.8),
        (-4.2, 4.1),
        (-3.2, 4),
        (-2.7, 3.5),
        (-2.85, 3),
        (-3.4, 2.85),
        (-3.77, 3.2),
        (-3.54, 3.52),
    ]
    for i, ((x, y), (u, v)) in enumerate(zip(spiral, spiral[1:])):
        r = 1.3 * (1 - i / 11) ** 1.65
        s.tube("Violet", (x, y, 0.5), (u, v, 0.5), r, 1.3 * (1 - (i + 1) / 11) ** 1.65)
    # Jack's pinstripe silhouette, bat bow tie, skull and stitched grin.
    x, z = 4.9, 4
    s.block("Ice", x, z, 3.3, 2.8, 0.55)
    for side in (-1, 1):
        s.tube("Ink", (x + side * 0.53, 0.56, z), (x + side * 0.25, 2.5, z), 0.11)
        s.tube("Ink", (x + side * 0.45, 3.72, z), (x + side * 1.16, 3.08, z + 0.12), 0.13)
        s.tube("Ink", (x + side * 1.16, 3.08, z + 0.12), (x + side * 1.63, 3.65, z + 0.22), 0.1)
        s.ellipsoid("Frost", (x + side * 1.63, 3.68, z + 0.22), (0.13, 0.17, 0.13))
        s.face(
            "Ink",
            [
                (x, 3.83, z + 0.28),
                (x + side * 0.7, 4.1, z + 0.27),
                (x + side * 0.4, 3.67, z + 0.27),
            ],
        )
    s.tube("Ink", (x, 2.38, z), (x, 3.78, z), 0.24, 0.48)
    for u in (-0.24, -0.08, 0.08, 0.24):
        s.tube("Frost", (x + u * 0.55, 2.48, z + 0.24), (x + u, 3.67, z + 0.39), 0.018, n=5)
    s.tube("Frost", (x, 3.79, z), (x, 4.22, z), 0.12)
    s.ellipsoid("Frost", (x, 4.73, z), (0.70, 0.66, 0.57))
    for side in (-1, 1):
        s.ellipsoid("Ink", (x + side * 0.27, 4.82, z + 0.505), (0.195, 0.17, 0.075))
    for i in range(-5, 5):

        def mouth(j):
            return (x + j * 0.092, 4.49 + 0.105 * (j / 5) ** 2, z + 0.53 - 0.15 * (j / 5) ** 2)

        s.tube("Ink", mouth(i), mouth(i + 1), 0.024, n=5)
        a, b, c = mouth(i)
        s.tube("Ink", (a, b - 0.04, c), (a + 0.015, b + 0.05, c), 0.015, n=5)
    for x, z in [(-10, 9), (-8, 11), (9, 9), (9, 1), (-11, -5)]:
        s.ellipsoid("Pumpkin", (x, 0.57, z), (0.74, 0.58, 0.62), 12, 8)
        s.tube("Holly", (x, 1.07, z), (x + 0.12, 1.34, z), 0.10, 0.07)
        for u in (-0.25, 0.25):
            s.face(
                "Ink",
                [
                    (x + u - 0.12, 0.65, z + 0.55),
                    (x + u + 0.12, 0.65, z + 0.55),
                    (x + u, 0.84, z + 0.55),
                ],
            )
        s.barrier(x, z, 1.4, 1.15)
    for x in (-4, 4):
        for j in range(7):
            s.box("Candy" if j % 2 else "Frost", (x, 0.4 + j * 0.8, -10), (0.95, 0.8, 0.95))
        s.barrier(x, -10, 1, 1)
    s.box("Glacier", (0, 5.65, -10), (9, 0.7, 1.2))
    s.sign("CHRISTMAS TOWN", 0, 5.65, -9.38, 6, 0.85, "#235768")
    for x, z, h in [(-9, -17, 4), (9, -19, 5), (-6, -22, 6), (3, -23, 4.5)]:
        for j in range(3):
            s.tube(
                "Ice" if j % 2 else "Frost",
                (x, 0.28 + j * h * 0.21, z),
                (x, h * (0.58 + j * 0.20), z),
                h * (0.32 - j * 0.065),
                0,
                8,
            )
        s.barrier(x, z, h * 0.53, h * 0.53)
    s.sign("HALLOWEEN TOWN", -4, 3.5, 14, 6, 1.1, "#44305e", sub="THE NIGHTMARE BEFORE CHRISTMAS")
    s.block("Glacier", -6.8, 13.95, 0.2, 0.2, 4)
    s.block("Glacier", -1.2, 13.95, 0.2, 0.2, 4)
    s.place("Spiral Hill", -6, 0)
    s.place("Christmas Town", 0, -18)
    s.way([[0, 24], [0, -20]], 4.5)
    s.save()


def springs():
    s = Venue("springs", (-24, 24, -27, 27))
    s.paint("Garden path", "trail-gravel.webp")
    s.paint("Rock", "trail-gravel.webp", ("#394d47", "#b9afa2"))
    s.pad("Garden path", 0, 0, 135, 135)
    # Foothill ridges enclose the valley beyond the conservatory and lodge.
    s.extras["furniture"] = []
    for band in range(2):

        def ridge(i, j):
            a = i * pi / 32
            dist = 50 + band * 32 + j * 21
            h = (11 + band * 13 + 6 * sin(5 * a) + 3 * cos(11 * a)) * j
            return (dist * cos(a), h - 1, dist * sin(a))

        for i in range(64):
            s.face(
                "Rock",
                [ridge(i, 0), ridge(i, 1), ridge(i + 1, 1), ridge(i + 1, 0)],
                [(0, 5), (0, 0), (4, 0), (4, 5)],
            )
            x, y, z = ridge(i, 1)
            for k in range(3):
                s.plan["trees"].append(
                    dict(
                        x=x + k * 1.7,
                        z=z + cos(i + k) * 1.7,
                        ground=y - 0.7,
                        height=4.5 + 1.5 * cos(i),
                        type="Coniferous",
                    )
                )
    s.block("Timber", -19, 0, 7.5, 31, 4.8)
    for z in range(-12, 14, 4):
        s.box("Silver", (-15.18, 2.4, z), (0.14, 1.7, 2.1))
        s.box("Glass", (-15.08, 2.4, z), (0.08, 1.4, 1.83))
    for x in (-23.7, -14.3):
        s.face("Slate", [(x, 4.7, -16), (x, 4.7, 16), (-19, 7.4, 16), (-19, 7.4, -16)])
    s.sign("INDIAN HOT SPRINGS", -19, 3.1, 15.57, 7, 1.6, sub="IDAHO SPRINGS  /  COLORADO")
    # A barrel-vaulted translucent pool house with open garden entrances at each end.
    for z in range(-22, 8, 4):
        for i in range(16):

            def arch(k, dz):
                a = k * pi / 16
                return (12.8 * cos(a), 2.9 + 7.2 * sin(a), z + dz)

            a, b = arch(i, 0), arch(i + 1, 0)
            s.tube("Linen", a, b, 0.095, n=6)
            if z < 6:
                s.face("Greenhouse", [a, b, arch(i + 1, 4), arch(i, 4)])
                if i % 2 == 0:
                    s.tube("Silver", a, arch(i, 4), 0.065, n=6)
        for x in (-12.8, 12.8):
            s.tube("Timber", (x, 0, z), (x, 2.9, z), 0.15)
            s.barrier(x, z, 0.3, 0.3)
    s.images["Greenhouse"] = Image.new("RGB", (2, 2), "#c0dde0")
    # Intersecting ripples give the mineral water a tiled caustic pattern.
    u, v = np.meshgrid(np.arange(256) * 2 * pi / 256, np.arange(256) * 2 * pi / 256)
    waves = np.sin(5 * u + 3 * v + np.sin(2 * v)) + np.cos(2 * u - 5 * v + 0.7 * np.cos(u))
    light = np.exp(-6 * np.abs(waves)) + 0.15 * np.cos(u + v)
    water = np.array([42, 143, 143]) + light[:, :, None] * np.array([71, 62, 47])
    s.images["Water"] = Image.fromarray(water.clip(0, 255).astype("uint8"))
    s.sign(
        "INDIAN HOT SPRINGS",
        0,
        3.3,
        -22.05,
        7.6,
        1.25,
        "#265456",
        sub="MINERAL WATER POOL   /   IDAHO SPRINGS",
    )
    for x in (-3.6, 3.6):
        s.block("Timber", x, -22.13, 0.16, 0.16, 3.8)
    outline = ring(0, -9, 6.6, 9)
    for i, (x, z) in enumerate(outline):
        u, v = outline[(i + 1) % len(outline)]
        face = [(0, 0.10, -9), (u, 0.10, v), (x, 0.10, z)]
        s.face("Water", face, [(px / 4, pz / 4) for px, _, pz in face])
        s.tube("Silver", (x, 0.16, z), (u, 0.16, v), 0.15, n=8)
    s.plan["water"].append(dict(points=outline))
    for i, (x, z) in enumerate([(-9, -17), (9, 2), (-10, 2), (10, -21), (-10, 17), (17, -13)]):
        s.tube("Timber", (x, 0, z), (x + 0.35, 4.6, z), 0.26, 0.18, 9)
        s.barrier(x, z, 0.62, 0.62)
        for j in range(11):
            a = j * 2.4 + i

            def leaf(t, side):
                r = 3.4 * t
                width = 0.50 * sin(pi * t) * side
                return (
                    x + 0.35 + r * cos(a) - width * sin(a),
                    4.6 + 1.1 * sin(pi * t) - 0.65 * t,
                    z + r * sin(a) + width * cos(a),
                )

            for k in range(5):
                for side in (-1, 1):
                    s.face(
                        "Palm" if j % 2 else "Leaf",
                        [
                            leaf(k / 5, 0),
                            leaf(k / 5, side),
                            leaf((k + 1) / 5, side),
                            leaf((k + 1) / 5, 0),
                        ],
                    )
    # River rocks, ferns and textured foliage soften the mineral pool edge.
    for i in range(27):
        a = i * pi * 2 / 27
        rx, rz = 7.08 * cos(a), -9 + 9.6 * sin(a)
        s.ellipsoid("Rock", (rx, 0.15, rz), (0.39 + 0.14 * sin(i), 0.24, 0.42), 9, 5)
    for i in range(16):
        side = (-1) ** i
        x = side * (10.5 + 0.8 * sin(i))
        z = -20 + 2.7 * (i // 2)
        s.extras["furniture"].append(["LowShrub", x, z, i])
        s.barrier(x, z, 1.05, 1.05)
    s.place("Mineral pool", 0, -9)
    s.place("Lodge", -18, 12)
    s.way([[0, 24], [0, 7], [-9, 1], [-9, -18], [0, -23], [9, -18], [9, 2], [0, 7]], 3)
    s.save()


def tile_pattern():
    img = Image.new("RGB", (192, 192), "#276179")
    draw = ImageDraw.Draw(img)
    for x, z in [(96, 96), (0, 0), (192, 0), (0, 192), (192, 192)]:
        for size, color in [
            (74, "#b89863"),
            (66, "#203e66"),
            (54, "#e3d2af"),
            (48, "#2e999a"),
            (33, "#264c76"),
            (19, "#d9b476"),
            (10, "#e8e2c5"),
        ]:
            points = [
                (
                    x + size * (1 if i % 2 == 0 else 0.65) * cos(i * pi / 8),
                    z + size * (1 if i % 2 == 0 else 0.65) * sin(i * pi / 8),
                )
                for i in range(16)
            ]
            draw.polygon(points, fill=color)
    return img


def pearl():
    s = Venue("pearl", (-32, 34, -9, 39))
    s.paint("Masonry", "brick-facade.webp")
    s.paint("Pavers", "street-concrete.webp", ("#975e4e", "#d5b6a1"))
    s.paint("Garden", "grass.webp")
    s.images["Faience"] = tile_pattern()
    # Staggered brick paving from the same concrete grain as the Denver curb.
    tile = s.images["Pavers"].resize((256, 256))
    draw = ImageDraw.Draw(tile)
    for row in range(16):
        y = row * 16
        draw.line((0, y, 256, y), fill="#a18b7d", width=1)
        for x in range(-16 + (row % 2) * 16, 257, 32):
            draw.line((x, y, x, y + 16), fill="#92796c", width=1)
    s.images["Pavers"] = tile
    s.pad("Garden", 0, 10, 215, 175)
    s.pad("Pavers", 0, 0, 94, 16, 0.025)
    s.pad("Pavers", 15, 20, 13, 42, 0.026)
    for z in (-6, 6):
        s.pad("Linen", 0, z, 76, 0.18, 0.034)
    # Two rows of independent storefronts open onto the brick mall.
    shops = [
        ("BOOKS", "Cobalt"),
        ("PRINT SHOP", "Holly"),
        ("CAFE", "Candy"),
        ("RECORDS", "Ink"),
        ("PAPER GOODS", "Holly"),
        ("OUTFITTERS", "Cobalt"),
    ]
    for side in (-1, 1):
        for i, x in enumerate(range(-30, 36, 11)):
            if side == 1 and x >= 8:
                continue
            z = side * 14
            h = 6.8 + ((i * 7 + side) % 4) * 0.62
            s.block("Masonry", x, z, 10.8, 10, h)
            face = side * 8.96
            s.box("Linen", (x, h - 0.18, face), (11, 0.32, 0.46))
            name, awning = shops[(i + (side + 1)) % len(shops)]
            for dx in (-3, 0, 3):
                s.box("Glass", (x + dx, 1.51, face), (2.62, 2.78, 0.15))
                s.box("Gold", (x + dx, 2.43, face - side * 0.09), (2.60, 0.055, 0.08))
                s.box("Timber", (x + dx + 0.96, 1.51, face - side * 0.09), (0.065, 2.74, 0.08))
                for j in range(3):
                    s.box(
                        ("Ochre", "Copper", "Clay")[(j + i) % 3],
                        (x + dx - 0.7 + j * 0.46, 0.72 + 0.11 * j, face - side * 0.10),
                        (0.32, 0.52 + 0.22 * j, 0.08),
                    )
                s.box("Timber", (x + dx, 0.35, face - side * 0.12), (2.60, 0.14, 0.12))
                s.box("Timber", (x + dx, 5.36, face), (1.63, 1.82, 0.21))
                s.box("Glass", (x + dx, 5.36, face - side * 0.13), (1.4, 1.59, 0.11))
            s.face(
                awning,
                [
                    (x - 5, 3.42, face),
                    (x + 5, 3.42, face),
                    (x + 5, 2.98, face - side * 1.25),
                    (x - 5, 2.98, face - side * 1.25),
                ],
            )
            s.sign(
                name, x, 3.93, face - side * 0.13, 7, 0.85, "#343b39", yaw=pi if side == 1 else 0
            )
    # The short garden walk ends inside a pavilion with tiled panels, painted
    # ceiling bays, carved columns and a central teapot and cups.
    for x in (6, 24):
        s.block("Faience", x, 31, 0.55, 14, 2.6)
    s.block("Faience", 15, 38, 18.5, 0.5, 3.7)
    for x in (6, 12, 18, 24):
        for z in (24, 37.8):
            s.tube("Timber", (x, 0, z), (x, 4.7, z), 0.25, 0.21, 12)
            s.tube("Gold", (x, 0.08, z), (x, 0.42, z), 0.36, 0.29, 12)
            s.tube("Tile", (x, 3.9, z), (x, 4.55, z), 0.24, 0.52, 12)
            for y in (1.1, 1.23, 3.5, 3.6):
                s.tube("Ochre", (x, y, z), (x, y + 0.07, z), 0.26, n=12)
            s.barrier(x, z, 0.52, 0.52)
    for x in (5.3, 24.7):
        s.face("Copper", [(x, 4.6, 22.7), (x, 4.6, 39), (15, 7.2, 38), (15, 7.2, 24)])
    s.box("Gold", (15, 4.57, 23.2), (19.7, 0.38, 0.35))
    s.pad("Faience", 15, 31, 18.6, 15, 4.76, 2.3)
    for x in (7.2, 22.8):
        s.box("Faience", (x, 2, 24), (2.1, 3.95, 0.4))
        s.barrier(x, 24, 2.1, 0.4)
    s.sign("DUSHANBE TEAHOUSE", 15, 4.2, 23.45, 8.4, 0.95, "#21535a", yaw=pi)
    s.block("Timber", 15, 33, 2.6, 1.3, 0.76)
    s.ellipsoid("Tile", (15, 1.04, 33), (0.36, 0.26, 0.31))
    s.ellipsoid("Gold", (15, 1.30, 33), (0.17, 0.055, 0.17))
    s.tube("Tile", (14.72, 1.03, 33), (14.46, 1.22, 33), 0.13, 0.075)
    for x in (14.1, 15.8):
        s.tube("Linen", (x, 0.77, 33), (x, 0.96, 33), 0.1, 0.15, 16)
    s.extras["furniture"] = []
    for x in (-23, -12, 0, 11, 24):
        for side in (-1, 1):
            if side == 1 and x == 11:
                continue
            z = side * 5.4
            s.extras["furniture"].append(["Bench", x, z, pi if side < 0 else 0])
            s.barrier(x, z, 2, 0.85)
            s.extras["furniture"].append(["PathLamp", x + 2.3, z, 0])
            s.barrier(x + 2.3, z, 0.2, 0.2)
    for x in range(-26, 35, 10):
        for side in (-1, 1):
            z = side * 4.45
            s.plan["trees"].append(dict(x=x, z=z, height=5.9 + cos(x) * 0.85, species="Oak"))
            s.pad("Ink", x, z, 1.02, 1.02, 0.043)
    for x, z in [(2, 18), (26, 18), (1, 32), (29, 33)]:
        s.plan["trees"].append(dict(x=x, z=z, height=7.6, species="Oak"))
    s.way([[-30, 0], [30, 0]], 10)
    s.way([[15, 0], [15, 36]], 6)
    s.place("Pearl Street", -15, 0)
    s.place("Dushanbe Teahouse", 15, 31)
    s.save()


if __name__ == "__main__":
    for build in (airport, ice_gallery, springs, pearl):
        build()
