// Run after building or with --live after a Pages deployment.
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { canonical, fetchLiveAsset, readBuiltAsset } from './release-assets.mjs';

const dist = new URL('../dist/', import.meta.url);
const live = process.argv.includes('--live');
async function asset(path, type) {
  if (!live) return readBuiltAsset(dist, path);
  const response = await fetchLiveAsset(path);
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
const tags = html.match(/<(?:meta|link|script|img|source)\b[^>]*>/gi) || [];
const expectedRevision = process.env.EXPECTED_REVISION || process.env.GITHUB_SHA;
if (expectedRevision) {
  assert.equal(
    attribute(tags, 'name', 'release-revision', 'content'),
    expectedRevision,
    'The homepage must serve the expected commit'
  );
}
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
const cardPath = new URL(card).pathname;
assert.equal(attribute(tags, 'class', 'cover-art', 'src'), cardPath);
assert.equal(attribute(tags, 'class', 'share-preview', 'src'), cardPath);
assert.equal(
  attribute(tags, 'name', 'twitter:card', 'content'),
  'summary_large_image'
);
assert.equal(attribute(tags, 'property', 'og:image:width', 'content'), '1200');
assert.equal(attribute(tags, 'property', 'og:image:height', 'content'), '630');
assert.ok(attribute(tags, 'property', 'og:image:alt', 'content'));
const touchIcon = new URL(
  attribute(tags, 'rel', 'apple-touch-icon', 'href'),
  canonical
);
const iconLinks = tags.filter((tag) => /^<link\s[^>]*\brel="icon"/i.test(tag));
const favicon = new URL(
  attribute(iconLinks, 'sizes', '32x32', 'href'),
  canonical
);
assert.equal(attribute(iconLinks, 'sizes', '32x32', 'type'), 'image/png');
assert.equal(touchIcon.origin, new URL(canonical).origin);
assert.equal(favicon.origin, new URL(canonical).origin);
const entry = attribute(tags, 'type', 'module', 'src');
assert.match(entry || '', /^\/assets\/[\w-]+\.js$/);
if (process.env.EXPECTED_ENTRY)
  assert.equal(
    entry,
    process.env.EXPECTED_ENTRY,
    'Waiting for the new release'
  );
const css = attribute(tags, 'rel', 'stylesheet', 'href');
assert.match(css || '', /^\/assets\/[\w-]+\.css$/);
const manifest = JSON.parse(await asset('/asset-manifest.json', /json/));
const lobby = manifest['index.html'];
assert.equal(
  lobby?.file, entry.slice(1), 'The manifest must match the homepage script'
);
assert.ok(
  lobby.css?.includes(css.slice(1)),
  'The manifest must include the homepage stylesheet'
);
const bundles = new Set();
for (const chunk of Object.values(manifest)) {
  if (/\.(js|css)$/.test(chunk.file)) bundles.add(chunk.file);
  for (const stylesheet of chunk.css ?? []) bundles.add(stylesheet);
}
await Promise.all(
  [...bundles].map(async (file) => {
    const type = file.endsWith('.css') ? /text\/css/ : /javascript/;
    const bytes = await asset('/' + file, type);
    assert.ok(bytes.length, file + ' is empty');
  })
);
const [photo, badge, geo, dish, faviconImage] = await Promise.all([
  asset(cardPath, /image\/jpeg/),
  asset(touchIcon.pathname, /image\/png/),
  asset('/geo/region.json', /json/),
  asset('/dishes/pumpkinPie.webp', /image\/webp/),
  asset(favicon.pathname, /image\/png/),
]);
assert.ok(JSON.parse(geo).tiles.length);
assert.equal(photo.readUInt16BE(0), 0xffd8);
assert.ok(photo.length < 1_000_000, 'Keep the social JPEG lightweight');
const posters = attribute(tags, 'type', 'image/avif', 'srcset')
  .split(',').map((candidate) => candidate.trim().split(/\s+/));
assert.deepEqual(posters.map(([, width]) => width), ['720w', '1200w']);
await Promise.all(posters.map(async ([path]) => {
  const bytes = await asset(path, /image\/avif/);
  assert.equal(bytes.toString('ascii', 4, 12), 'ftypavif', path);
  assert.ok(bytes.length < photo.length, path + ' must be smaller than the fallback');
}));
for (const [iconImage, size] of [[badge, 180], [faviconImage, 32]]) {
  assert.equal(iconImage.toString('ascii', 1, 4), 'PNG');
  assert.equal(iconImage.readUInt32BE(16), size);
  assert.equal(iconImage.readUInt32BE(20), size);
}
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
for (const name of ['sedan', 'suv', 'exteriors']) {
  const model = await asset(
    '/models/dover-' + name + '.glb',
    /model\/gltf-binary|application\/octet-stream/
  );
  assert.equal(model.toString('ascii', 0, 4), 'glTF', name);
  assert.equal(model.readUInt32LE(8), model.length, name);
}
for (const venue of ['airport', 'ice', 'springs', 'pearl']) {
  const model = await asset(
    '/models/trip-' + venue + '.glb',
    /model\/gltf-binary|application\/octet-stream/
  );
  assert.equal(model.toString('ascii', 0, 4), 'glTF', venue);
  assert.equal(model.readUInt32LE(8), model.length, venue);
}
const landmarkPack = await asset(
  '/models/broomfield-landmarks.glb',
  /model\/gltf-binary|application\/octet-stream/
);
assert.equal(landmarkPack.toString('ascii', 0, 4), 'glTF');
assert.equal(landmarkPack.readUInt32LE(8), landmarkPack.length);
for (const name of [
  'dover-asphalt',
  'dover-houses',
  'dover-leaves',
  'dover-spray',
  'dover-hedge',
  'dover-lawn',
]) {
  const tile = await asset('/scenery/' + name + '.webp', /image\/webp/);
  assert.equal(tile.toString('ascii', 8, 12), 'WEBP', name);
}
const gravel = await asset('/scenery/trail-gravel.webp', /image\/webp/);
assert.equal(gravel.toString('ascii', 8, 12), 'WEBP');
const balloons = await asset(
  '/models/parade-balloons.glb',
  /model\/gltf-binary|application\/octet-stream/
);
assert.equal(balloons.readUInt32LE(8), balloons.length);
const paradePack = JSON.parse(
  balloons.toString('utf8', 20, 20 + balloons.readUInt32LE(12))
);
const lineup = paradePack.nodes.toSorted(
  (a, b) => a.extras.paradeOrder - b.extras.paradeOrder
);
assert.deepEqual(
  lineup.map((node) => node.name),
  [
    'Jett',
    'Elf',
    'Thomas',
    'Chase',
    'Goku',
    'CharlieBrown',
    'Scrat',
    'Sonic',
    'SnoopyWoodstock',
    'JimmyNeutron',
    'SkatingRonald',
    'Paddington',
    'SpiderMan',
    'Doughboy',
    'Eruptor',
    'GregHeffley',
    'SonicModern',
    'FinnJake',
    'RedRanger',
    'Pikachu',
    'RonaldMcDonald',
    'SuperGrover',
  ]
);
for (const [i, node] of lineup.entries()) {
  assert.equal(node.extras.paradeOrder, i);
  assert.ok(node.extras.paradeLabel, node.name);
  const [primitive] = paradePack.meshes[node.mesh].primitives;
  const { baseColorTexture } =
    paradePack.materials[primitive.material].pbrMetallicRoughness;
  const image =
    paradePack.textures[baseColorTexture.index].extensions.EXT_texture_webp
      .source;
  assert.equal(paradePack.images[image].mimeType, 'image/webp', node.name);
}
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
