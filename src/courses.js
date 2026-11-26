import { TRAVEL } from './field.js';

export const COURSE_TIME = 120;
export const COURSES = [
  {
    stop: 0,
    name: 'Community Park',
    menu: 'First helping',
    dishes: [
      ['corn', -16, -4],
      ['pumpkinPie', -42, -15],
      ['mash', -29, -63],
      ['cookie', -58, 25],
    ],
    gravy: [
      [-8, 8],
      [-36, 10],
    ],
  },
  {
    stop: 1,
    name: 'Brunner Farmhouse',
    menu: 'The leftovers strike back',
    dishes: [
      ['applePie', -16, -4],
      ['beans', 32, 18],
      ['stuffing', -66, -19],
      ['gingerbread', 47, -45],
    ],
    gravy: [
      [9, -11],
      [42, 29],
    ],
  },
  {
    stop: 2,
    name: 'County Commons',
    menu: 'The last supper roll',
    dishes: [
      ['yams', -16, -4],
      ['cupcake', -58, 25],
      ['berries', 47, -45],
      ['cinnamonRoll', 74, 42],
    ],
    gravy: [
      [-8, 8],
      [34, -35],
    ],
  },
];
export function coursePoint(course, dx, dz) {
  const origin = TRAVEL[course.stop];
  return { x: origin.x + dx, z: origin.z + dz };
}

export const MAX_HEALTH = 100;
export const GRAVY_HEAL = 35;
export const SPEED_SECONDS = 20;
export const WIDE_CASTS = 4;
// Guarantee variety in a short course while leaving the reward and most drops to chance.
export function captureBonus(misses, random = Math.random) {
  if (misses < 2 && random() >= 0.5) return null;
  return random() < 0.5 ? 'speed' : 'wide';
}
export const THROWS = {
  roll: {
    name: 'Fossilized dinner roll',
    damage: 15,
    hit: 'That roll dates back to last Thanksgiving.',
  },
  can: {
    name: 'Jiggly cranberry can',
    damage: 18,
    hit: 'You can still see the can lines.',
  },
  sprout: { name: 'Brussels toot', damage: 12, hit: 'Who cut the sprouts?' },
};
export function rollSnow(random = Math.random) {
  return random() < 0.35;
}
