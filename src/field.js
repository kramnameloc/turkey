// Shared field API for gameplay, scenery and tools that consume the map.
export { BODY_RADIUS } from './player/turkey-scale.js';
export { DISHES, LIMIT, SPAWN, TRAVEL, dishSpawn, fieldData, formatTime, regionData } from './maps/field-data.js';
export { drawMap, loadMapImage } from './maps/draw-map.js';
export {
  Obstacles, PARK_SIGNS, SIGN_DEPTH, SIGN_WIDTH, contains, plantParkSaplings,
  randomSeed, segmentDistanceSq, slideMove, treeShape,
} from './maps/obstacles.js';
