import { DOVER } from './dover-location.js';

export const COURSE_TIME = 120;
export const COURSES = [
  {
    venue: 'airport',
    name: 'Denver airport to Dover',
    menu: 'Arrive at Jeppesen Terminal. Catch the dishes, board the shuttle and reach 735 Dover St after dark.',
    spawn: { x: 0, z: 21 },
    yaw: 0.64,
    pitch: 0.09,
    hunts: [
      {
        name: 'Terminal West',
        dishes: [
          ['corn', -5, -11],
          ['cookie', -9, -19],
        ],
      },
      {
        name: 'Ground transportation',
        dishes: [
          ['mash', 2, -20],
          ['cupcake', -7, -27],
        ],
      },
      {
        name: 'Shuttle island',
        dishes: [
          ['yams', 7, -38],
          ['cinnamonRoll', -2, -45],
        ],
      },
    ],
    gravy: [
      [-5, -4],
      [3, -25],
    ],
    destination: {
      name: 'Dover shuttle',
      x: 7.6,
      z: -19,
      prompt: 'Ride to 735 Dover St',
    },
  },
  {
    name: 'Around 735 Dover St',
    menu: 'Search the driveways and the turning circle on Dover Street.',
    spawn: DOVER,
    hunts: [
      {
        name: 'Dover driveways',
        dishes: [
          ['beans', -5, -7],
          ['applePie', -4, 8],
        ],
      },
      {
        name: 'North sidewalk',
        dishes: [
          ['stuffing', 1, -32],
          ['gingerbread', 3, -57],
        ],
      },
      {
        name: 'Turning circle',
        dishes: [
          ['berries', 3, 48],
          ['pumpkinPie', 5, 68],
        ],
      },
    ],
    gravy: [
      [0, -10],
      [1, 41],
    ],
  },
  {
    name: 'Thanksgiving on Dover',
    menu: 'Catch Thanksgiving dinner while the balloon crews march past 735 Dover St.',
    spawn: { x: 1148, z: -984 },
    yaw: -0.91,
    pitch: 0.23,
    parade: true,
    hunts: [
      {
        name: 'Thanksgiving curbside',
        dishes: [
          ['mash', 8, -37],
          ['pumpkinPie', 12, -10],
        ],
      },
      {
        name: 'East 7th Avenue Circle',
        dishes: [
          ['corn', 35, 17],
          ['applePie', 80, 17],
        ],
      },
      {
        name: 'Parade bend',
        dishes: [
          ['beans', 135, 0],
          ['cookie', 137, -47],
        ],
      },
    ],
    gravy: [
      [8, -9],
      [8, 15],
    ],
  },
  {
    venue: 'ice',
    name: 'Black Friday at Gaylord Rockies',
    menu: 'Hunt inside ICE! featuring The Nightmare Before Christmas, from Halloween Town to Christmas Town.',
    spawn: { x: 0, z: 22 },
    hunts: [
      {
        name: 'Halloween Town',
        dishes: [
          ['yams', -6, -15],
          ['gingerbread', 7, -7],
        ],
      },
      {
        name: 'Spiral Hill',
        dishes: [
          ['beans', -6, -27],
          ['cinnamonRoll', 5, -24],
        ],
      },
      {
        name: 'Christmas Town',
        dishes: [
          ['berries', -5, -39],
          ['cupcake', 6, -38],
        ],
      },
    ],
    gravy: [
      [5, -5],
      [-2, -30],
    ],
  },
  {
    venue: 'springs',
    name: 'Indian Hot Springs',
    menu: 'Follow the steam through the mineral pool gardens in Idaho Springs.',
    spawn: { x: 2, z: 2 },
    yaw: 0.16,
    pitch: -0.075,
    hunts: [
      {
        name: 'Mineral pool',
        dishes: [
          ['stuffing', -11, -5],
          ['cinnamonRoll', 6, -17],
        ],
      },
      {
        name: 'Palm garden',
        dishes: [
          ['yams', 5, 4],
          ['pumpkinPie', -12, 6],
        ],
      },
      {
        name: 'Lodge walk',
        dishes: [
          ['corn', -16, 16],
          ['gingerbread', -1, 21],
        ],
      },
    ],
    gravy: [
      [3, 16],
      [-10, -12],
    ],
  },
  {
    venue: 'pearl',
    name: 'Pearl Street & the teahouse',
    menu: 'Hunt the Pearl Street shops and courthouse lawn. Follow 13th Street south to the rose garden and meet for tea beside the fountain.',
    spawn: { x: -37, z: 0 },
    yaw: -Math.PI / 2,
    hunts: [
      {
        name: 'Pearl Street shops',
        dishes: [
          ['berries', 11, 1],
          ['cookie', 22, -2],
        ],
      },
      {
        name: 'Courthouse lawn',
        dishes: [
          ['mash', 54, -9],
          ['applePie', 67, -13],
        ],
      },
      {
        name: 'Rose garden',
        dishes: [
          ['stuffing', 46, 46.5],
          ['cupcake', 52, 59.7],
        ],
      },
    ],
    gravy: [
      [7, -2],
      [42, 35],
    ],
    destination: {
      name: 'Dushanbe Teahouse',
      x: 32,
      z: 51.6,
      prompt: 'Sit down for tea',
    },
  },
];
export const TRIP_HUNTS = COURSES.flatMap((day) => day.hunts);
export const TRIP_CAPTURES = TRIP_HUNTS.reduce(
  (total, hunt) => total + hunt.dishes.length,
  0
);

export function coursePoint(course, dx, dz) {
  return { x: course.spawn.x + dx, z: course.spawn.z + dz };
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
