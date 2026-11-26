"""Bake the two Dover house finishes from the game's credited residential materials."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parents[1] / 'public/scenery'


def bake():
    rng = np.random.default_rng(735)
    fronts = Image.open(ART / 'street-houses.webp').convert('RGB')
    glazing = fronts.crop((310,313,444,430))
    atlas = Image.new('RGB', (512, 8*256))
    for i, (color, trim) in enumerate([((183,174,151), '#e9dfc7'), ((159,163,157), '#e2e0d2')]):
        grain = rng.normal(0, 1.8, (256,512,1))
        board = np.arange(256)[:,None,None] % 16
        lap = np.clip(color + grain + np.where(board < 2,-25,np.where(board==2,8,0)),0,255)
        plain = Image.fromarray(lap.astype('uint8'))
        sash = plain.copy()
        width = 212 if i == 0 else 258
        x = (512-width)//2
        pen = ImageDraw.Draw(sash)
        pen.rectangle((x-6,48,x+width+6,181), fill='#615e55')
        pen.rectangle((x-4,46,x+width+4,176), fill=trim)
        for n in range(2):
            sash.paste(glazing.resize((width//2-5,114),Image.Resampling.LANCZOS),
                       (x+2+n*(width//2),54))
        pen.rectangle((x-9,173,x+width+9,180),fill=trim)
        masonry = fronts.crop((0,(i*3+1)*256,512,(i*3+2)*256))
        door = fronts.crop((0,i*3*256,512,(i*3+1)*256))
        pen = ImageDraw.Draw(door)
        leaves = 1+i
        for leaf in range(leaves):
            left = 10 + round(486*leaf/leaves)
            right = 9 + round(486*(leaf+1)/leaves)
            pen.rectangle((left-3,3,right+3,255), fill=trim)
            pen.rectangle((left,7,right,255),fill='#514c43')
            pen.rectangle((left+3,9,right-3,252),fill=trim)
            cols = 4 if leaves == 1 else 2
            for row in range(4):
                y = 11+row*60
                pen.line((left+3,y+54,right-3,y+54), fill='#a8a596',width=2)
                for col in range(cols):
                    l = round(left+9+(right-left-17)*col/cols)
                    r = round(left+2+(right-left-17)*(col+1)/cols)
                    pen.rectangle((l,y+6,r,y+46),outline='#a9a697',width=2)
                    pen.line((l+3,y+43,r-3,y+43),fill='#eee9d6',width=2)
        for row,img in enumerate((plain,sash,masonry,door)):
            atlas.paste(img,(0,(4*i+row)*256))
    atlas.save(ART / 'dover-houses.webp', quality=87, method=6)

    # An empty center strip of Dover between the two circle junctions.
    # The 8 x 18 m sample is mirrored across both edges for seamless repetition.
    from geo_export import BASE
    import json
    course = next(s for s in json.loads((BASE/'courses/maps.json').read_text()) if s['id'] == 'dover')
    photo = Image.open(BASE / 'courses/dover.jpg').convert('RGB')
    b = course['bounds']
    def pixel(x,z):
        return (round((x-b['minX']) * photo.width / (b['maxX']-b['minX'])),
                round((z-b['minZ']) * photo.height / (b['maxZ']-b['minZ'])))
    pavement = np.array(photo.crop((*pixel(1155,-997), *pixel(1163,-979))))
    pavement = np.concatenate((pavement, np.fliplr(pavement)),axis=1)
    pavement = np.concatenate((pavement, np.flipud(pavement)),axis=0)
    Image.fromarray(pavement).save(ART / 'dover-asphalt.webp', lossless=True, method=6)


if __name__ == '__main__':
    bake()
