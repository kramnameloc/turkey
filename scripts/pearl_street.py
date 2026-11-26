"""A compressed downtown Boulder walk. X is east and Z is south."""

from math import cos, pi, sin
from random import Random

from PIL import Image, ImageDraw, ImageFilter, ImageOps

SHOP_NAMES = ("BOOKS", "PAPER & INK", "COFFEE", "RECORDS", "PRINTS", "MARKET")


def surface(s, material, color, x, z, w, d, top, tile=3):
    s.pad(material, x, z, w, d, top, tile)
    s.plan["surfaces"].append(dict(rect=[x - w / 2, z - d / 2, w, d], color=color))


def merchant_marks():
    """Small enamel trade signs in a single atlas, in the order used by shop()."""
    sheets = Image.new("RGB", (192 * 6, 112))
    brass, ivory = "#c6a465", "#f8ead1"
    for i, ground in enumerate(
        ("#264d45", "#443649", "#673b31", "#2e414d", "#674735", "#3c5042")
    ):
        plate = Image.new("RGB", (192, 112), ground)
        d = ImageDraw.Draw(plate)
        d.rounded_rectangle((5, 5, 186, 106), 9, outline=brass, width=3)
        for x in (15, 177):
            d.ellipse((x - 2, 54, x + 2, 58), fill=brass)
        if i == 0:  # An open book, with gilt edges along the pages.
            for direction in (-1, 1):
                d.polygon(
                    [
                        (96, 39),
                        (96 + direction * 46, 28),
                        (96 + direction * 46, 71),
                        (96, 84),
                    ],
                    fill=ivory,
                )
                d.line(
                    [(96 + direction * 4, 79), (96 + direction * 40, 68)],
                    fill=brass,
                    width=3,
                )
            d.line((96, 39, 96, 83), fill=ground, width=3)
        elif i == 1:
            d.polygon(
                [
                    (68, 84),
                    (82, 44),
                    (101, 28),
                    (127, 22),
                    (121, 43),
                    (108, 58),
                    (90, 67),
                ],
                fill=ivory,
            )
            d.line((64, 90, 116, 33), fill=brass, width=4)
            d.line((98, 75, 129, 75), fill=brass, width=3)
        elif i == 2:
            d.ellipse((109, 46, 139, 70), outline=ivory, width=6)
            d.rounded_rectangle((58, 43, 117, 78), 10, fill=ivory)
            d.line((51, 84, 129, 84), fill=brass, width=4)
            for x in (77, 94):
                d.arc((x - 8, 19, x + 3, 39), 265, 100, fill=brass, width=3)
        elif i == 3:
            d.ellipse((62, 20, 133, 91), fill="#191e23", outline=ivory, width=3)
            for r in (22, 27):
                d.arc((98 - r, 56 - r, 98 + r, 56 + r), 181, 272, fill=brass, width=2)
            d.ellipse((86, 44, 110, 68), fill="#c38455")
            d.ellipse((95, 53, 101, 59), fill=ivory)
        elif i == 4:
            d.rectangle((52, 25, 140, 86), outline=ivory, width=5)
            d.ellipse((110, 36, 124, 50), fill=brass)
            d.polygon([(60, 76), (84, 44), (101, 62), (109, 55), (132, 76)], fill=ivory)
        else:
            d.ellipse((68, 44, 123, 84), fill=ivory)
            d.polygon([(69, 61), (85, 32), (97, 28), (105, 37), (122, 60)], fill=ivory)
            d.line((96, 38, 101, 20), fill=brass, width=4)
            d.ellipse((102, 21, 120, 30), fill=brass)
        sheets.paste(plate, (i * 192, 0))
    return sheets


def shop(s, x, side, width, height, bay, name, awning):
    z = side * 9
    # Fold the ground-floor photograph around display windows and recessed doors.
    # The offsets follow piers and jambs in each of the three atlas elevations.
    s.box("Masonry", (x, height / 2, z + side * 5.3), (width, height, 9.4))
    s.barrier(x, z + side * 5, width, 10)
    face = z - side * 0.025

    def frontage(left, right, depth_l, depth_r, low, high):
        corners = [
            (left, low, depth_l),
            (right, low, depth_r),
            (right, high, depth_r),
            (left, high, depth_l),
        ]
        s.face(
            "Shopfronts",
            [
                (x - side * (t - 0.5) * width, h * height, face + side * depth)
                for t, h, depth in corners
            ],
            [((bay + 0.006 + 0.988 * t) / 3, 1 - h) for t, h, _ in corners],
        )

    cut = 0.51
    profiles = (
        [(0, 0), (0.40, 0), (0.43, 0.42), (0.60, 0.42), (0.63, 0), (1, 0)],
        [(0, 0), (0.09, 0), (0.10, 0.12), (0.90, 0.12), (0.91, 0), (1, 0)],
        [(0, 0), (0.32, 0), (0.41, 0.57), (0.60, 0.57), (0.69, 0), (1, 0)],
    )
    frontage(0, 1, 0, 0, cut, 1)
    for (left, depth_l), (right, depth_r) in zip(profiles[bay], profiles[bay][1:]):
        frontage(left, right, depth_l, depth_r, 0, cut)
    s.box("Paving", (x, 0.038, z + side * 0.27), (width, 0.07, 0.70))
    s.box(awning, (x, cut * height, z + side * 0.27), (width, 0.09, 0.64))
    for end in (-1, 1):
        s.box(
            "Masonry",
            (x + end * (width / 2 - 0.05), height / 2, z + side * 0.28),
            (0.10, height, 0.63),
        )
    s.box("Linen", (x, height, z + side * 0.27), (width + 0.05, 0.18, 0.92))
    lip = face - side * 1.05
    h = height * 0.485
    w = width * 0.46
    s.face(
        awning,
        [
            (x - w, h, face),
            (x + w, h, face),
            (x + w, h - 0.32, lip),
            (x - w, h - 0.32, lip),
        ],
    )
    s.box(awning, (x, h - 0.44, lip), (2 * w, 0.24, 0.06))
    s.sign(
        name,
        x,
        h + 0.29,
        face - side * 0.08,
        min(width - 1, 5.3),
        0.52,
        "#2e3e3d",
        yaw=pi if side > 0 else 0,
    )
    # A blade sign can be seen looking along the block. Its bracket lines up with
    # the end pier and the sign hangs outside the edge of the canvas awning.
    mount = x - side * width * 0.475
    blade = face - side * 0.81
    s.tube("Ink", (mount, 3.29, face), (mount, 3.29, face - side * 1.52), 0.035, n=6)
    s.tube("Ink", (mount, 2.88, face), (mount, 3.29, blade), 0.03, n=6)
    for delta in (-0.37, 0.37):
        s.tube(
            "Ink",
            (mount, 3.29, blade + delta),
            (mount, 3.10, blade + delta),
            0.022,
            n=6,
        )
    s.box("Gold", (mount, 2.75, blade), (0.10, 0.70, 1.14))
    icon = SHOP_NAMES.index(name)
    for normal in (-1, 1):
        corners = [(0, 1), (1, 1), (1, 0), (0, 0)]
        s.face(
            "Merchant marks",
            [
                (
                    mount + normal * 0.052,
                    3.06 - v * 0.62,
                    blade + normal * (0.5 - u) * 1.06,
                )
                for u, v in corners
            ],
            [((icon + 0.01 + u * 0.98) / 6, v) for u, v in corners],
        )


def courthouse(s):
    # Set back from the north edge of the 1300 block, with a stepped central tower.
    x, z = 25, -25
    s.block("Sandstone", x, z, 38, 7, 6.4)
    s.block("Sandstone", x, z + 1.2, 10, 7, 8.3)
    s.block("Sandstone", x, z + 1.45, 5, 7, 11.4)
    s.box("Linen", (x, 11.5, z + 1.45), (4.15, 0.23, 6.2))
    for offset in (-16, -12, -8, 8, 12, 16):
        for y in (1.7, 4.45):
            s.box("Glass", (x + offset, y, z + 3.53), (1.85, 2.1, 0.1))
            s.box("Sandstone", (x + offset, y, z + 3.60), (0.12, 2.12, 0.1))
    for offset in (-1.45, 0, 1.45):
        s.box("Ink", (x + offset, 7.6, z + 5), (0.72, 5.9, 0.13))
        for y in (5.7, 7.55, 9.4):
            s.box("Gold", (x + offset, y, z + 5.09), (0.72, 0.13, 0.05))
    s.box("Timber", (x, 1.5, z + 5), (3.5, 3, 0.18))
    s.sign("BOULDER COUNTY", x, 3.75, z + 5.13, 5, 0.68, "#70604f")


def kiosk(s, x, z):
    s.block("Cobalt", x, z, 3.5, 2.55, 2.55)
    for side in (-1, 1):
        s.box("Glass", (x, 1.55, z + side * 1.29), (3.15, 1.47, 0.09))
        for u in (-1.38, 0, 1.38):
            s.box("Linen", (x + u, 1.55, z + side * 1.36), (0.065, 1.52, 0.08))
        face = x + side * 1.77
        s.box("Glass", (face, 1.5, z), (0.08, 1.48, 2.28))
        for u in (-1.10, 0, 1.10):
            s.box("Linen", (face + side * 0.055, 1.5, z + u), (0.08, 1.5, 0.065))
        s.sign(
            "PEARL STREET",
            face + side * 0.10,
            2.28,
            z,
            2.35,
            0.45,
            "#1c4054",
            yaw=side * pi / 2,
        )
    corners = [
        (x - 2.4, z - 1.9),
        (x + 2.4, z - 1.9),
        (x + 2.4, z + 1.9),
        (x - 2.4, z + 1.9),
    ]
    for i, (a, b) in enumerate(corners):
        c, d = corners[(i + 1) % 4]
        s.face("Cobalt", [(a, 2.55, b), (c, 2.55, d), (x, 4.25, z)])
    s.tube("Gold", (x, 4.2, z), (x, 4.55, z), 0.12, 0.025)
    s.sign("VISITOR INFO", x, 2.31, z - 1.38, 2.8, 0.39, "#1d4261", yaw=pi)


def banner(s, x, z):
    s.block("Sandstone", x, z, 0.72, 0.72, 0.74)
    s.tube("Ink", (x, 0.7, z), (x, 5.7, z), 0.09, 0.07)
    s.tube("Ink", (x, 5.36, z - 1.06), (x, 5.36, z + 1.06), 0.045)
    s.ellipsoid("Glow", (x, 5.79, z), (0.13, 0.15, 0.13), 8, 5)
    for side, tone in ((-1, "Cobalt"), (1, "Brick")):
        u = z + side * 0.58
        s.box(tone, (x, 4.29, u), (0.035, 2.05, 0.9))
        for normal in (-1, 1):
            s.sign(
                "PEARL",
                x + normal * 0.04,
                4.3,
                u,
                0.87,
                0.36,
                "#27496a" if side < 0 else "#984d37",
                yaw=normal * pi / 2,
            )


def mall(s):
    for side in (-1, 1):
        # The north-east frontage opens onto the courthouse lawn.
        starts = [-57, -47, -38, -28, -16]
        widths = [10, 9, 10, 12, 9]
        if side > 0:
            starts += [7, 15, 26, 35, 47]
            widths += [8, 11, 9, 12, 9]
        for i, (start, width) in enumerate(zip(starts, widths)):
            bay = (i + (side > 0)) % 3
            shop(
                s,
                start + width / 2,
                side,
                width - 0.08,
                (7.7, 6.9, 8.4, 7.2)[(i + side) % 4],
                bay,
                SHOP_NAMES[(i + 2 * side) % len(SHOP_NAMES)],
                ("Holly", "Cobalt", "Ink", "Clay")[i % 4],
            )
    courthouse(s)
    kiosk(s, 9, 2.6)
    s.block("Ink", 4.25, 5.8, 0.16, 0.16, 3.8)
    s.sign("PEARL ST", 4.25, 3.55, 5.8, 2, 0.38, "#285449")
    s.sign("13TH ST", 4.25, 3.16, 5.8, 1.75, 0.38, "#285449", yaw=-pi / 2)
    for x in (-38, -22, -8, 17, 33, 46):
        for side in (-1, 1):
            z = side * 5.8
            s.plan["trees"].append(
                dict(x=x, z=z, height=6.2 + 0.8 * cos(x), species="Oak")
            )
            s.pad("Tree grate", x, z, 1.55, 1.55, 0.047, 1.55)
            s.extras["furniture"].append(["Bench", x + 2.1, z, pi if side < 0 else 0])
            s.barrier(x + 2.1, z, 2, 0.85)
        banner(s, x + 1.3, -2.8 if x in (-22, 33) else 3.3)
    for x in (-42, -18, 18, 42):
        for z in (-8, 8):
            s.extras["furniture"].append(["PathLamp", x, z, 0])
            s.barrier(x, z, 0.22, 0.22)
    for x in (9, 41):
        s.plan["trees"].append(dict(x=x, z=-14, height=8.5, species="Oak"))


def wall(s, cx, cz, nx, nz, span, bays, first_panel, entry=False):
    """Local u runs right as seen from the street. Positive offset faces outside."""

    def at(u, offset=0):
        return cx + nz * u + nx * offset, cz - nx * u + nz * offset

    def box(mat, u, y, offset, width, height, depth):
        x, z = at(u, offset)
        s.box(mat, (x, y, z), (depth if nx else width, height, width if nx else depth))

    def plaque(mat, u, base, offset, width, height, repeats=1, uv=None):
        a, b = at(u - width / 2, offset), at(u + width / 2, offset)
        s.face(
            mat,
            [
                (a[0], base, a[1]),
                (b[0], base, b[1]),
                (b[0], base + height, b[1]),
                (a[0], base + height, a[1]),
            ],
            uv or [(0, 1), (repeats, 1), (repeats, 0), (0, 0)],
        )

    # Floor-to-eave glazing, punctuated by buff masonry and ceramic reliefs.
    cuts = [-span / 2, *[v for u in bays for v in (u - 1.35, u + 1.35)], span / 2]
    for lo, hi in zip(cuts[::2], cuts[1::2]):
        opening = entry and lo < 0 < hi
        segments = [(lo, -2.15), (2.15, hi)] if opening else [(lo, hi)]
        for left, right in segments:
            u, w = (left + right) / 2, right - left
            box("Cobalt", u, 0.26, 0, w, 0.46, 0.24)
            plaque("Teahouse glass", u, 0.46, 0, w, 3.34)
            count = max(1, round(w / 1.45))
            for j in range(count + 1):
                box("Cobalt", left + w * j / count, 2.03, 0, 0.10, 3.95, 0.16)
            box("Cobalt", u, 2.72, 0, w, 0.08, 0.15)
            # Tied-back ivory curtains behind the blue window frames.
            for edge, direction in ((left, 1), (right, -1)):
                xs = [at(edge + direction * v, -0.13) for v in (0.10, 0.45, 0.22, 0.38)]
                s.face(
                    "Linen",
                    [(px, y, pz) for (px, pz), y in zip(xs, (3.8, 3.8, 1.6, 0.5))],
                )
        if opening:
            box("Teahouse glass", 0, 3.45, 0, 4.3, 0.94, 0.05)
            box("Cobalt", 0, 2.96, 0, 4.4, 0.12, 0.18)
            s.sign("1770", cx - 0.13, 3.45, cz, 1.35, 0.53, "#1c3956", yaw=-pi / 2)
            # Two glazed timber doors held open against the inner jambs.
            for u in (-2.05, 2.05):
                box("Teahouse glass", u, 1.55, -0.62, 0.05, 2.55, 1.20)
                for y in (0.24, 1.10, 2.82):
                    box("Timber", u, y, -0.62, 0.13, 0.16, 1.32)
                for offset in (-1.23, -0.03):
                    box("Timber", u, 1.51, offset, 0.13, 2.82, 0.12)
                x, z = at(u, -0.62)
                s.barrier(x, z, 1.32, 0.15)
    for i, u in enumerate(bays, first_panel):
        left, right = (i % 4 + 0.004) / 4, (i % 4 + 0.996) / 4
        top, bottom = (i // 4 + 0.004) / 2, (i // 4 + 0.996) / 2
        box("Sandstone", u, 2, 0, 2.7, 4, 0.36)
        plaque(
            "Ceramic panels",
            u,
            0.67,
            0.19,
            2.35,
            3.05,
            uv=[(left, bottom), (right, bottom), (right, top), (left, top)],
        )
        plaque("Floral border", u, 0.12, 0.19, 2.35, 0.40, 3)
        plaque("Carved plaster", u, 0.6, -0.19, 2.42, 3.12)
    box("Cobalt", 0, 3.91, 0, span, 0.19, 0.28)
    box("Timber", 0, 4.25, 0.14, span + 0.6, 0.54, 0.55)
    plaque("Floral border", 0, 4.02, 0.43, span + 0.6, 0.45, round(span / 1.5))
    for u in range(1, int(span)):
        box("Timber", u - span / 2, 4.52, 0.45, 0.12, 0.18, 0.86)
    stretches = (
        [(-span / 2, -2.15), (2.15, span / 2)] if entry else [(-span / 2, span / 2)]
    )
    for left, right in stretches:
        x, z = at((left + right) / 2)
        s.barrier(x, z, 0.38 if nx else right - left, right - left if nx else 0.38)


def tea_table(s, x, z, tea=False):
    s.box("Timber", (x, 0.76, z), (1.35, 0.13, 1.04))
    s.tube("Timber", (x, 0.07, z), (x, 0.72, z), 0.19, 0.12)
    for dx in (-1.02, 1.02):
        s.box("Timber", (x + dx, 0.45, z), (0.45, 0.11, 0.52))
        s.box("Timber", (x + dx * 1.19, 0.56, z), (0.08, 0.99, 0.48))
        for dz in (-0.18, 0.18):
            s.box("Timber", (x + dx * 0.83, 0.23, z + dz), (0.08, 0.43, 0.08))
    s.barrier(x, z, 2.51, 1.04)
    if tea:
        s.tube("Gold", (x, 0.825, z), (x, 0.855, z), 0.46, n=24)
        s.ellipsoid("Tile", (x, 1.04, z), (0.22, 0.19, 0.20))
        s.ellipsoid("Linen", (x, 1.21, z), (0.13, 0.035, 0.13))
        s.ellipsoid("Gold", (x, 1.26, z), (0.038, 0.035, 0.038), 8, 5)
        s.tube("Tile", (x - 0.16, 1.02, z), (x - 0.31, 1.13, z), 0.08, 0.05)
        s.tube("Tile", (x - 0.31, 1.13, z), (x - 0.36, 1.20, z), 0.05, 0.06)
        handle = [
            (0.14, 0.96),
            (0.27, 0.97),
            (0.32, 1.04),
            (0.32, 1.13),
            (0.25, 1.17),
            (0.15, 1.14),
        ]
        for (dx, y), (ex, ey) in zip(handle, handle[1:]):
            s.tube("Gold", (x + dx, y, z), (x + ex, ey, z), 0.024, n=7)
        for dx, dz in ((0.28, -0.22), (-0.18, 0.26)):
            cx, cz = x + dx, z + dz
            s.tube("Cobalt", (cx, 0.855, cz), (cx, 0.87, cz), 0.12, n=16)
            s.tube("Linen", (cx, 0.87, cz), (cx, 0.99, cz), 0.055, 0.09, n=16)
            s.tube("Timber", (cx, 0.99, cz), (cx, 0.992, cz), 0.079, n=16)


def teahouse(s):
    # West entrance on 13th. Two mural panels per elevation, around a glazed hall.
    wall(s, 12, 49, -1, 0, 18, [-5.1, 5.1], 0, entry=True)
    wall(s, 36, 49, 1, 0, 18, [-5.1, 5.1], 2)
    for z, normal, first in ((40, -1, 4), (58, 1, 6)):
        wall(s, 24, z, 0, normal, 24, [-8, 8], first)
    surface(s, "Dining floor", "#ae916e", 24, 49, 24, 18, 0.065, 2.2)
    # Pitched metal perimeter around the raised central skylight. The ceiling is
    # open above the pool, with painted coffers beneath the opaque roof slopes.
    outer = [(10.9, 39), (37.1, 39), (37.1, 59), (10.9, 59)]
    inner = [(20.7, 47), (27.3, 47), (27.3, 51), (20.7, 51)]
    for i in range(4):
        j = (i + 1) % 4
        corners = [outer[i], outer[j], inner[j], inner[i]]
        s.face(
            "Slate", [(x, y, z) for (x, z), y in zip(corners, (4.72, 4.72, 6.05, 6.05))]
        )
        s.face(
            "Painted coffers",
            [(x, y, z) for (x, z), y in zip(corners, (4.63, 4.63, 5.94, 5.94))],
            [(x / 3, z / 3) for x, z in corners],
        )
    s.box("Teahouse glass", (24, 6.09, 49), (6.64, 0.09, 4.05))
    for x in (20.7, 22.9, 25.1, 27.3):
        s.box("Timber", (x, 6.11, 49), (0.10, 0.14, 4.15))
    for row, z in enumerate((43, 55)):
        for col, x in enumerate((14.4, 18.2, 22, 26, 29.8, 33.6)):
            bevel = 0.03 * ((row + col) % 3)
            profile = [
                (0.06, 0.29),
                (0.28, 0.32),
                (0.53, 0.19),
                (0.78, 0.25),
                (1.03, 0.16 + bevel),
                (3.85, 0.18),
                (4.23, 0.30),
                (4.46, 0.23),
                (5.05, 0.49),
            ]
            for (y, r), (top, rt) in zip(profile, profile[1:]):
                for j in range(12):
                    quad = [(j, y, r), (j + 1, y, r), (j + 1, top, rt), (j, top, rt)]
                    s.face(
                        "Carved cedar",
                        [
                            (x + rad * cos(k * pi / 6), h, z + rad * sin(k * pi / 6))
                            for k, h, rad in quad
                        ],
                        [(k / 4 + col / 3, h / 1.5 + row / 2) for k, h, _ in quad],
                    )
            for y in (0.57, 1.08, 3.78, 4.27):
                s.tube("Ochre", (x, y, z), (x, y + 0.07, z), 0.22 + bevel, n=12)
            s.barrier(x, z, 0.54, 0.54)
        s.box("Timber", (24, 5.11, z), (21.4, 0.22, 0.61))
    # The long reflecting pool with seven copper figures holding water vessels.
    s.block("Sandstone", 24, 49, 7.4, 2.8, 0.35)
    s.pad("Water", 24, 49, 7.12, 2.52, 0.355)
    # Cap the basin with a slender glazed lip and set a floral course into each face.
    corners = [(20.3, 47.6), (27.7, 47.6), (27.7, 50.4), (20.3, 50.4)]
    for i, (ax, az) in enumerate(corners):
        bx, bz = corners[(i + 1) % 4]
        w, d = abs(bx - ax), abs(bz - az)
        s.box("Tile", ((ax + bx) / 2, 0.38, (az + bz) / 2), (w + 0.1, 0.07, d + 0.1))
        nx, nz = (bz - az) * 0.001, (ax - bx) * 0.001
        s.face(
            "Floral border",
            [
                (ax + nx, 0.16, az + nz),
                (bx + nx, 0.16, bz + nz),
                (bx + nx, 0.31, bz + nz),
                (ax + nx, 0.31, az + nz),
            ],
            [(0, 1), (w + d, 1), (w + d, 0), (0, 0)],
        )
    for i in range(7):
        side = (-1) ** i
        x, z = 21.15 + i * 0.95, 49 + side * 0.50
        s.tube("Hammered copper", (x, 0.37, z), (x, 1.07, z), 0.22, 0.12)
        s.ellipsoid("Hammered copper", (x, 1.17, z), (0.18, 0.29, 0.14), 10, 6)
        s.ellipsoid("Hammered copper", (x, 1.54, z), (0.11, 0.15, 0.12), 10, 6)
        s.ellipsoid(
            "Hammered copper", (x, 1.60, z + side * 0.06), (0.12, 0.11, 0.10), 10, 6
        )
        for hand in (-1, 1):
            s.tube(
                "Hammered copper",
                (x + hand * 0.12, 1.32, z),
                (x + hand * 0.10, 1.08, z - side * 0.22),
                0.055,
                0.04,
                8,
            )
        mouth = z - side * 0.34
        s.ellipsoid(
            "Hammered copper", (x, 1.07, z - side * 0.23), (0.12, 0.12, 0.14), 10, 6
        )
        s.tube(
            "Hammered copper",
            (x, 1.09, z - side * 0.24),
            (x, 1.13, mouth),
            0.071,
            0.066,
        )
        # Water arcs into the basin from each tilted vessel.
        stream = [
            (x, 1.12 - 0.76 * (j / 5) ** 2, mouth - side * 0.24 * j / 5)
            for j in range(6)
        ]
        for start, end in zip(stream, stream[1:]):
            s.tube("Water", start, end, 0.019, n=5)
    for x, z in (
        (20.9, 49.65),
        (23.6, 48.3),
        (26.8, 49.65),
        (34.8, 41.4),
        (13.3, 56.7),
    ):
        s.tube("Clay", (x, 0.07, z), (x, 0.52, z), 0.21, 0.34)
        for i in range(14):
            a = i * 2.4
            dx, dz = cos(a), sin(a)
            h = 0.55 + 0.27 * (i % 4)
            s.face(
                "Leaf",
                [
                    (x, 0.52, z),
                    (
                        x + dx * 0.26 - dz * 0.08,
                        0.55 + h * 0.55,
                        z + dz * 0.26 + dx * 0.08,
                    ),
                    (x + dx * 0.54, 0.52 + h, z + dz * 0.54),
                    (
                        x + dx * 0.26 + dz * 0.08,
                        0.55 + h * 0.55,
                        z + dz * 0.26 - dx * 0.08,
                    ),
                ],
            )
        s.barrier(x, z, 0.62, 0.62)
    for x, z in [
        (16, 41.5),
        (24, 42),
        (32, 41.6),
        (16, 56.4),
        (24, 56.4),
        (32, 53.5),
        (32, 46),
    ]:
        tea_table(s, x, z, tea=(x, z) == (32, 53.5))
    s.block("Timber", 9.9, 51.6, 0.14, 0.74, 1.35)
    s.sign(
        "TEAHOUSE", 9.78, 0.95, 51.6, 0.72, 0.64, "#273b34", yaw=-pi / 2, sub="Welcome"
    )


def garden(s):
    rng = Random(1770)
    for x, z, w, d in [
        (8.3, 42.5, 2.4, 7),
        (8.3, 55.8, 2.4, 6),
        (19, 60, 6, 1.6),
        (32, 60, 6, 1.6),
    ]:
        s.block("Sandstone", x, z, w, d, 0.27)
        s.pad("Garden", x, z, w - 0.15, d - 0.15, 0.28)
        for i in range(6):
            a = (i / 5 - 0.5) * 0.80
            u, v = x + w * a if w > d else x, z + d * a if d > w else z
            for stem in range(7):
                angle = stem * 2 * pi / 7 + rng.random()
                dx, dz = cos(angle), sin(angle)
                tip = u + dx * 0.39, rng.uniform(0.76, 1.05), v + dz * 0.39
                s.tube("Timber", (u, 0.28, v), tip, 0.024, 0.014, 5)
                for j in range(1, 7):
                    t = j / 7
                    lx, ly, lz = (
                        u + dx * 0.39 * t,
                        0.28 + (tip[1] - 0.28) * t,
                        v + dz * 0.39 * t,
                    )
                    side = (-1) ** j
                    s.face(
                        "Leaf",
                        [
                            (lx, ly, lz),
                            (lx + dz * side * 0.08, ly + 0.11, lz - dx * side * 0.08),
                            (lx + dz * side * 0.19, ly + 0.09, lz - dx * side * 0.19),
                            (lx + dz * side * 0.10, ly - 0.015, lz - dx * side * 0.10),
                        ],
                    )
                if stem % 3 == 0:
                    s.ellipsoid(
                        rng.choice(("Clay", "Brick", "Ochre")),
                        tip,
                        (0.043, 0.054, 0.043),
                        6,
                        4,
                    )
    for x in (16, 26, 37):
        tea_table(s, x, 61.6)
    # The open water begins at the east edge of the street crossing.
    bank = [(5, 64.2), (14, 64.4), (27, 63.5), (39, 63.7), (60, 61.8)]
    far = [(x, z + 2.35) for x, z in bank]
    for i in range(len(bank) - 1):
        s.face(
            "Water",
            [(x, 0.04, z) for x, z in (bank[i], bank[i + 1], far[i + 1], far[i])],
        )
    s.plan["water"].append(dict(points=bank + far[::-1]))
    for x, z in [
        (-9, 39),
        (-17, 43),
        (-12, 58),
        (-31, 52),
        (42, 37),
        (46, 57),
        (38, 69),
        (-24, 71),
    ]:
        s.plan["trees"].append(dict(x=x, z=z, height=7.8 + cos(x), species="Oak"))


def build_pearl(s):
    s.plan["surfaces"] = []
    s.extras["furniture"] = []
    s.paint("Shopfronts", "pearl-shopfronts.webp")
    s.images["Merchant marks"] = merchant_marks()
    s.paint("Ceramic panels", "pearl-ceramic-panels.webp")
    s.paint("Relief study", "pearl-tree-of-life.webp")
    s.paint("Painted coffers", "pearl-painted-coffer.webp")
    panel = s.images.pop("Relief study")
    s.images["Floral border"] = panel.crop((40, 0, panel.width - 40, 44))
    relief = panel.convert("L").filter(ImageFilter.EMBOSS)
    s.images["Carved plaster"] = ImageOps.colorize(relief, "#948670", "#fff4dd")
    s.images["Carved cedar"] = ImageOps.colorize(
        relief.resize((192, 384)), "#654431", "#c5905c"
    )
    s.paint("Masonry", "brick-facade.webp")
    s.paint("Garden", "grass.webp")
    s.paint("Road", "street-asphalt.webp")
    s.paint("Paving", "street-concrete.webp", ("#736f64", "#ccc3ab"))
    # Keep joints and individual firing colors distinct down at turkey eye height.
    grain = ImageOps.autocontrast(s.images["Paving"].convert("L")).resize((512, 512))
    shades = (
        ("#713f35", "#c48f6b"),
        ("#805244", "#c89471"),
        ("#6b4438", "#c08668"),
        ("#7b5142", "#cc9979"),
    )
    kiln = [ImageOps.colorize(grain, *shade) for shade in shades]
    tile = Image.new("RGB", (512, 512), "#887263")
    rng = Random(1300)
    for row in range(16):
        y = row * 32
        for col in range(8):
            x = col * 64 - 32 * (row % 2)
            brick = rng.choice(kiln)
            for start in (x, x + 512):
                left, right = max(0, start + 2), min(512, start + 63)
                if right > left:
                    patch = (left, y + 1, right, y + 31)
                    tile.paste(brick.crop(patch), patch[:2])
    s.images["Pavers"] = tile
    grate = ImageOps.colorize(grain.resize((256, 256)), "#343a38", "#555954")
    draw = ImageDraw.Draw(grate)
    for r in range(31, 114, 13):
        draw.ellipse((128 - r, 128 - r, 128 + r, 128 + r), outline="#222825", width=8)
    for i in range(16):
        a = i * pi / 8
        draw.line(
            (128, 128, 128 + 115 * cos(a), 128 + 115 * sin(a)), fill="#545954", width=4
        )
    draw.ellipse((102, 102, 154, 154), fill="#3d3429")
    draw.rectangle((3, 3, 252, 252), outline="#272f2c", width=4)
    s.images["Tree grate"] = grate
    s.images["Dining floor"] = ImageOps.colorize(
        tile.convert("L"), "#594431", "#cdac82"
    )
    s.images["Sandstone"] = ImageOps.colorize(
        ImageOps.autocontrast(tile.convert("L")), "#ac9275", "#dfc9a9"
    )
    s.pad("Garden", 0, 20, 270, 220)
    surface(s, "Paving", "#a9a496", 0, 19, 13, 104, 0.016)
    surface(s, "Pavers", "#aa7663", 0, 0, 122, 18, 0.025, 2.8)
    surface(s, "Road", "#666a69", 0, 19, 6.8, 104, 0.035)
    surface(s, "Paving", "#a9a496", 25, -15, 4, 14, 0.026)
    for z, width in ((21, 3.2), (31, 5.6)):
        surface(s, "Road", "#666a69", 0, z, 121, width, 0.037)
        for sign in (-1, 1):
            for dx in range(-2, 3):
                surface(
                    s,
                    "Linen",
                    "#c3c2b2",
                    dx,
                    z + sign * (width / 2 + 0.85),
                    0.38,
                    1.23,
                    0.045,
                )
    for dx in range(-2, 3):
        surface(s, "Linen", "#c3c2b2", dx * 1.27, 0, 0.63, 6.1, 0.045)
    surface(s, "Pavers", "#bd8c72", 22, 50.4, 35, 26, 0.047, 3)
    mall(s)
    # Continue building frontages along the compressed Walnut–Canyon block.
    for x in (-25, 24):
        s.block("Masonry", x, 26, 36, 5.6, 5.2)
        face = x - 18 if x > 0 else x + 18
        for z in (24.4, 26, 27.6):
            s.box("Glass", (face, 2.35, z), (0.12, 3.7, 1.22))
    s.block("Sandstone", 24, 35.4, 18, 3.8, 3.1)
    s.box("Slate", (24, 3.14, 35.4), (19, 0.22, 4.5))
    teahouse(s)
    garden(s)
    s.place("Pearl Street shops", -29, -8)
    s.place("Courthouse lawn", 23, -10)
    s.place("13th Street", 0, 25)
    s.place("Rose garden", 8.3, 55.8)
    s.place("Dushanbe Teahouse", 24, 49)
    s.plan["places"][-1]["bounds"] = [12, 40, 36, 58]
    s.place("Creekside patio", 23, 61)
    s.plan["mapLabels"] = [
        dict(name=name, x=x, z=z)
        for name, x, z in [
            ("Pearl St", -27, 3),
            ("13th St", -1, 13),
            ("Walnut St", -27, 21),
            ("Canyon Blvd", -27, 31),
            ("Central Park", -28, 49),
            ("Creekside patio", 27, 62),
        ]
    ]
