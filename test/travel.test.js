import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, PerspectiveCamera, Scene } from 'three';
import { DOVER } from '../src/world/dover/location.js';
import { FoodFight } from '../src/gameplay/foodfight.js';
import { Hunt } from '../src/game.js';
import { TURKEY_EYE } from '../src/player/turkey-scale.js';

function insideCottage() {
  const hunt = Object.assign(Object.create(Hunt.prototype), {
    mode: 'city',
    elapsed: 55,
    yaw: 0.25,
    pitch: -0.15,
    camera: new PerspectiveCamera(),
    avatar: new Group(),
    scene: new Scene(),
    house: { inside: true, porch: new Group(), scene: new Scene() },
    world: { solids: { occupied: () => false } },
    region: {
      height: () => 17,
      blocked: () => false,
      prepareAt() {},
      update() {},
    },
    maps: { blocked: () => false, prepare() {} },
    guide: { reset() {} },
    updateViewControls() {},
    syncView() {},
  });
  hunt.regionRequest = Promise.resolve(hunt.region);
  hunt.fight = new FoodFight(hunt);
  hunt.camera.position.set(1, 2, 3);
  hunt.house.scene.add(hunt.camera, hunt.avatar);
  hunt.stockGravy({ x: 5, z: 5 });
  return hunt;
}

test('a failed city landing or restock leaves the player, supplies and guide at the previous stop', async (t) => {
  const hunt = insideCottage();
  t.after(() => hunt.fight.dispose());
  const previous = hunt.gravyStop;
  const pickups = hunt.fight.pickups;
  const reset = t.mock.method(hunt.guide, 'reset');
  hunt.region.blocked = () => true;
  await assert.rejects(hunt.teleport(DOVER), /No open landing/);
  hunt.region.blocked = () => false;
  const open = hunt.openSpot.bind(hunt);
  t.mock.method(hunt, 'openSpot', (point) => {
    if (point.x === DOVER.x + 9)
      throw new Error('No room for the second pickup');
    return open(point);
  });
  await assert.rejects(hunt.teleport(DOVER), /second pickup/);
  assert.deepEqual(hunt.camera.position.toArray(), [1, 2, 3]);
  assert.equal(hunt.camera.parent, hunt.house.scene);
  assert.equal(hunt.house.inside, true);
  assert.deepEqual([hunt.yaw, hunt.pitch], [0.25, -0.15]);
  assert.equal(hunt.gravyStop, previous);
  assert.equal(hunt.fight.pickups, pickups);
  assert.ok(pickups.every(({ obj }) => obj.parent === hunt.fight.group));
  assert.equal(reset.mock.callCount(), 0);
});

test('travel from the cottage uses outdoor collision and heights for the arrival and pickups', async (t) => {
  const hunt = insideCottage();
  t.after(() => hunt.fight.dispose());
  const stop = { x: 50, z: 40 };
  const reset = t.mock.method(hunt.guide, 'reset');
  hunt.region.blocked = (x, z) => x === stop.x && z === stop.z;
  await hunt.teleport(stop);
  assert.equal(hunt.house.inside, false);
  assert.equal(hunt.camera.parent, hunt.scene);
  assert.deepEqual(hunt.camera.position.toArray(), [53, 17 + TURKEY_EYE, 40]);
  assert.deepEqual(
    hunt.fight.pickups.map(({ obj }) => obj.position.y),
    [17, 17]
  );
  assert.equal(hunt.gravyStop, stop);
  assert.deepEqual(reset.mock.calls[0].arguments, [55]);
});
