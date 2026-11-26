"""Build two street-facing game exteriors from the supplied July 2026 visual reference."""
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from landmark_materials import farm_materials
from landmark_mesh import Mesh, write_glb

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'public/scenery'


# u increases to the right when facing the front, depth increases toward the street.
def point(u, y, depth):
    return (depth, y, -u)


def box(mesh, material, u, y, d, w, h, depth):
    mesh.box(material, point(u,y,d), (depth,h,w))


def panel(mesh, mat, corners, side=False):
    uv = [((d if side else u)/2, -y/2) for u,y,d in corners]
    mesh.face(mat, [point(*p) for p in corners], uv)


def gabled_volume(mesh, left, right, back, front, belt, eave, peak, lower, upper, trim):
    ridge = (left+right)/2
    for y0,y1,mat in [(-.72,belt,lower),(belt,eave,upper)]:
        for d,order in [(front,(left,right)),(back,(right,left))]:
            a,b = order
            panel(mesh,mat,[(a,y0,d),(b,y0,d),(b,y1,d),(a,y1,d)])
        for u,order in [(left,(back,front)),(right,(front,back))]:
            a,b = order
            panel(mesh,mat,[(u,y0,a),(u,y0,b),(u,y1,b),(u,y1,a)],True)
    for d,(a,b) in [(front,(left,right)),(back,(right,left))]:
        panel(mesh,upper,[(a,eave,d),(b,eave,d),(ridge,peak,d)])
    roof(mesh,left,right,back,front,eave,peak,trim)


def roof(mesh, left, right, back, front, eave, peak, trim, overhang=.23):
    mid = (left+right)/2
    edge_y = eave-overhang*(peak-eave)/(mid-left)
    a,b = back-overhang,front+overhang
    for u in (left-overhang,right+overhang):
        outline = [(u,edge_y,b),(mid,peak,b),(mid,peak,a),(u,edge_y,a)]
        if u>mid:
            outline.reverse()
        mesh.face('Asphalt shingles',[point(*p) for p in outline],
                  [(v/2,d/2) for v,y,d in outline])
        underside = [(v,y-.14,d) for v,y,d in outline]
        panel(mesh,trim,underside[::-1])
        for i,p in enumerate(outline):
            j=(i+1)%4
            if p[0] == mid and outline[j][0] == mid:
                continue
            panel(mesh,trim,[p,underside[i],underside[j],outline[j]])


def front_panel(mesh, mat, u, y, d, w, h):
    verts = [(u-w/2,y-h/2,d),(u+w/2,y-h/2,d),(u+w/2,y+h/2,d),(u-w/2,y+h/2,d)]
    mesh.face(mat, [point(*p) for p in verts])


def window(mesh, u,y,d,w,h, trim, lights=2):
    box(mesh,trim,u,y,d+.05,w+.16,h+.16,.1)
    front_panel(mesh,'Reflected glass',u,y,d+.106,w,h)
    for i in range(1, lights):
        box(mesh,trim,u-w/2+w*i/lights,y,d+.115,.043,h,.042)
    box(mesh,trim,u,y-h/2-.062,d+.08,w+.25,.095,.21)


def garage(mesh, u, d, width, height, trim, door):
    box(mesh,trim,u,height/2-.07,d+.055,width+.20,height+.16,.11)
    box(mesh,'Reveal',u,height/2-.07,d+.12,width+.07,height+.04,.08)
    # Each stamped steel panel catches light on its four sloping shoulders.
    # Keep the grain aligned across each section and at the double-width bay.
    columns = 3 if width < 3 else 6
    def surface(corners):
        mesh.face(door, [point(*p) for p in corners],
                  [((v-u+width/2)/width*columns/3, 1-(y+.07)/height) for v,y,_ in corners])
    for row in range(4):
        for col in range(columns):
            left, bottom = u-width/2+width*col/columns, -.07+height*row/4
            right, top = left+width/columns, bottom+height/4
            def ring(inset, depth):
                return [(left+inset,bottom+inset,depth),(right-inset,bottom+inset,depth),
                        (right-inset,top-inset,depth),(left+inset,top-inset,depth)]
            frame, edge, field = ring(0,d+.164), ring(.058,d+.164), ring(.091,d+.189)
            for outer,inner in [(frame,edge),(edge,field)]:
                for i in range(4):
                    j=(i+1)%4
                    surface([outer[i],outer[j],inner[j],inner[i]])
            surface(field)
    box(mesh,'Reveal',u,.025,d+.175,width,.05,.058)
    # A recessed lift grip just above the bottom weather seal.
    box(mesh,'Reveal',u,.48,d+.20,.23,.048,.03)


def eave_drain(mesh, edge, side, back, front, eave, slope, trim):
    gutter = edge + side*.23
    lip = eave - slope*.23
    box(mesh,trim,gutter,lip-.085,(back+front)/2,.16,.14,front-back+.46)
    box(mesh,trim,gutter+side*.075,lip-.034,(back+front)/2,.034,.047,front-back+.46)
    # The outlet doglegs under the overhang, then follows the brick pier.
    pipe = edge - side*.13
    path = [(gutter,lip-.12,front+.12),(gutter,lip-.27,front+.12),
            (pipe,lip-.55,front+.086),(pipe,.3,front+.086),(pipe,.14,front+.24)]
    prev = None
    for u,y,d in path:
        ring = [(u-.047,y,d+.042),(u+.047,y,d+.042),
                (u+.047,y,d-.042),(u-.047,y,d-.042)]
        if prev:
            for i in range(4):
                j=(i+1)%4
                panel(mesh, trim, [prev[i], ring[i], ring[j], prev[j]])
        prev = ring
    for y in (.68, 2.34):
        box(mesh,trim,pipe,y,front+.088,.12,.035,.109)


def twin_garage():
    m = Mesh('Gray gable · Dover', (1137,-986.5), 'Dover gray gable')
    # Two stepped volumes fit the mapped L-shaped lot outline.
    gabled_volume(m,2.85,10.5,-7,1,2.04,3.9,5.05,'Russet brick','Sage laps','Ivory')
    gabled_volume(m,-5.5,2.85,-7,7,2.84,5.23,6.86,'Russet brick','Sage laps','Ivory')
    box(m,'Ivory',-1.325,2.86,7.10,8.46,.16,.23)
    for u in (-2.90,-.10):
        garage(m,u,7,2.55,2.19,'Ivory','Gray garage')
    # A projecting window and its little gable are distinct from the main roof.
    box(m,'Ivory',.20,4.31,7.15,1.92,1.56,.38)
    panel(m,'Ivory',[(-.76,5.08,7.35),(1.16,5.08,7.35),(.20,5.60,7.35)])
    for u in (-.76,1.16):
        panel(m,'Ivory',[(u,5.04,7.0),(.20,5.6,7.0),(.20,5.6,7.35),(u,5.04,7.35)])
    roof(m,-.80,1.2,6.88,7.38,5.08,5.62,'Ivory',.12)
    window(m,.20,4.41,7.35,1.57,.99,'Ivory')
    box(m,'Ivory',-1.325,6.19,7.04,.51,.62,.10)
    box(m,'Reveal',-1.325,6.19,7.11,.36,.46,.052)
    for i in range(6):
        box(m,'Louver',-1.325,6.01+i*.066,7.15,.32,.021,.035)
    window(m,5.45,2.8,1,2.35,1.08,'Ivory',3)
    eave_drain(m,-5.5,-1,-7,7,5.23,(6.86-5.23)/4.175,'Ivory')
    eave_drain(m,10.5,1,-7,1,3.9,(5.05-3.9)/3.825,'Ivory')
    return m


def timber_front():
    m = Mesh('Green half-timber · Dover', (1137,-970), 'Dover green timber')
    gabled_volume(m,-12,-4,-8,2,2.15,3.4,4.7,'Buff brick','Warm plaster','Green timber')
    gabled_volume(m,-4,4,-7.1,7,2.45,4.96,6.30,'Buff brick','Warm plaster','Green timber')
    garage(m,-.6,7,4.9,2.23,'Green timber','Green garage')
    for y in (2.51,3.46,4.94):
        box(m,'Green timber',0,y,7.075,8.08,.145,.115)
    for u in (-3.91,-2.46,-.78,.92,2.55,3.91):
        top=6.3-abs(u)/4*1.34
        box(m,'Green timber',u,(2.52+top)/2,7.085,.15,top-2.52,.13)
    window(m,-.24,4.22,7.14,2.33,1.25,'Green timber',3)
    box(m,'Green timber',.91,5.57,7.11,.7,.86,.15)
    front_panel(m,'Reflected glass',.91,5.57,7.195,.45,.59)
    for depth in (-4.0,.60,4.1):
        box(m,'Green timber',4.025,3.68,depth,.09,1.38,.93)
        box(m,'Side glass',4.087,3.68,depth,.05,1.19,.74)
    box(m,'Buff brick',4.40,3.26,-4.60,.82,6.9,.92)
    box(m,'Capstone',4.40,6.80,-4.60,.91,.20,1.02)
    eave_drain(m,4,1,-7.1,7,4.96,(6.30-4.96)/4,'Green timber')
    return m


def materials():
    rng = np.random.default_rng(735)
    y,x = np.indices((384,384))
    grain = rng.normal(0,1.6,x.shape)
    def raster(color, variation):
        return Image.fromarray(np.clip(np.array(color)+variation[:,:,None],0,255).astype('uint8'))
    lap = y % 27
    images = {'Sage laps':raster([113,123,117],grain + 2*np.sin(x/22+y/7) -
                                25*(lap<2) + 9*(lap==2)),
              'Warm plaster':raster([215,222,224],grain*.9),
              'Asphalt shingles':farm_materials()['Shingles']}
    source = Image.open(ART/'street-houses.webp').convert('RGB')
    bricks = np.array(source.crop((0,0,512,256)),dtype=float)
    relief = (bricks-bricks.mean(axis=(0,1)))*.87
    for mat,color in [('Russet brick',[145,90,70]),('Buff brick',[169,148,115])]:
        images[mat]=Image.fromarray(np.clip(color+relief,0,255).astype('uint8'))
    for mat,color in [('Gray garage',[111,116,106]),('Green garage',[65,88,75])]:
        field = grain*.65 + 7*y/384 - 17*(y%96<3) - 9*(x%128<2)
        door = raster(color,field)
        pen = ImageDraw.Draw(door)
        for row in range(4):
            for col in range(3):
                ox,oy=col*128,row*96
                pen.rectangle((ox+9,oy+8,ox+119,oy+86),outline=tuple(c-12 for c in color),width=2)
        images[mat]=door
    # Paint cool sky and diffuse treetops in the glazing, with narrow curtain folds.
    width, height = 384, 256
    glass=Image.fromarray(np.uint8(np.broadcast_to(
        np.linspace([85,108,112],[42,58,54],height)[:,None,:], (height,width,3))))
    reflections=ImageDraw.Draw(glass,'RGBA')
    for _ in range(600):
        u=rng.integers(-14,width)
        v=rng.normal(180+34*np.sin(u/62),27)
        r=rng.integers(3,16)
        reflections.ellipse((u-r,v-r,u+r,v+r),fill=(33,50,41,52))
    glass=glass.filter(ImageFilter.GaussianBlur(1.4))
    veil=ImageDraw.Draw(glass,'RGBA')
    for u in range(0,128,5):
        veil.line((u,0,u-6,254),fill=(183,183,166,43),width=2)
    images['Reflected glass']=glass
    colors = {'Ivory':'daceb2','Green timber':'294c39','Side glass':'43554e',
              'Capstone':'827769','Reveal':'403e32','Louver':'645f50'}
    return images, colors


def summer_leaves():
    # The source includes matching full-leaf and November albedo/alpha UV atlases.
    path=next((ROOT/'download-models').glob('oak_trees_pack_*.glb'))
    with path.open('rb') as f:
        f.seek(12)
        n,_=struct.unpack('<II',f.read(8))
        doc=json.loads(f.read(n))
        f.read(8)
        origin=f.tell()
        mat=next(m for m in doc['materials'] if m['name']=='Cluster_Mat')
        texture=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
        view=doc['bufferViews'][doc['images'][texture['source']]['bufferView']]
        f.seek(origin+view.get('byteOffset',0))
        leaves=Image.open(io.BytesIO(f.read(view['byteLength']))).convert('RGBA')
    leaves.thumbnail((1024,1024),Image.Resampling.LANCZOS)
    rgba=np.array(leaves)
    rgba[:,:,:3]=np.clip(rgba[:,:,:3]*[1.26,1.35,1.10],0,255).astype('uint8')
    foliage=Image.fromarray(rgba)
    foliage.save(ART/'dover-leaves.webp',quality=84,method=6)
    foliage_clumps(foliage)


def foliage_clumps(leaves):
    rng=np.random.default_rng(5802)
    # Isolate fine leafy tips, then overlap smaller sprays at different depths.
    # A feathered mask trims partial leaves on the crop edges.
    tips=leaves.crop((720,706,1018,1015)).resize((180,180),Image.Resampling.LANCZOS)
    y,x=np.indices((180,180))
    feather=np.clip(np.minimum.reduce([x,y,179-x,179-y])/16,0,1)
    tips.putalpha(Image.fromarray((np.asarray(tips.getchannel('A'))*feather).astype('uint8')))
    spray=Image.new('RGBA',(320,256))
    for i in range(52):
        angle=rng.uniform(0,2*np.pi)
        radius=np.sqrt(rng.random())
        cx=160+np.cos(angle)*radius*104
        cy=128+np.sin(angle)*radius*76
        w=int(rng.integers(65,108))
        sprig=tips.resize((w,w),Image.Resampling.LANCZOS).rotate(int(rng.integers(360)),expand=True)
        color=np.array(sprig)
        color[:,:,:3]=np.clip(color[:,:,:3]*rng.uniform(.70,1.22),0,255).astype('uint8')
        spray.alpha_composite(Image.fromarray(color),(int(cx-sprig.width/2),int(cy-sprig.height/2)))
    spray.save(ART/'dover-spray.webp',quality=89,method=6)
    hedge=Image.new('RGBA',(512,512),'#304023')
    for i in range(770):
        w=int(rng.integers(28,72))
        tile=spray.resize((w,round(w*.8)),Image.Resampling.LANCZOS)
        x,y=rng.integers(0,512,size=2)
        for dx in (0,-512):
            for dy in (0,-512):
                hedge.alpha_composite(tile,(x+dx,y+dy))
    hedge.convert('RGB').save(ART/'dover-hedge.webp',quality=88,method=6)


def lawn():
    # World-space crop, with one RGB turf image and the matching projected shade in alpha.
    density = 32
    width,height = 16*density,62*density
    rng=np.random.default_rng(7357)
    photo=Image.open(ART/'grass.webp').convert('L')
    signal=np.asarray(photo.resize((width,width),Image.Resampling.LANCZOS),dtype=float)
    relief=np.tile(signal,(4,1))[:height]
    relief=(relief-np.median(relief))*.56
    def noise(size):
        variation=Image.fromarray(rng.integers(0,256,size,dtype='uint8'))
        return np.array(variation.resize((width,height),Image.Resampling.BICUBIC),dtype=float)/255
    dry=.59*noise((18,5))+.41*noise((67,17))
    rgb=np.array([87,99,52])+dry[:,:,None]*[65,36,38]+relief[:,:,None]
    x=1138+(np.arange(width)+.5)/density
    z=-1018+(np.arange(height)[:,None]+.5)/density
    for cx,cz in [(1148,-992),(1148,-1007),(1147,-957)]:
        dirt=np.exp(-((x-cx)**2 + (z-cz)**2)/1.2)
        rgb+=dirt[:,:,None]*[4,-18,-4]
    # Irregular patches of sky visible through the crown break up the shadow.
    shade=Image.new('L',(width,height))
    mask=ImageDraw.Draw(shade)
    def ellipse(cx,cz,rx,rz,value):
        mask.ellipse(((cx-rx-1138)*density,(cz-rz+1018)*density,
                      (cx+rx-1138)*density,(cz+rz+1018)*density), fill=value)
    for cx,cz,spread in [(1148,-992,5.7),(1148,-1007,6.1),(1147,-957,4.8)]:
        for _ in range(3500):
            angle=rng.uniform(0,2*np.pi)
            radius=np.sqrt(rng.random())*(.91+.09*np.cos(5*angle)+.06*np.sin(7*angle))
            px=cx+1.1+spread*radius*np.cos(angle)
            pz=cz-1.3+spread*radius*np.sin(angle)
            r=rng.uniform(.065,.26)*(1.15-.38*radius)
            ellipse(px,pz,r*1.5,r,int(rng.integers(74,137)))
        ellipse(cx,cz,.42,.33,126)
    ellipse(1148.1,-980.4,1.98,.87,139)
    ellipse(1145.7,-977.45,5.6,1.2,125)
    shadow=np.asarray(shade.filter(ImageFilter.GaussianBlur(1.7)),dtype=float)
    fade=np.clip(np.minimum.reduce([z[:,0]+1018,-956-z[:,0]])/1.7,0,1)
    alpha=np.clip(2+shadow*fade[:,None],2,156).astype('uint8')
    texture=Image.fromarray(np.clip(rgb,0,255).astype('uint8'))
    texture.putalpha(Image.fromarray(alpha))
    texture.save(ART/'dover-lawn.webp',quality=88,method=6)


if __name__ == '__main__':
    images, colors = materials()
    write_glb(ROOT/'public/models/dover-exteriors.glb', [twin_garage(),timber_front()],images,colors)
    summer_leaves()
    lawn()
