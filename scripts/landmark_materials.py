"""Prepare Broomfield Library photo materials and painted farmhouse materials."""

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance


# Reference coordinates are on 800-pixel-wide camera originals
# (before any cropping). Sample at full resolution before resizing.
def sample(photo, rect, size):
    scale = photo.width / 800
    return photo.crop(tuple(round(v * scale) for v in rect)).resize(size, Image.Resampling.LANCZOS)


def library_materials(entrance, park):
    brick = sample(entrance, (368, 181, 423, 221), (176, 128))
    brick = ImageEnhance.Brightness(brick).enhance(1.24)

    def masonry(size):
        wall = Image.new("RGB", size)
        for y in range(0, size[1], brick.height):
            for x in range(-brick.width, size[0], brick.width):
                wall.paste(brick, (x + (y // brick.height % 2) * 88, y))
        return wall

    def insert(wall, photo, rect, box):
        x, y, w, h = box
        patch = sample(photo, rect, (w, h))
        wall.paste(ImageEnhance.Brightness(patch).enhance(1.15), (x, y))

    # Facade panels use only architecture. Keep the foreground sculpture,
    # pedestrians, lamps and tree crowns out of the repeated artwork.
    def gable(front):
        panel = masonry((1024, 768))
        draw = ImageDraw.Draw(panel)
        draw.rectangle((0, 649, 1024, 768), fill="#aaa391")
        for y in (187, 360, 471, 566, 647):
            draw.rectangle((0, y, 1024, y + 3), fill="#998e80")
        insert(panel, entrance, (291, 83, 313, 134), (479, 84, 74, 166))
        insert(panel, entrance, (237, 143, 361, 250), (353, 281, 400, 345))
        # Restore the pane behind a lamp head using the adjacent reflection.
        insert(panel, entrance, (278, 186, 291, 206), (483, 489, 50, 98))
        # Extend the masonry jambs down to grade and use the real lobby doors
        # for the lower panels, clear of the plaza sign and foreground sculpture.
        insert(panel, entrance, (238, 186, 360, 203), (353, 626, 400, 142))
        for x in (425, 590):
            insert(panel, entrance, (440, 255, 469, 286), (x, 626, 92, 142))
        if front:
            insert(panel, entrance, (155, 256, 232, 269), (105, 656, 250, 41))
        else:
            for x in (425, 588):
                insert(panel, park, (391, 388, 421, 413), (x, 339, 102, 429))
        return panel

    bay = masonry((512, 640))
    draw = ImageDraw.Draw(bay)
    draw.rectangle((0, 610, 512, 639), fill="#a89f8d")
    for y in (74, 301, 507):
        draw.rectangle((0, y, 512, y + 2), fill="#9b9184")
    insert(bay, park, (171, 389, 194, 418), (108, 125, 168, 166))
    insert(bay, entrance, (553, 244, 587, 285), (103, 394, 177, 209))
    glass = sample(entrance, (436, 196, 483, 241), (256, 256))
    return dict(EntryGable=gable(True), ParkGable=gable(False), LibraryBay=bay, LobbyGlass=glass)


def farm_materials():
    rng = np.random.default_rng(1908)
    y, x = np.indices((256, 256))
    # Sixteen courses of lap siding in a two-meter tile.
    grain = rng.normal(0, 1.9, (256, 256)) + 1.5 * np.sin(x / 16 + np.sin(y * 0.8))
    grain -= np.where(y % 16 < 2, 32, 0)
    grain += np.where(y % 16 == 2, 13, 0)
    siding = np.clip(np.array([225, 201, 146]) + grain[:, :, None], 0, 255)
    shingles = np.zeros((256, 256), dtype=float)
    for row in range(8):
        col = ((x[0] + (row % 2) * 32) // 64) % 4
        shingles[row * 32 : (row + 1) * 32] = rng.uniform(-6, 6, 4)[col]
    shingles += rng.normal(0, 5, (256, 256))
    shingles -= 18 * ((y % 32 < 3) | ((x + (y // 32 % 2) * 32) % 64 < 2))
    roof = np.clip(np.array([70, 73, 71]) + shingles[:, :, None], 0, 255)
    return dict(
        Clapboard=Image.fromarray(siding.astype("uint8")),
        Shingles=Image.fromarray(roof.astype("uint8")),
    )
