export const SPAWN = { x: -44, z: 20 };
export const LIMIT = 300;
export const DISHES = [
  {
    id: 'corn',
    baseHealth: 48,
    stop: 0,
    name: 'Corn on the cob',
    color: '#e7b149',
    x: -60,
    z: 16,
    spot: 'West lawn',
  },
  {
    id: 'mash',
    baseHealth: 72,
    stop: 1,
    name: 'Mashed potatoes',
    color: '#e8d6a8',
    x: -112,
    z: -47,
    spot: 'Community Park',
  },
  {
    id: 'beans',
    baseHealth: 42,
    stop: 2,
    name: 'Green beans',
    color: '#a5b870',
    x: -169,
    z: -94,
    spot: 'Northwest lawn',
  },
  {
    id: 'berries',
    baseHealth: 52,
    stop: 3,
    name: 'Cranberry sauce',
    color: '#d57072',
    x: 134,
    z: -72,
    spot: 'East of the garden',
  },
  {
    id: 'stuffing',
    baseHealth: 76,
    stop: 4,
    name: 'Herb stuffing',
    color: '#d29862',
    x: 206,
    z: 29,
    spot: 'Ballfields approach',
  },
  {
    id: 'yams',
    baseHealth: 64,
    stop: 5,
    name: 'Candied yams',
    color: '#ea9452',
    x: 55,
    z: 76,
    spot: 'Pond overlook',
  },
  {
    id: 'pumpkinPie',
    baseHealth: 68,
    name: 'Pumpkin pie',
    color: '#de8850',
    x: -90,
    z: 8,
    spot: 'West lawn',
    stop: 0,
    dessert: true,
  },
  {
    id: 'applePie',
    baseHealth: 80,
    name: 'Lattice apple pie',
    color: '#daae70',
    x: -138,
    z: -43,
    spot: 'West trail',
    stop: 1,
    dessert: true,
  },
  {
    id: 'cookie',
    baseHealth: 44,
    name: 'Chocolate chunk cookie',
    color: '#c99967',
    x: -103,
    z: -96,
    spot: 'North lawn',
    stop: 2,
    dessert: true,
  },
  {
    id: 'gingerbread',
    baseHealth: 46,
    name: 'Gingerbread runner',
    color: '#c78658',
    x: 99,
    z: -54,
    spot: 'Garden trail',
    stop: 3,
    dessert: true,
  },
  {
    id: 'cupcake',
    baseHealth: 54,
    name: 'Maple cupcake',
    color: '#e5ae86',
    x: 165,
    z: 20,
    spot: 'Ballfields approach',
    stop: 4,
    dessert: true,
  },
  {
    id: 'cinnamonRoll',
    baseHealth: 62,
    name: 'Cinnamon roll',
    color: '#cc966d',
    x: 25,
    z: 60,
    spot: 'Pond overlook',
    stop: 5,
    dessert: true,
  },
];
export function dishSpawn(dish, mode) {
  if (mode !== 'city') return { x: dish.x, z: dish.z };
  const stop = TRAVEL[dish.stop];
  if (dish.dessert) return { x: stop.x - 7, z: stop.z + 19 };
  if (dish.stop === 0) return { x: dish.x, z: dish.z };
  return { x: stop.x - 13, z: stop.z };
}
export const formatTime = (seconds) =>
  Math.floor(seconds / 60) +
  ':' +
  String(Math.floor(seconds % 60)).padStart(2, '0');

export const TRAVEL = [
  { name: 'Community Park', ...SPAWN },
  { name: 'Brunner Farmhouse', x: -77, z: -828 },
  { name: 'Broomfield County Commons Park', x: 1527, z: -1842 },
  { name: 'FlatIron Crossing', x: -5500, z: -1420 },
  { name: 'Northmoor Park', x: 876, z: -2127 },
  { name: 'Paul Derda Recreation Center', x: 2710, z: -1727 },
];

function cachedMap(url, message) {
  let request;
  return () => {
    request ??= fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(message);
        return response.json();
      })
      .catch((error) => {
        request = undefined;
        throw error;
      });
    return request;
  };
}

export const fieldData = cachedMap('/geo/broomfield.json', 'The Broomfield field map could not load.');
export const regionData = cachedMap('/geo/region.json', 'The regional map could not load.');
