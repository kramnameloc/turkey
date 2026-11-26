import { BODY_RADIUS, TURKEY_HEIGHT } from './turkey-scale.js';

export function overlapsBody(actor, x, z, feet, radius = BODY_RADIUS) {
  const p = actor.model.position;
  if (
    actor.caught ||
    (feet != null &&
      (feet >= p.y + actor.height || feet + TURKEY_HEIGHT <= p.y))
  )
    return false;
  return (p.x - x) ** 2 + (p.z - z) ** 2 < (radius + actor.radius) ** 2;
}

// Moving characters can reach a stationary player, or step under a landing.
export function separateFromActors(player, feet, actors, blocked) {
  for (const actor of actors) {
    if (!overlapsBody(actor, player.x, player.z, feet)) continue;
    const p = actor.model.position;
    const radius = actor.radius + BODY_RADIUS + 0.002;
    const angle = Math.atan2(player.x - p.x, player.z - p.z);
    for (const offset of [0, 0.4, -0.4, 0.9, -0.9, 1.6, -1.6, Math.PI]) {
      const x = p.x + Math.sin(angle + offset) * radius;
      const z = p.z + Math.cos(angle + offset) * radius;
      if (blocked(x, z)) continue;
      player.x = x;
      player.z = z;
      break;
    }
  }
}
