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
    **{"Teahouse glass": "92bcc1", "Hammered copper": "996c53"},
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


def arrivals_glazing():
    # One six-metre curtain-wall bay viewed from the curb. Interior soffits,
    # columns and waiting seats sit beneath the cooler reflection of the sky.
    w, h = 384, 352
    y, x = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    stops = [0, 0.34, 0.48, 0.69, 0.77, 1]
    colors = np.array(
        [[31, 59, 75], [61, 93, 108], [116, 132, 128], [78, 96, 94], [51, 73, 79], [35, 52, 62]]
    )
    glass = np.stack([np.interp(y, stops, c) for c in colors.T], axis=-1)
    glass += (5 * np.sin(2 * pi * (x - y * 0.34)))[:, :, None]
    img = Image.fromarray(glass.astype("uint8"))
    draw = ImageDraw.Draw(img, "RGBA")
    for x in range(24, w + 50, 74):
        draw.polygon(
            [(x, 168), (x + 4, 168), (x + 53, 116), (x + 46, 116)], fill=(244, 218, 174, 144)
        )
    for x in (68, 263):
        draw.polygon([(x, 143), (x + 9, 140), (x + 9, 256), (x, 251)], fill=(47, 60, 66, 168))
    for x in (5, 27, 49, 128, 150, 172, 294, 316, 338):
        draw.rounded_rectangle((x, 234, x + 18, 246), radius=3, fill=(28, 47, 59, 188))
        draw.line((x + 2, 249, x + 20, 249), fill=(134, 149, 151, 190), width=2)
        draw.line((x + 9, 248, x + 7, 255), fill=(35, 53, 63, 210), width=2)
    draw.polygon([(155, 0), (225, 0), (97, h), (60, h)], fill=(178, 221, 235, 18))
    return img


def airport_shuttle(s):
    # A chamfered shell clears the undercarriage. Wheel faces point outwards
    # on both sides so the low curbside view sees rubber, hubs and lug nuts.
    s.barrier(10.6, -19, 2.7, 7.9)
    profile = [
        (-1.22, 0.48),
        (-1.35, 0.62),
        (-1.35, 2.47),
        (-1.19, 2.65),
        (1.19, 2.65),
        (1.35, 2.47),
        (1.35, 0.62),
        (1.22, 0.48),
    ]
    for i, (x, y) in enumerate(profile):
        u, v = profile[(i + 1) % len(profile)]
        s.face(
            "Linen",
            [
                (10.6 + x, y, -22.95),
                (10.6 + u, v, -22.95),
                (10.6 + u, v, -15.05),
                (10.6 + x, y, -15.05),
            ],
        )
    for z in (-22.95, -15.05):
        end = [(10.6 + x, y, z) for x, y in profile]
        s.face("Linen", end, [(0, 0)] * len(end))
    s.box("Ink", (10.6, 0.43, -19), (2.38, 0.32, 7.7))
    s.box("Silver", (10.6, 2.72, -19.7), (1.9, 0.24, 3.2))
    panes = Image.new("RGB", (160, 96))
    glass = ImageDraw.Draw(panes)
    for y in range(96):
        color = tuple(
            round(np.interp(y, [0, 39, 55, 95], values))
            for values in [(31, 64, 85, 41), (55, 88, 109, 64), (74, 108, 121, 74)]
        )
        glass.line((0, y, 159, y), fill=color)
    for x in (8, 49, 90, 131):
        glass.rounded_rectangle((x, 63, x + 19, 118), radius=6, fill=(42, 60, 68))
    s.images["Shuttle glazing"] = panes
    for side in (-1, 1):
        x = 10.6 + side * 1.36
        for i in range(5):
            z = -22.1 + i * 1.44
            s.box("Ink", (x, 1.82, z), (0.05, 1.14, 1.34))
            px = x + side * 0.036
            s.face(
                "Shuttle glazing",
                [
                    (px, 1.32, z + 0.61),
                    (px, 1.32, z - 0.61),
                    (px, 2.31, z - 0.61),
                    (px, 2.31, z + 0.61),
                ],
            )
        s.box("Tile", (x, 0.91, -19), (0.08, 0.29, 7.85))
        s.box("Ochre", (x, 1.11, -19), (0.08, 0.055, 7.85))
        for z in (-21.5, -16.5):
            for mat, inset, outset, radius in [
                ("Ink", -0.12, 0.12, 0.51),
                ("Steel", 0.12, 0.14, 0.31),
                ("Silver", 0.14, 0.16, 0.23),
                ("Steel", 0.16, 0.175, 0.095),
            ]:
                s.tube(mat, (x + side * inset, 0.51, z), (x + side * outset, 0.51, z), radius, n=18)
            for k in range(6):
                a = k * pi / 3
                p, q = 0.51 + 0.15 * cos(a), z + 0.15 * sin(a)
                s.tube("Ink", (x + side * 0.16, p, q), (x + side * 0.169, p, q), 0.024, n=6)
        s.tube("Steel", (x, 2.13, -15.52), (x + side * 0.28, 2.05, -15.28), 0.035)
        s.box("Ink", (x + side * 0.28, 1.92, -15.28), (0.12, 0.31, 0.19))
    s.box("Glass", (10.6, 1.88, -15.02), (2.42, 0.85, 0.06))
    # A two-leaf glazed folding door faces the player at the boarding prompt.
    s.box("Ink", (9.185, 1.32, -18.95), (0.07, 2.12, 1.52))
    for dz in (-0.35, 0.35):
        s.box("Glass", (9.14, 1.56, -18.95 + dz), (0.04, 1.49, 0.59))
        s.box("Amber", (9.13, 0.38, -18.95 + dz), (0.05, 0.055, 0.58))
    s.sign("DOVER SHUTTLE", 10.6, 2.44, -14.99, 2.36, 0.31)
    for x in (9.63, 11.57):
        s.box("Glow", (x, 0.79, -14.98), (0.46, 0.18, 0.09))
    s.box("Steel", (10.6, 0.58, -15.02), (2.55, 0.15, 0.13))


def arrivals_drive(s):
    # Two lanes run south past the shuttle, curving back into the garage
    # at both ends. Station zero is halfway along the terminal curb.
    straight, radius = 24, 13
    bend_end = straight + radius * pi / 2
    end = bend_end + 25

    def point(station, inset, height):
        beyond = abs(station) - straight
        if beyond <= 0:
            return (12 + inset, height, station)
        angle = min(beyond / radius, pi / 2)
        x = 25 - (radius - inset) * cos(angle) + max(0, abs(station) - bend_end)
        z = straight + (radius - inset) * sin(angle)
        return (x, height, z if station > 0 else -z)

    def ribbon(mat, start, stop, left, right, h0, h1):
        # Split exactly at the tangents so paint and curb follow the asphalt.
        tangents = (-bend_end, -straight, straight, bend_end)
        cuts = [start, *(v for v in tangents if start < v < stop), stop]
        for low, high in zip(cuts, cuts[1:]):
            stations = np.linspace(low, high, max(2, int(np.ceil((high - low) / 1.5)) + 1))
            for a, b in zip(stations, stations[1:]):
                s.face(
                    mat,
                    [point(a, left, h0), point(b, left, h0), point(b, right, h1), point(a, right, h1)],
                    [(left / 3, a / 3), (left / 3, b / 3), (right / 3, b / 3), (right / 3, a / 3)],
                )

    s.paint("Verge", "trail-gravel.webp", ("#504c41", "#9c957c"))
    s.pad("Verge", 10, 0, 210, 190, -0.04)
    ribbon("Road", -end, end, -4, 4, 0, 0)
    ribbon("Paving", -end, end, 4, 4, -0.04, 0.16)
    ribbon("Paving", -end, end, 4, 4.45, 0.16, 0.16)
    ribbon("Paving", -end, end, 4.45, 4.45, 0.16, -0.04)
    for start in range(-65, 66, 5):
        ribbon("Linen", start, start + 2.2, -0.07, 0.07, 0.014, 0.014)
    for z in (-10, 14):
        for x in (10, 14):
            s.pad("Linen", x, z, 0.16, 1.9, 0.015)
            s.face("Linen", [(x - 0.46, 0.015, z + 0.95), (x, 0.015, z + 2),
                             (x + 0.46, 0.015, z + 0.95)])
    route = [point(v, 0, 0) for v in np.linspace(-end, end, 81)]
    s.plan["roads"].append(dict(points=[[x, z] for x, _, z in route], width=8))

    # Floor slabs, recessed lights and open bays give the two portals depth.
    for y in (4.3, 7.6):
        s.box("Paving", (46, y, 0), (17, 0.5, 87))
        s.box("Silver", (37.6, y + 0.53, 0), (0.32, 0.85, 87))
    s.block("Ink", 50, 0, 0.6, 87, 8)
    for z in (-43, -31, -20, -10, 0, 10, 20, 31, 43):
        s.block("Steel", 38.2, z, 0.75, 0.85, 7.6)
        s.box("Glow", (40, 4, z * 0.88), (2.6, 0.09, 0.24))
    for z, label in [(-37, "Terminal West"), (37, "Airport exit")]:
        s.box("Ink", (37.47, 4.73, z), (0.16, 1.2, 8.7))
        s.sign(label, 37.37, 4.73, z, 8.5, 1.12, yaw=-pi / 2)
    # The elevator lobby breaks up the open deck and marks pedestrian access.
    s.block("Steel", 38.8, 3, 4.5, 6, 10.2)
    for y in (1.8, 5.2, 8.5):
        for z in (1.2, 3, 4.8):
            s.box("Glass", (36.52, y, z), (0.12, 2.85, 1.67))
        s.box("Glow", (36.41, y + 1.4, 3), (0.12, 0.1, 5.5))
    s.sign("P", 36.39, 7.1, 3, 2.4, 2.4, "#225181", yaw=-pi / 2)
    # Catch the driver's eye before the southbound lanes turn left.
    s.tube("Steel", (18, 0, 23.5), (18, 6.2, 23.5), 0.14)
    s.box("Steel", (15.2, 5.95, 23.5), (5.7, 0.17, 0.22))
    s.box("Steel", (13, 5.45, 23.5), (5.9, 1.3, 0.18))
    s.sign("Exit to Denver", 13, 5.45, 23.39, 5.8, 1.2, "#235446", yaw=pi, sub="ALL LANES")
    for z in (-21, -8, 7, 22):
        s.plan["trees"].append(dict(x=24, z=z, height=4.6, type="Coniferous", species="Spruce"))


def airport():
    s = Venue("airport", (-13, 16, -30, 27))
    s.paint("Road", "street-asphalt.webp")
    s.paint("Paving", "street-concrete.webp", ("#414957", "#b4b9c0"))
    s.extras["furniture"] = []
    for z in (-20, -6, 7, 20):
        s.extras["furniture"].append(["Bench", -11.7, z, pi / 2])
        s.barrier(-11.7, z, 0.9, 2)
    arrivals_drive(s)
    s.pad("Paving", -3, 0, 22, 62, 0.015)
    s.way([[0, 24], [0, -20], [7.6, -19]], 6)
    # West terminal curtain wall, a bank of sliding doors and scalloped tent bays.
    s.block("Glass", -15, 0, 3, 75, 7.5)
    s.images["Arrivals glazing"] = arrivals_glazing()
    for z in range(-33, 37, 6):
        s.face(
            "Arrivals glazing",
            [
                (-13.48, 0.14, z + 3),
                (-13.48, 0.14, z - 3),
                (-13.48, 7.45, z - 3),
                (-13.48, 7.45, z + 3),
            ],
        )
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
        for dz in (-3.2, 3.2):
            s.tube("Steel", (-4.4, 5.9, z), (-6.45, 7.65, z + dz), 0.06, n=6)
    # Lit entries and aluminum mullions break up the dark curtain wall.
    for z in range(-33, 37, 6):
        s.box("Glow", (-13.36, 5.62, z), (0.06, 0.14, 4.8))
        for dz in (-1.6, 1.6):
            s.box("Steel", (-13.25, 1.5, z + dz), (0.14, 3, 0.12))
        s.box("Silver", (-13.25, 3.0, z), (0.14, 0.15, 3.35))
        s.box("Amber", (-13.24, 0.86, z), (0.18, 0.055, 3.24))
        s.box("Silver", (-13.23, 1.5, z), (0.12, 2.96, 0.07))
        for dz in (-0.27, 0.27):
            s.box("Silver", (-13.11, 1.16, z + dz), (0.12, 0.38, 0.045))
    # Curb joints, a pale edge stripe and banded bollards frame the shuttle bay.
    # Keep the boarding zone at the same ground height as the hunt route.
    s.pad("Ochre", 7.84, 0, 0.22, 61, 0.021)
    for z in range(-28, 31, 4):
        s.pad("Steel", -2.9, z, 21.4, 0.022, 0.022)
    for z in (-24, -12, -6, 0, 9, 17, 24):
        s.tube("Steel", (6.95, 0, z), (6.95, 0.92, z), 0.125, n=10)
        s.tube("Silver", (6.95, 0.59, z), (6.95, 0.73, z), 0.131, n=10)
        s.tube("Amber", (6.95, 0.78, z), (6.95, 0.83, z), 0.131, n=10)
        s.barrier(6.95, z, 0.25, 0.25)
    for i, (x, z) in enumerate([(-7, 17), (-8, -9), (-8.8, 12)]):
        s.block("Plum" if i % 2 else "Copper", x, z, 0.82, 0.48, 1.15)
        for side in (-1, 1):
            s.tube("Silver", (x + side * 0.17, 1.1, z), (x + side * 0.17, 1.46, z), 0.025)
            s.ellipsoid("Ink", (x + side * 0.32, 0.12, z + 0.2), (0.09, 0.11, 0.08), 8, 6)
        s.box("Ink", (x, 1.46, z), (0.4, 0.08, 0.08))
        for j in range(4):
            s.box("Steel", (x - 0.27 + j * 0.18, 0.65, z + 0.245), (0.03, 0.75, 0.025))
    for z in (-23, -7, 9, 23):
        s.tube("Silver", (16.7, 0, z), (16.7, 8, z), 0.10)
        s.box("Steel", (15.8, 8, z), (2.1, 0.13, 0.34))
        s.box("Glow", (15.2, 7.91, z), (0.82, 0.05, 0.3))
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
    airport_shuttle(s)
    s.sign("Ground transportation", 1, 3.8, 5, 6.8, 1.15, sub="SHUTTLES   /   ISLAND 5")
    s.sign("Ground transportation", 1, 3.8, 4.96, 6.8, 1.15, yaw=pi, sub="SHUTTLES   /   ISLAND 5")
    for x in (-2.25, 4.25):
        s.block("Steel", x, 4.93, 0.13, 0.13, 4.4)
    s.place("Terminal West", -10, 10)
    s.place("Ground transportation", 2, -1)
    s.place("Shuttle island", 8, -19)
    s.save()


def ice_pumpkin(s, x, z):
    # Eight scalloped ribs catch the colored lamps around the carved face.
    def skin(i, j):
        a, b = i * pi / 16, (j / 8 - 0.5) * pi
        r = cos(b) * (0.92 + 0.08 * cos(8 * a))
        return (x + 0.78 * r * cos(a), 0.55 + 0.55 * sin(b), z + 0.66 * r * sin(a))

    for j in range(8):
        for i in range(32):
            s.face("Pumpkin", [skin(i, j), skin(i, j + 1), skin(i + 1, j + 1), skin(i + 1, j)])
    s.tube("Holly", (x, 1.07, z), (x + 0.12, 1.34, z), 0.10, 0.07)

    def face_point(u, y):
        depth = 0.66 * (max(0, 1 - (u / 0.78) ** 2 - ((y - 0.55) / 0.55) ** 2) ** 0.5)
        return (x + u, y, z + depth + 0.018)

    for u in (-0.25, 0.25):
        s.face("Ink", [face_point(u - 0.11, 0.65), face_point(u + 0.11, 0.65), face_point(u, 0.82)])
    s.face("Ink", [face_point(-0.055, 0.52), face_point(0.055, 0.52), face_point(0, 0.61)])
    grin = [
        (-0.41, 0.52),
        (-0.27, 0.42),
        (-0.16, 0.45),
        (0, 0.36),
        (0.16, 0.45),
        (0.27, 0.42),
        (0.41, 0.52),
    ]
    for (a, ay), (b, by) in zip(grin, grin[1:]):
        s.face(
            "Ink",
            [
                face_point(a, ay - 0.046),
                face_point(b, by - 0.046),
                face_point(b, by),
                face_point(a, ay),
            ],
        )
    s.barrier(x, z, 1.4, 1.15)


def ice_gallery():
    s = Venue("ice", (-14, 14, -27, 27))
    s.paint("Frozen floor", "street-concrete.webp", ("#69799e", "#c2d6eb"))
    # Saw-cut floors use offset seams and fine skate-like scratches below the
    # sculptures. The tile repeats over four metres, sized for the low camera.
    slab = s.images["Frozen floor"].resize((512, 512))
    etch = ImageDraw.Draw(slab, "RGBA")
    marks = Random(418)
    for j in range(4):
        start = j * 128
        etch.line((0, start, 512, start), fill=(54, 78, 113, 106), width=2)
        etch.line((0, start + 2, 512, start + 2), fill=(225, 244, 248, 88))
        for x in (32 + (j % 2) * 131, 288 + (j % 2) * 131):
            etch.line((x, start, x, start + 128), fill=(65, 92, 125, 101), width=2)
    for i in range(100):
        x, y = marks.randrange(512), marks.randrange(512)
        etch.line(
            [(x, y), (x + 14, y + 5), (x + marks.randrange(20, 60), y + 11)],
            fill=(227, 243, 255, marks.randrange(18, 54)),
        )
    s.images["Frozen floor"] = slab
    s.pad("Frozen floor", 0, 0, 30, 56, tile=4)
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
            # Snow cornice, crooked chimney, a recessed door and pointed lintel.
            s.box("Frost", (x, 2.85, z), (3.22, 0.16, 1.96))
            s.tube("Glacier", (x + side * 0.94, 3.2, z), (x + side * 1.23, 4.82, z), 0.21, n=4)
            s.box("Ice", (x + side * 1.23, 4.82, z), (0.48, 0.16, 0.47))
            s.box("Ink", (x, 0.75, z + 0.915), (0.70, 1.5, 0.04))
            for side_x in (-1, 1):
                s.tube(
                    "Ice",
                    (x + side_x * 0.41, 0.06, z + 0.95),
                    (x + side_x * 0.41, 1.42, z + 0.95),
                    0.065,
                    n=5,
                )
                s.tube("Ice", (x + side_x * 0.41, 1.42, z + 0.95), (x, 1.72, z + 0.95), 0.065, n=5)
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
    s.box("Frost", (x, 0.46, z), (3.36, 0.07, 2.86))
    for dx in (-1.0, -0.5, 0, 0.5, 1.0):
        s.face(
            "Glacier",
            [
                (x + dx - 0.11, 0.24, z + 1.409),
                (x + dx, 0.10, z + 1.409),
                (x + dx + 0.11, 0.24, z + 1.409),
                (x + dx, 0.38, z + 1.409),
            ],
        )
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
        ice_pumpkin(s, x, z)
    for x in (-4, 4):
        for j in range(7):
            s.box("Candy" if j % 2 else "Frost", (x, 0.4 + j * 0.8, -10), (0.95, 0.8, 0.95))
        s.barrier(x, -10, 1, 1)
    s.box("Glacier", (0, 5.65, -10), (9, 0.7, 1.2))
    s.sign("CHRISTMAS TOWN", 0, 5.65, -9.38, 6, 0.85, "#235768")
    # Carved six-arm reliefs catch the colored light on the end wall.
    for x in (-9.2, 9.2):
        for k in range(6):
            a = k * pi / 3 + pi / 6
            u, v = cos(a), sin(a)
            s.tube(
                "Glacier",
                (x, 5.5, -26.82),
                (x + 2.65 * u, 5.5 + 2.65 * v, -26.82),
                0.12,
                0.073,
                n=4,
            )
            for r in (1.15, 1.83):
                for side in (-1, 1):
                    bx, by = x + r * u, 5.5 + r * v
                    s.tube(
                        "Ice",
                        (bx, by, -26.81),
                        (bx + 0.40 * u - side * 0.42 * v, by + 0.40 * v + side * 0.42 * u, -26.81),
                        0.077,
                        0.028,
                        n=4,
                    )
    for x, z, h in [(-9, -17, 4), (9, -19, 5), (-6, -22, 6), (3, -23, 4.5)]:
        s.tube("Glacier", (x, 0, z), (x, 0.5, z), h * 0.11, n=8)
        for j in range(3):
            s.tube(
                "Ice" if j % 2 else "Frost",
                (x, 0.28 + j * h * 0.21, z),
                (x, h * (0.58 + j * 0.20), z),
                h * (0.32 - j * 0.065),
                0,
                8,
            )
        # Faceted stars at the tips pick up the warm carved window light.
        y = h * 0.98 + 0.18
        for k in range(10):
            corners = []
            for i in (k, k + 1):
                a = i * pi / 5 + pi / 2
                r = 0.14 if i % 2 else 0.36
                corners.append((x + r * cos(a), y + r * sin(a), z))
            for depth in (-0.095, 0.095):
                s.face("Amber", [(x, y, z + depth), *corners])
        s.barrier(x, z, h * 0.53, h * 0.53)
    # A carved gateway frames the approach without narrowing the walking lane.
    s.sign(
        "HALLOWEEN TOWN",
        -4,
        3.74,
        14.12,
        5.35,
        0.90,
        "#44305e",
        sub="THE NIGHTMARE BEFORE CHRISTMAS",
    )
    for side in (-1, 1):
        x = -4 + side * 2.8
        s.block("Glacier", x, 13.95, 0.70, 0.72, 0.28)
        s.tube("Glacier", (x, 0.22, 13.95), (x, 3.9, 13.95), 0.28, 0.18, 5)
        s.tube("Ice", (x, 3.88, 13.95), (x + side * 0.13, 4.78, 13.95), 0.30, 0, 5)
        ribs = [(x, 3.1), (x - side * 0.55, 4.21), (-4 + side * 0.85, 4.43), (-4, 4.97)]
        for (u, y), (v, h) in zip(ribs, ribs[1:]):
            s.tube("Violet", (u, y, 13.92), (v, h, 13.92), 0.17, 0.12, 5)
    s.place("Halloween Town", -4, 14)
    s.place("Spiral Hill", -6, 0)
    s.place("Christmas Town", 0, -18)
    s.way([[0, 24], [0, -20]], 4.5)
    s.save()


def pool_deck(s):
    s.paint("Pool deck", "street-concrete.webp", ("#897f6d", "#e4ddc6"))
    tile = s.images["Pool deck"].resize((384, 384))
    grout = ImageDraw.Draw(tile, "RGBA")
    for row in range(6):
        y = row * 64
        grout.line((0, y, 384, y), fill=(87, 81, 74, 138), width=2)
        for x in range(64 * (row % 2), 384, 128):
            grout.line((x, y, x, y + 64), fill=(87, 81, 74, 130), width=2)
    s.images["Pool deck"] = tile

    # Flat coping stones meet a blue-green glazed waterline tile. Inset the
    # ends of each stone to reveal a thin mortar joint around the oval.
    def edge(angle, offset, y):
        return ((6.6 + offset) * cos(angle), y, -9 + (9 + offset) * sin(angle))

    for i in range(64):
        a, b = i * pi / 32, (i + 1) * pi / 32
        deck = [
            edge(a, -0.04, 0.12),
            edge(a, 2.05, 0.024),
            edge(b, 2.05, 0.024),
            edge(b, -0.04, 0.12),
        ]
        s.face("Pool deck", deck, [(x / 2.8, z / 2.8) for x, _, z in deck])
        s.face(
            "Tile",
            [
                edge(a, -0.035, 0.09),
                edge(a, -0.035, 0.22),
                edge(b, -0.035, 0.22),
                edge(b, -0.035, 0.09),
            ],
        )
        a, b = a + 0.0015, b - 0.0015
        coping = [
            edge(a, -0.055, 0.22),
            edge(a, 0.38, 0.17),
            edge(b, 0.38, 0.17),
            edge(b, -0.055, 0.22),
        ]
        s.face("Linen", coping)
        s.face("Silver", [coping[1], edge(a, 0.38, 0.10), edge(b, 0.38, 0.10), coping[2]])
    # Bent stainless ladder handles just inside the rim, with a rung at
    # water level and anchor flanges seated in the paving.
    for z in (-9.42, -8.58):
        rail = [
            (7.40, 0.11),
            (7.4, 0.74),
            (7.31, 0.95),
            (7.12, 1.04),
            (6.64, 1.04),
            (6.44, 0.93),
            (6.36, 0.70),
            (6.36, 0.08),
        ]
        for (x, y), (u, v) in zip(rail, rail[1:]):
            s.tube("Silver", (x, y, z), (u, v, z), 0.047, n=8)
        s.tube("Steel", (7.4, 0.11, z), (7.4, 0.16, z), 0.11, n=12)
    s.box("Silver", (6.36, 0.18, -9), (0.16, 0.055, 0.85))
    s.barrier(6.9, -9, 1.12, 0.96)


def garden_palm(s, x, z, rotation):
    s.tube("Timber", (x, 0, z), (x + 0.35, 4.6, z), 0.26, 0.18, 9)
    s.barrier(x, z, 0.62, 0.62)
    for k in range(9):
        t = (k + 0.5) / 9
        p = x + 0.35 * t
        s.tube(
            "Ochre", (p, 4.6 * t, z), (p, 4.6 * t + 0.065, z), 0.28 - 0.08 * t, 0.25 - 0.08 * t, 9
        )
    for j in range(11):
        a = j * 2.4 + rotation
        length = 3 + 0.55 * cos(a)

        def point(t, side=0, drop=0):
            return (
                x + 0.35 + length * t * cos(a) - side * sin(a),
                4.6 + 1.12 * sin(pi * t) - 0.68 * t - drop,
                z + length * t * sin(a) + side * cos(a),
            )

        for k in range(6):
            t, end = k / 6, (k + 1) / 6
            s.face(
                "Leaf", [point(t, -0.035), point(t, 0.035), point(end, 0.035), point(end, -0.035)]
            )
        for k in range(7):
            t = 0.04 + k * 0.13
            span = 0.16 + sin(pi * (t + 0.04)) * 0.49
            for side in (-1, 1):
                tip = point(min(1.03, t + 0.19), side * span, span * 0.56)
                fold = point(t + 0.09, side * span * 0.52, span * 0.12)
                s.face("Palm", [point(t), tip, fold])
                s.face("Leaf", [fold, tip, point(t + 0.088)])


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
    # Horizontal lap boards and a post-and-beam veranda give the lodge a
    # sheltered edge along the garden walk, visible from across the water.
    for y in np.arange(0.23, 4.65, 0.28):
        s.box("Timber", (-15.24, y, 0), (0.10, 0.065, 30.9))
    s.face(
        "Slate",
        [(-15.22, 3.75, -13.3), (-13.70, 3.14, -13.3), (-13.70, 3.14, 13.3), (-15.22, 3.75, 13.3)],
    )
    s.box("Ochre", (-13.72, 3.05, 0), (0.16, 0.22, 26.6))
    for z in (-13, -6.5, 0, 6.5, 13):
        s.block("Timber", -13.78, z, 0.23, 0.23, 3.14)
        for side in (-1, 1):
            s.tube("Ochre", (-13.78, 2.48, z), (-13.78, 3.02, z + side * 0.55), 0.067, n=4)
    for z in range(-12, 14, 4):
        s.box("Silver", (-15.18, 2.4, z), (0.14, 1.7, 2.1))
        s.box("Glass", (-15.08, 2.4, z), (0.08, 1.4, 1.83))
    for x in (-23.7, -14.3):
        s.face("Slate", [(x, 4.7, -16), (x, 4.7, 16), (-19, 7.4, 16), (-19, 7.4, -16)])
    s.sign("MINERAL BATHS", -19, 3.1, 15.57, 6.5, 1.25, "#3f5148", sub="INDIAN HOT SPRINGS")
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
    s.plan["water"].append(dict(points=outline))
    pool_deck(s)
    for i, (x, z) in enumerate([(-9, -17), (9, 2), (-10, 2), (10, -21), (-10, 17), (17, -13)]):
        garden_palm(s, x, z, i)
    # River rocks, ferns and textured foliage soften the mineral pool edge.
    for i in range(24):
        a = i * pi * 2 / 24
        rx, rz = 8.92 * cos(a), -9 + 11.3 * sin(a)
        # Two planted side beds leave the approach and the ladder landing open.
        if abs(cos(a)) > 0.7 and abs(sin(a)) > 0.19:
            s.ellipsoid("Rock", (rx, 0.09, rz), (0.44 + 0.15 * sin(i), 0.19, 0.3), 9, 5)
    for i in range(16):
        side = (-1) ** i
        x = side * (10.5 + 0.8 * sin(i))
        z = -20 + 2.7 * (i // 2)
        s.extras["furniture"].append(["LowShrub", x, z, i])
        s.barrier(x, z, 1.05, 1.05)
    s.place("Mineral pool", 0, -9)
    s.place("Palm garden", -9.5, 17)
    s.place("Lodge", -18, 12)
    s.way([[0, 24], [0, 7], [-9, 1], [-9, -18], [0, -23], [9, -18], [9, 2], [0, 7]], 3)
    s.save()


def pearl():
    from pearl_street import build_pearl

    venue = Venue("pearl", (-48, 50, -25, 66))
    build_pearl(venue)
    venue.save()


if __name__ == "__main__":
    for build in (airport, ice_gallery, springs, pearl):
        build()
