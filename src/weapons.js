export const CORNUCOPIA = {
  id: 'cornucopia', name: 'Cornucopia of Plenty', damage: 100, range: 42,
  cooldown: 2.4, shot: 'harvest', heal: 12,
};

// The cornucopia is found in the world. Only the other tools use capture milestones.
export const WEAPONS = [
  { id: 'net', name: 'Harvest Net', captures: 0, damage: 24, range: 35, cooldown: 0.58 },
  { id: 'popper', name: 'Cranberry Popper', captures: 2, damage: 18, range: 46, cooldown: 0.28, shot: 'berry' },
  { id: 'sling', name: 'Buttered Roll Sling', captures: 5, damage: 56, range: 24, cooldown: 0.95, shot: 'roll' },
  CORNUCOPIA,
];

export function dealDamage(target, damage) {
  const dealt = Math.min(target.health, damage);
  target.health -= dealt;
  return dealt;
}
