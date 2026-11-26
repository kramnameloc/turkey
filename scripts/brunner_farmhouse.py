"""Model Brunner's gabled farmhouse and wraparound porch in local ground meters."""

from math import hypot

from landmark_mesh import Mesh


def farmhouse():
    mesh = Mesh("Brunner Farmhouse", (-132.8, -800.4), footprint_name="")
    box = mesh.box

    # The lidar ridge runs east-west. Porch and steps face the gardens.
    def wall(corners):
        a, b = corners[:2]
        along_x = abs(a[0] - b[0]) > abs(a[2] - b[2])
        mesh.face("Clapboard", corners, [(p[0 if along_x else 2] / 2, -p[1] / 2) for p in corners])

    def roof(corners):
        a, b, c = corners[:3]
        width = hypot(a[0] - b[0], a[2] - b[2])
        slope = sum((c[i] - b[i]) ** 2 for i in range(3)) ** 0.5
        mesh.face(
            "Shingles", corners, [(0, 0), (width / 2, 0), (width / 2, slope / 1.5), (0, slope / 1.5)]
        )

    west, east, north, south = -7.45, 5.6, -4.65, 3.15
    eave, peak, ridge = 3.72, 8.05, -0.10
    for z in (north, south):
        wall([(west, 0.32, z), (east, 0.32, z), (east, eave, z), (west, eave, z)])
    for x in (west, east):
        wall([(x, 0.32, north), (x, 0.32, south), (x, eave, south), (x, eave, north)])
        wall([(x, eave, north), (x, eave, south), (x, peak, ridge)])
    for z in (north - 0.27, south + 0.27):
        roof(
            [
                (west - 0.26, peak, ridge),
                (east + 0.26, peak, ridge),
                (east + 0.26, eave - 0.2, z),
                (west - 0.26, eave - 0.2, z),
            ]
        )
    box(
        "Foundation",
        ((east + west) / 2, -0.24, (south + north) / 2),
        (east - west, 1.25, south - north),
    )

    # Bargeboards follow both sloping eaves and show up against the dark shingles.
    def board(a, b, width, depth):
        dx, dy, dz = (b[i] - a[i] for i in range(3))
        length = hypot(hypot(dx, dz), dy)
        d = hypot(dx, dz)
        normal = (-dz / d * depth / 2, 0, dx / d * depth / 2)
        cross = (
            -dx / d * dy / length * width / 2,
            d / length * width / 2,
            -dz / d * dy / length * width / 2,
        )

        def ring(p):
            return [
                tuple(p[i] + u * normal[i] + v * cross[i] for i in range(3))
                for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))
            ]

        first, last = ring(a), ring(b)
        for i in range(4):
            j = (i + 1) % 4
            mesh.face("PorchWhite", [first[i], first[j], last[j], last[i]])

    for x in (west - 0.26, east + 0.26):
        for z in (north - 0.27, south + 0.27):
            board((x, peak, ridge), (x, eave - 0.2, z), 0.16, 0.15)

    # A garden-facing dormer stands clear of the main roof, with two divided lights.
    for x in (-2.4, 0.4):
        wall([(x, 4.22, 2.8), (x, 6.05, 0.5), (x, 6.05, 2.8)])
    wall([(-2.4, 4.22, 2.8), (0.4, 4.22, 2.8), (0.4, 6.1, 2.8), (-2.4, 6.1, 2.8)])
    wall([(-2.4, 6.1, 2.8), (0.4, 6.1, 2.8), (-1, 7.52, 2.8)])
    for x in (-2.57, 0.57):
        roof([(-1, 7.52, 0.12), (-1, 7.52, 3.0), (x, 6.02, 3.0), (x, 6.02, 0.12)])
        board((-1, 7.52, 3.0), (x, 6.02, 3.0), 0.12, 0.12)

    def window(x, y, z, w, h, side="south"):
        # Each frame sits just outside its host wall.
        def trim(mat, u, v, offset, sw, sh, depth):
            if side in ("north", "south"):
                sign = -1 if side == "north" else 1
                box(mat, (x + u, y + v, z + sign * offset), (sw, sh, depth))
            else:
                sign = -1 if side == "west" else 1
                box(mat, (x + offset * sign, y + v, z + u), (depth, sh, sw))

        trim("PorchWhite", 0, 0, 0.025, w + 0.14, h + 0.14, 0.09)
        trim("Sash", 0, 0, 0.087, w, h, 0.052)
        trim("PorchWhite", 0, 0, 0.122, w, 0.048, 0.034)
        trim("PorchWhite", 0, -h / 2 - 0.06, 0.082, w + 0.24, 0.095, 0.19)

    for x in (-4.65, -2.5, 1.75, 4.65):
        window(x, 1.72, south, 0.82, 1.46)
    for x in (-5.45, -2.35, 0.85, 4.2):
        window(x, 1.72, north, 0.82, 1.46, "north")
    for x in (-1.63, -0.4):
        window(x, 5.12, 2.8, 0.85, 1.38)
    for x, side in ((west, "west"), (east, "east")):
        for z in (-1.13, 0.68):
            window(x, 5.32, z, 0.78, 1.53, side)
        for z in (-3.2, 0.55):
            window(x, 1.67, z, 0.8, 1.42, side)
    for x in (-3.5, 4.75):
        box("ChimneyBrick", (x, 7.76, -0.68), (0.55, 2.15, 0.64))
        box("ChimneyBrick", (x, 8.77, -0.68), (0.68, 0.28, 0.76))
    box("PorchWhite", (-0.32, 1.53, south + 0.07), (1.12, 2.32, 0.13))
    box("Door", (-0.32, 1.5, south + 0.15), (0.91, 2.15, 0.08))
    box("Sash", (-0.32, 1.84, south + 0.2), (0.59, 0.94, 0.04))

    # Wrap the deck around the east gable. The open bay faces the steps.
    edge_x, edge_z = 7.65, 5.02
    box(
        "PorchWhite",
        ((edge_x + west) / 2, 0.25, (edge_z + south) / 2),
        (edge_x - west, 0.32, edge_z - south),
    )
    box(
        "PorchWhite",
        ((edge_x + east) / 2, 0.25, (south + north) / 2),
        (edge_x - east, 0.32, south - north),
    )
    roof(
        [
            (east, 3.38, south),
            (west - 0.17, 3.38, south),
            (west - 0.17, 2.89, edge_z + 0.18),
            (edge_x + 0.18, 2.89, edge_z + 0.18),
        ]
    )
    roof(
        [
            (east, 3.38, north),
            (east, 3.38, south),
            (edge_x + 0.18, 2.89, edge_z + 0.18),
            (edge_x + 0.18, 2.89, north - 0.15),
        ]
    )
    box("PorchWhite", ((west + edge_x) / 2, 2.85, edge_z + 0.15), (edge_x - west + 0.5, 0.16, 0.16))
    box(
        "PorchWhite", (edge_x + 0.15, 2.85, (edge_z + north) / 2), (0.16, 0.16, edge_z - north + 0.46)
    )
    for i in range(3):
        box(
            "Foundation",
            (-0.3, 0.055 * (3 - i), edge_z + 0.17 + i * 0.29),
            (1.85, 0.11 * (3 - i), 0.31),
        )

    def rail(a, b):
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = hypot(dx, dz)
        for h in (0.48, 1.24):
            board((a[0], h, a[1]), (b[0], h, b[1]), 0.077, 0.08)
        n = round(length / 0.72)
        for i in range(n):
            for lo, hi in ((0.51, 1.21), (1.21, 0.51)):
                board(
                    (a[0] + dx * i / n, lo, a[1] + dz * i / n),
                    (a[0] + dx * (i + 1) / n, hi, a[1] + dz * (i + 1) / n),
                    0.038,
                    0.043,
                )

    south_posts = [(x, edge_z) for x in (west, -4.62, -1.42, 0.84, 4.18, edge_x)]
    east_posts = [(edge_x, z) for z in (north, -1.44, 1.72, edge_z)]
    for x, z in sorted(set(south_posts + east_posts)):
        box("PorchWhite", (x, 1.62, z), (0.14, 2.49, 0.14))
        for h in (0.53, 2.69):
            box("PorchWhite", (x, h, z), (0.19, 0.17, 0.19))
    for posts in (south_posts, east_posts):
        for a, b in zip(posts, posts[1:]):
            if a != south_posts[2]:
                rail(a, b)
    return mesh


def pergola():
    # The pale rectangle east of the house in the course aerial matches the
    # garden pergola pictured in Broomfield's Open Space, Parks and Trails plan.
    mesh = Mesh("Brunner Garden Pergola", (-119.8, -801.65), footprint_name="")
    posts = []
    for x in (-2.68, 2.68):
        for z in (-4.56, -1.52, 1.52, 4.56):
            mesh.box("PorchWhite", (x, 1.20, z), (0.22, 3.18, 0.22))
            mesh.box("PorchWhite", (x, 0.26, z), (0.31, 0.52, 0.31))
            mesh.box("PorchWhite", (x, 2.57, z), (0.34, 0.18, 0.34))
            wx, wz = x + mesh.anchor[0], z + mesh.anchor[1]
            posts.append(
                [
                    [wx + dx, wz + dz]
                    for dx, dz in [(-0.155, -0.155), (0.155, -0.155), (0.155, 0.155), (-0.155, 0.155)]
                ]
            )
        mesh.box("PorchWhite", (x, 2.72, 0), (0.24, 0.27, 10.36))
    for i in range(21):
        mesh.box("PorchWhite", (0, 2.94, (i - 10) * 0.48), (6.48, 0.22, 0.11))
    for i in range(11):
        mesh.box("PorchWhite", ((i - 5) * 0.58, 3.08, 0), (0.085, 0.07, 10.2))
    mesh.extras["postFootprints"] = posts
    return mesh
