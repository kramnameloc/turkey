// Run after building or with --live after a Pages deployment.
import assert from 'node:assert/strict';
import { readFile, appendFile } from 'node:fs/promises';

const canonical = 'https://turkey.kramnameloc.com/';
const live = process.argv.includes('--live');
async function asset(path, type) {
  if (!live)
    return readFile(
      new URL(
        '../dist/' + (path === '/' ? 'index.html' : path.slice(1)),
        import.meta.url
      )
    );
  const response = await fetch(new URL(path, canonical), {
    signal: AbortSignal.timeout(15000),
  });
  if (path === '/' && response.status === 403) {
    console.error(
      'The public homepage refused this client (HTTP 403, server ' +
        (response.headers.get('server') || 'unknown') +
        ').'
    );
    process.exit(77);
  }
  assert.ok(response.ok, path + ' returned ' + response.status);
  assert.match(response.headers.get('content-type') || '', type, path);
  return Buffer.from(await response.arrayBuffer());
}

function attribute(tags, name, value, key) {
  const tag = tags.find((tag) => tag.includes(name + '="' + value + '"'));
  assert.ok(tag, name + '=' + value + ' must be in the initial HTML');
  return tag.match(new RegExp('\\s' + key + '="([^"]+)"'))?.[1];
}

const html = (await asset('/', /text\/html/)).toString();
const tags = html.match(/<(?:meta|link|script)\b[^>]*>/gi) || [];
assert.equal(attribute(tags, 'rel', 'canonical', 'href'), canonical);
assert.equal(attribute(tags, 'property', 'og:url', 'content'), canonical);
assert.ok(
  attribute(tags, 'property', 'og:title', 'content')?.includes(
    'Turkey Takeover'
  )
);
assert.ok(attribute(tags, 'property', 'og:description', 'content'));
const card = attribute(tags, 'property', 'og:image', 'content');
assert.equal(card, canonical + 'social/turkey-takeover-card.jpg');
assert.equal(attribute(tags, 'name', 'twitter:image', 'content'), card);
assert.equal(
  attribute(tags, 'name', 'twitter:card', 'content'),
  'summary_large_image'
);
assert.equal(attribute(tags, 'property', 'og:image:width', 'content'), '1200');
assert.equal(attribute(tags, 'property', 'og:image:height', 'content'), '630');
assert.ok(attribute(tags, 'property', 'og:image:alt', 'content'));
const icon = new URL(
  attribute(tags, 'rel', 'apple-touch-icon', 'href'),
  canonical
);
assert.equal(icon.origin, new URL(canonical).origin);
const entry = attribute(tags, 'type', 'module', 'src');
assert.match(entry || '', /^\/assets\/[\w-]+\.js$/);
if (process.env.EXPECTED_ENTRY)
  assert.equal(
    entry,
    process.env.EXPECTED_ENTRY,
    'Waiting for the new release'
  );
const css = attribute(tags, 'rel', 'stylesheet', 'href');
const [js, sheet, photo, badge, geo, dish] = await Promise.all([
  asset(entry, /javascript/),
  asset(css, /text\/css/),
  asset(new URL(card).pathname, /image\/jpeg/),
  asset(icon.pathname, /image\/png/),
  asset('/geo/region.json', /json/),
  asset('/dishes/pumpkinPie.webp', /image\/webp/),
]);
assert.ok(js.length && sheet.length && JSON.parse(geo).tiles.length);
assert.equal(photo.readUInt16BE(0), 0xffd8);
assert.ok(photo.length < 1_000_000, 'Keep the social JPEG lightweight');
assert.equal(badge.toString('ascii', 1, 4), 'PNG');
assert.equal(badge.readUInt32BE(16), 180);
assert.equal(badge.readUInt32BE(20), 180);
assert.equal(dish.toString('ascii', 8, 12), 'WEBP');
const [maps, mountains, dem, turkey, oaks, grasses, grassCover, rangeMesh] =
  await Promise.all([
    asset('/geo/courses/maps.json', /json/),
    asset('/scenery/front-range.webp', /image\/webp/),
    asset('/geo/park-elevation.json', /json/),
    asset(
      '/models/bourbon-red.glb',
      /model\/gltf-binary|application\/octet-stream/
    ),
    asset(
      '/models/november-oaks.glb',
      /model\/gltf-binary|application\/octet-stream/
    ),
    asset(
      '/models/field-grasses.glb',
      /model\/gltf-binary|application\/octet-stream/
    ),
    asset('/scenery/grass-cover.png', /image\/png/),
    asset('/scenery/front-range.mesh', /application\/octet-stream|model\/mesh/),
  ]);
await Promise.all(
  ['asphalt', 'concrete', 'ironwork', 'houses'].map(async (name) => {
    const material = await asset(
      '/scenery/street-' + name + '.webp',
      /image\/webp/
    );
    assert.equal(material.toString('ascii', 8, 12), 'WEBP', name);
  })
);
assert.equal(grasses.toString('ascii', 0, 4), 'glTF');
assert.equal(grasses.readUInt32LE(8), grasses.length);
const grassPack = JSON.parse(
  grasses.toString('utf8', 20, 20 + grasses.readUInt32LE(12))
);
assert.deepEqual(
  grassPack.nodes.map((n) => n.name),
  ['Lawn', 'Dry', 'Reeds']
);
assert.equal(grassCover.toString('ascii', 1, 4), 'PNG');
assert.equal(
  rangeMesh.length,
  8 + 6 * rangeMesh.readUInt32LE(0) + 2 * rangeMesh.readUInt32LE(4)
);
assert.equal(oaks.toString('ascii', 0, 4), 'glTF');
assert.equal(oaks.readUInt32LE(8), oaks.length);
// This model is required before a hunt starts. Check that the release contains
// the rig, both player views, the texture, and every action the mixer expects.
assert.equal(turkey.toString('ascii', 0, 4), 'glTF');
assert.equal(turkey.readUInt32LE(8), turkey.length);
const gltf = JSON.parse(
  turkey.toString('utf8', 20, 20 + turkey.readUInt32LE(12))
);
assert.ok(gltf.skins[0].joints.length);
assert.ok(gltf.nodes.some((n) => n.name === 'FirstPersonWing'));
assert.deepEqual(gltf.animations.map((a) => a.name).sort(), [
  'Attack',
  'Jump',
  'Run',
  'Stand',
  'Walk',
]);
const baseColor = gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index;
assert.ok(
  Number.isInteger(gltf.images[gltf.textures[baseColor].source].bufferView)
);
const sites = JSON.parse(maps);
assert.equal(sites.length, 6);
for (const site of sites)
  assert.ok(site.paths.length, site.id + ' needs mapped trails');
assert.equal(mountains.toString('ascii', 8, 12), 'WEBP');
assert.ok(JSON.parse(dem).values.length);
await Promise.all(
  sites.map(async (site) => {
    const aerial = await asset(
      '/geo/courses/' + site.id + '.jpg',
      /image\/jpeg/
    );
    assert.equal(aerial.readUInt16BE(0), 0xffd8, site.id);
  })
);
if (!live && process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, 'entry=' + entry + '\n');
console.log(
  (live ? canonical : 'dist/') +
    ' serves the game bundle, map data and branded share artwork.'
);
