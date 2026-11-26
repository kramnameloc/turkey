"""Bake the street materials from Pasha's Street GLB. Requires Pillow and numpy."""
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/scenery'


def read_images(path):
    with path.open('rb') as source:
        source.seek(12)
        size, kind = struct.unpack('<II', source.read(8))
        assert kind == 0x4E4F534A
        model = json.loads(source.read(size))
        source.read(8)
        binary = source.tell()
        images = []
        for image in model['images']:
            view = model['bufferViews'][image['bufferView']]
            source.seek(binary + view.get('byteOffset', 0))
            images.append(Image.open(io.BytesIO(source.read(view['byteLength']))).convert('RGBA'))
    return images


def repeat_detail(source, box):
    # Mirror the wear at the four borders so adjacent tiles meet cleanly.
    layer = Image.new('RGBA', source.size, (153, 153, 153, 255))
    layer.alpha_composite(source)
    quarter = layer.crop(box).convert('L').resize((256, 256), Image.Resampling.BICUBIC)
    tile = np.asarray(quarter, dtype=float)
    tile = np.concatenate((tile, np.fliplr(tile)), axis=1)
    tile = np.concatenate((tile, np.flipud(tile)))
    return np.clip((tile - tile.mean()) / max(1, tile.std()), -2.7, 2.7)



def house_fronts(images):
    # Each 5.6 x 2.9 m bay has plain, window and entrance versions. The
    # photographed glazing comes from the existing Scouser facade in the game.
    windows = Image.open(OUTPUT / 'civic-facade.webp').convert('RGB')
    double = windows.crop((77, 67, 370, 337)).resize((134, 117), Image.Resampling.LANCZOS)
    glass = ImageEnhance.Brightness(double).enhance(.79)
    atlas = Image.new('RGB', (512, 6 * 256))
    for variant in range(2):
        source = images[1 if variant == 0 else 6].convert('RGB')
        masonry = source.resize((152, 150), Image.Resampling.LANCZOS)
        if variant:
            masonry = Image.blend(masonry, Image.new('RGB', masonry.size, '#c5b8a1'), .31)
        tile = Image.new('RGB', (512, 256))
        for x in range(0, 512, 152):
            for y in range(0, 256, 150):
                tile.paste(masonry, (x,y))
        for row in range(3):
            bay = tile.copy()
            pen = ImageDraw.Draw(bay)
            if row:
                for x in ([64, 310] if row == 1 else [310]):
                    pen.rectangle((x-4,54,x+138,183), fill='#524b40')
                    bay.paste(glass, (x,57))
                    pen.rectangle((x-6,174,x+140,180), fill='#b4ab99')
            if row == 2:
                pen.rectangle((76,66,172,255), fill='#51443b')
                pen.rectangle((80,69,168,255), fill='#c4bca8')
                pen.rectangle((86,74,162,253), fill='#536256' if variant else '#704d37')
                bay.paste(glass.crop((8,6,64,44)), (96,87))
                for x in (95,129):
                    pen.rectangle((x,145,x+24,228), outline='#383c32', width=2)
                pen.ellipse((151,159,156,164), fill='#c2b18c')
                pen.rectangle((77,251,171,255), fill='#9e998a')
            atlas.paste(bay, (0,(variant*3+row)*256))
    atlas.save(OUTPUT / 'street-houses.webp', quality=86, method=6)


def bake():
    images = read_images(ROOT / 'download-models/street.glb')
    rng = np.random.default_rng(1976)
    asphalt = repeat_detail(images[17], (0, 2, 120, 106))
    concrete = repeat_detail(images[16], (8, 5, 490, 224))
    for name, base, wear, grit in [
        ('asphalt', (81, 80, 77), asphalt * 4.4, 8.5),
        ('concrete', (169, 163, 150), concrete * 5.2, 5.0),
    ]:
        surface = wear + rng.normal(0, grit, wear.shape)
        pixels = np.clip(np.array(base) + surface[:, :, None], 0, 255).astype('uint8')
        Image.fromarray(pixels).save(OUTPUT / f'street-{name}.webp', quality=86, method=6)

    # The original utility atlas includes graffiti and stripes outside these UV islands.
    utilities = Image.new('RGBA', (128, 64))
    for x, box in [(4, (16, 64, 67, 115)), (68, (0, 115, 33, 128))]:
        detail = images[15].crop(box)
        rgb = ImageEnhance.Contrast(detail.convert('RGB')).enhance(1.25)
        rgb.putalpha(detail.getchannel('A'))
        utilities.paste(rgb.resize((56, 56), Image.Resampling.LANCZOS), (x, 4))
    utilities.save(OUTPUT / 'street-ironwork.webp', lossless=True, method=6)
    house_fronts(images)


if __name__ == '__main__':
    bake()
