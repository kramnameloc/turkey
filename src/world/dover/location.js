import { playerStorage } from '../../player/storage.js';

// Fast travel faces the game cottage from the street. Its interaction point
// and Hall of Gravy are authored for the hunt.
export const DOVER = { name: '735 Dover St', x: 1159, z: -985.1 };
export const PORCH = { x: 1144.15, z: -986.5 };
// Cottage facade coordinates: positive "across" points north and "out" east.
export const PORCH_LANTERN = { across: 1.91, up: 2.11, out: 0.18 };
export const RELIC = 'Golden Gravy Grail';
export const { has: hasGrail, collect: collectGrail } = playerStorage.grail;
export const { has: hasRecipe, collect: collectRecipe } = playerStorage.recipe;
