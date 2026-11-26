# Turkey Takeover

A first-person Three.js game set in Broomfield, Colorado. Play as a wild turkey and use a net caster to round up six savory sides and six desserts, including lattice apple pie, a gingerbread runner, and a chocolate chunk cookie before supper.

## Play locally

Use Node.js 22.12+ or a newer supported release.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite in a WebGL 2 browser. The game bundles its geographic data, photography, and fonts. Playing requires no map service account or API key.

To play on a phone or tablet, connect it to the same Wi-Fi as the computer. Run `npm run build` followed by `npm run play:lan` on the computer, then open the printed **Network** URL on the device. The controls adapt when you rotate the screen.

- **Start hunt** opens a five-minute course around Community Park and the civic center. Orange diamonds on the map show the remaining dishes. Move within 35 meters, aim until the reticle turns amber, and cast.
- **Hunt map → Greater Broomfield → Citywide hunt** places one side and one dessert at each of six landmarks. Open the map during play to travel between them.
- **Explore freely** opens the full regional map without a timer. Walk between neighborhoods or use a landmark travel stop.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | W/A/S/D | Left stick |
| Aim | Mouse, or drag when the pointer is unlocked | Drag the world |
| Cast net | Left click or F | Tap Cast, or drag from Cast to aim and release to throw |
| Sprint | Hold Shift while moving | Full stick |
| Jump / flap | Space | Feather button |
| Find next dish | H or compass | Compass |
| Map | M or minimap | Minimap |
| Pause | Escape or P | Pause button |

The arrow keys also move forward/back and turn. Q and E tilt the view. Pausing or switching away from the page stops the supper clock. After seven seconds without a nearby dish in sight, the compass arrow points to the nearest remaining dish. Ground arrows trace a walkable route around obstacles. For distant city targets, the hint names the landmark and the map preselects the stop. Times for the twelve-dish course are saved separately from six-dish records.

## Map and photography

The detailed park map spans 1.36 × 1.36 km. The regional map spans 19.2 × 19.2 km around Broomfield, including surrounding communities. Building footprints, streets, paths, trees, and landmarks come from city GIS. USGS/USDA aerial photography covers the ground and rooftops. Regional terrain uses USGS elevation samples at 150-meter intervals. Buildings use estimated heights and representative photographed façades. The central park course has level ground for play.

The title and sky composites include a photograph of the Flatirons taken from Broomfield. Photography credits, licenses, source links, and modifications are available through **Map & photo credits** in the game and in the [map sources](public/geo/sources.json), [cover and wing credits](public/cover/credits.json), and [scenery credits](public/scenery/sources.json).

## Build

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/`. The included Python scripts regenerate the bundled geography when refreshed source data is needed. The regional exporter requires Pillow.
