import { TRAVEL } from '../../maps/field-data.js';
import { PORCH } from './location.js';

// Game-space meters. The course joins the mapped Commons multi-use path and
// Sheridan sidewalks. The east-west neighborhood link follows the city aerial
// where the street layer has a gap. The last turn approaches the fictional door.
export const DOVER_ROUTE = [
  { x: TRAVEL[2].x, z: TRAVEL[2].z },
  { x: 1528, z: -1788 },
  { x: 1530, z: -1736 },
  { x: 1526, z: -1734 },
  { x: 1472, z: -1730 },
  { x: 1422, z: -1726 },
  { x: 1380, z: -1736 },
  { x: 1368, z: -1694 },
  { x: 1363, z: -1646 },
  { x: 1370, z: -1638 },
  { x: 1366, z: -1584 },
  { x: 1366, z: -1556 },
  { x: 1370, z: -1538 },
  { x: 1364, z: -1514 },
  { x: 1360, z: -1488 },
  { x: 1338, z: -1484 },
  { x: 1338, z: -1428 },
  { x: 1338, z: -1372 },
  { x: 1334, z: -1350 },
  { x: 1330, z: -1346 },
  { x: 1332, z: -1300 },
  { x: 1330, z: -1246 },
  { x: 1330, z: -1190 },
  { x: 1330, z: -1136 },
  { x: 1274, z: -1136 },
  { x: 1218, z: -1136 },
  { x: 1164, z: -1136 },
  { x: 1162, z: -1082 },
  { x: 1162, z: -1026 },
  { x: 1156, z: -988 },
  { x: PORCH.x + 1.85, z: PORCH.z },
];
