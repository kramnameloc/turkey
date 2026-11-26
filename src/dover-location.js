// The city address point falls inside the mapped footprint. The game entrance
// is placed on an arbitrary face of that polygon. All room geometry is invented.
export const DOVER = { name: '735 Dover St', x: 1154, z: -986.5 };
export const PORCH = { x: 1144.15, z: -986.5 };
export const RELIC = 'Golden Gravy Grail';
const key = 'gobbler-dover-grail-v1';
let collected = false;
export function hasGrail() {
  try {
    return collected || localStorage.getItem(key) === 'found';
  } catch {
    return collected;
  }
}
export function collectGrail() {
  collected = true;
  try {
    localStorage.setItem(key, 'found');
  } catch {}
}
