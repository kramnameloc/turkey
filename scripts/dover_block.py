"""Street edges and crown centers traced in the 2020 DRAPP aerial, in game meters."""
from math import hypot

# Each apron runs from the building to the public walk. Endpoints also orient
# the illustrative garage artwork on the corresponding surveyed wall.
APRONS = [
    ((1144,-1112),(1153,-1112),5.8), ((1176,-1118),(1166,-1118),5.9),
    ((1144,-1100),(1153,-1100),6.4),
    ((1144,-1069),(1153,-1069),6.0), ((1188,-1074),(1188,-1062),5.9),
    ((1144,-1058),(1153,-1058),6.3), ((1144,-1027),(1153,-1027),5.0),
    ((1176,-1029),(1166,-1029),5.7), ((1144,-1016),(1153,-1016),5.4),
    ((1179,-1006),(1166,-1006),5.4), ((1144,-983.5),(1153,-983.5),9.4),
    ((1176.5,-996),(1166,-996),6.2), ((1144,-970),(1153,-970),5.6),
    ((1143,-938),(1153,-938),5.2), ((1187,-951),(1187,-961),5.6),
    ((1144,-925),(1153,-925),6.6), ((1189,-903),(1175,-906),5.1),
]
# Inside curb of the bulb. Dover's west curb continues straight into the arc.
TURN = [(1153,-935),(1166,-935),(1166.1,-932),(1166.9,-930),(1168.2,-928.7),
        (1171,-927.0),(1174,-924.7),(1176.5,-921.7),(1177.8,-918.3),
        (1178.1,-914.5),(1177.7,-911.1),(1176.1,-907.8),(1173.8,-905),
        (1170.9,-903.1),(1167.3,-902),(1163.9,-901.8),(1160.4,-902.5),
        (1157.3,-904.2),(1155.2,-906.5),(1153.7,-909.4),(1153,-913)]
WALKS = [
    [(1114,-1133),(1147,-1132.5),(1149,-1131.8),(1151,-1130),(1152.2,-1127.7),
     (1152.2,-914),(1152.8,-910),(1154.3,-906.8),(1156.7,-903.8),(1160,-901.8),
     (1163.9,-900.9),(1167.5,-901.1),(1171.3,-902.3),(1174.6,-904.4),(1176.9,-907.4),
     (1178.6,-910.9),(1179,-914.4),(1178.7,-918.5),(1177.3,-922.2),(1174.7,-925.4),
     (1171.5,-927.8),(1168.8,-929.5),(1167.6,-930.8),(1166.9,-932.7),(1166.8,-954.8),
     (1167.8,-957.1),(1169.3,-958.7),(1171.9,-959.9),(1198,-959.9)],
    [(1198,-974.5),(1171.2,-974.5),(1168.9,-975.2),(1167.3,-977.0),(1166.7,-979.2),
     (1166.6,-1044),(1167.1,-1046.1),(1168.6,-1048.2),(1171,-1049.1),(1195,-1049.1)],
    [(1195,-1063.5),(1172,-1063.5),(1169.3,-1064.1),(1167.5,-1065.6),
     (1166.6,-1068),(1166.6,-1128.6),(1167.4,-1130.7),(1169.1,-1132.0),
     (1171.3,-1132.4),(1215,-1131.9)],
    [(1114,-1147.9),(1177,-1147.3),(1179.8,-1148.2),(1181.5,-1150.4),(1182.3,-1153),(1182.3,-1160)],
    [(1190.6,-1160),(1190.8,-1152),(1191.8,-1149.3),(1193.8,-1147.6),(1196,-1146.9),(1215,-1146.7)],
]
# Crown locations from the public aerial. Heights are the 95th percentile of
# above-ground 2020 USGS returns within four meters of each estimated trunk.
CROWNS = [
    (1145,-1120,14.1),(1137,-1131,10.9),(1119,-1122,15.4),(1126,-1108,15.4),
    (1147,-1093,13),(1143,-1083,10.7),(1168,-1094,10.9),(1182,-1091,15),
    (1176,-1071,13.2),(1148,-1044,13.8),(1144,-1051,12.7),(1168,-1040,12.1),
    (1178,-1047,11.9),(1148,-1007,14),(1171,-1018,14.6),(1173,-1009,15.1),
    (1148,-992,10.6),(1172,-989,9.8),(1172,-979,6.4),(1183,-978,10.9),
    (1147,-957,12.5),(1146,-950,14.1),(1120,-948,11.6),(1146,-930,5.8),
    (1144,-916,12.5),(1186,-908,14.9),(1174,-901,10.5),(1207,-955,16.5),
    (1206,-1065,12),(1119,-1155,11.5),(1138,-1150,9.9),(1203,-1132,11.5),
]
EVERGREENS = {(1143,-1083),(1172,-979),(1183,-978),(1146,-930),(1174,-901),
              (1119,-1155),(1138,-1150)}


def course_paths():
    return ([dict(type='Attached Sidewalk', width=1.55, name='Dover block', points=p) for p in WALKS]
            + [dict(type='Concrete Apron', width=w, name='Dover block', points=[a,b]) for a,b,w in APRONS])


def adjust_roads(roads):
    # The regional exporter normally omits private-class roads. These two
    # centerlines restore the continuous east-west street visible from Dover.
    for points in [[(1042,-1141),(1070,-1140),(1160,-1140)],
                   [(1160,-1140),(1188,-1139),(1284,-1138),(1346,-1138)]]:
        roads.append(dict(name='E 9Th Ave', type='Private', width=12.8, surface='Dover asphalt', points=points))
    for r in roads:
        if r['name'] == 'Dover St' and all(-1150 < z < -900 for x,z in r['points']):
            r['width'] = 13.3
            r['surface'] = 'Dover asphalt'
            if any(z > -930 for x,z in r['points']):
                r['points'] = [(1166,-910),(1160,-922),(1160,-967)]
        if r['name'] == 'E 7Th Avenue Cir' and any(x == 1160 for x,z in r['points']):
            r['width'] = 13.0
            r['surface'] = 'Dover asphalt'


def dress_tile(tile, bounds):
    for x,z,height in CROWNS:
        if (bounds['minX'] <= x < bounds['maxX'] and bounds['minZ'] <= z < bounds['maxZ']
            and all(hypot(x-t['x'], z-t['z']) > 3 for t in tile['trees'])):
            tile['trees'].append(dict(x=x, z=z, type='Coniferous' if (x,z) in EVERGREENS else 'Deciduous',
                                      species='', height=height, surveyHeight=height))
    for tree in tile['trees']:
        if (tree['x'], tree['z']) in {(1148,-992),(1148,-1007),(1147,-957),(1146,-950)}:
            tree['fullLeaf'] = True
    for b in tile['buildings']:
        if b['type'] != 'Single Family':
            continue
        # Bind each facade to the actual apron endpoint on its public-facing
        # side. Fresh footprint exports may reorder vertices, so use distances.
        choices = []
        for (x,z), (sx,sz), width in APRONS:
            if hypot(x-b['points'][0][0], z-b['points'][0][1]) > 38:
                continue
            for i,(a,c) in enumerate(zip(b['points'], b['points'][1:]+b['points'][:1])):
                dx,dz = c[0]-a[0], c[1]-a[1]
                length = hypot(dx,dz)
                if length < 4 or abs(dx*(sx-x)+dz*(sz-z)) > .42*length*hypot(sx-x,sz-z):
                    continue
                u = max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/length**2))
                error = hypot(a[0]+u*dx-x,a[1]+u*dz-z)
                if error < 2:
                    choices.append((error,i,round(u,3),round(min(width, length-.4),1)))
        if choices:
            _,edge,center,width = min(choices)
            b['doverFacade'] = dict(edge=edge, center=center, width=width)
            for (x,z),model in [((1144,-981),'Dover gray gable'),((1144,-966),'Dover green timber')]:
                if [x,z] in b['points']:
                    b['doverFacade']['model'] = model


def measure_roofs(buildings, survey):
    """Keep the sampled roof and its boundary edge correspondence in the streaming tile."""
    import numpy as np
    from survey_roof import sample_roof
    for b in buildings:
        if 'doverFacade' not in b or 'roofHeight' not in b:
            continue
        _, points, faces, edges, heights, _ = sample_roof(b, survey, residential=True)
        # A common floor datum keeps neighboring wall sections at the same level.
        b['doverRoof'] = dict(vertices=np.column_stack((points, heights)).round(2).tolist(),
                              faces=faces.tolist(), edges=edges,
                              eave=round(float(np.percentile(heights[:len(edges)],20)),2))
