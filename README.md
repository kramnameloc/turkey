# Turkey Takeover

Play at [turkey.kramnameloc.com](https://turkey.kramnameloc.com/). A Three.js turkey hunt with first-person and over-the-shoulder cameras, set in Broomfield, Colorado. Play as a Bourbon Red turkey and use a net caster to round up six savory sides and six desserts, including lattice apple pie, a gingerbread runner, and a chocolate chunk cookie before supper.

## Play locally

Use Node.js 22.12+ or a newer supported release.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite in a WebGL 2 browser. The game bundles its geographic data, photography, and fonts. Playing requires no map service account or API key.

To play on a phone or tablet, connect it to the same Wi-Fi as the computer. Run `npm run build` followed by `npm run play:lan` on the computer, then open the printed **Network** URL on the device. The controls adapt when you rotate the screen.

- **Start hunt** opens a three-course campaign. Capture four dishes in two minutes at Community Park, then play Brunner Farmhouse and County Commons. Health and bonuses carry between courses. After the fourth capture at County Commons, the supper clock stops. Follow the gold trail to 735 Dover St or use **Travel to Dover St** on the course map. Enter the game’s cottage and inspect the pedestal to finish the campaign. The collectible stays in your field guide on this browser. If you run out of health or time, retry the current course from its starting checkpoint.
- **Hunt timer** in the lobby or pause menu turns the countdown on or off. With it off you can finish every hunt and campaign course at your own pace. Turning it back on resumes the remaining time. The browser remembers your choice. Personal bests are recorded for runs played with the timer on.
- **Watch parade** starts an untimed curbside visit. Four turkey handlers guide each of the 22 balloons around Main Street, 1st Avenue, and Community Park Road. Look for Snoopy carrying Woodstock, Finn riding Jake, Spider-Man, Pikachu, two Sonic designs, and a skating Ronald McDonald. The same procession runs during hunts and free roam near Community Park. Spectators and marching turkeys block your path. A net hit makes that participant chase you. They can tag you for damage. A second net catches the pursuer. Hitting a handler releases its balloon, and the rest of that crew keeps marching. The star on the park map marks the lead crew. In parade mode, choose any balloon on the map and select **Rejoin the parade** for a curbside view as it approaches.
- **Hunt map → Park time trial** keeps the original twelve-dish, five-minute park challenge. Orange diamonds mark dishes. Get within 35 meters, aim until the reticle turns amber, and cast.
- **Hunt map → Greater Broomfield → Citywide hunt** places one side and one dessert at each of six landmarks. Open the map during play to travel between them.
- **Explore freely** opens the full regional map without a timer. Walk between neighborhoods or use a landmark travel stop.

## Food fights

Tap jump to hop over shorter enemies. Hold it for a short burst of flight and a slow glide. Releasing jump brings you down faster.

Dishes wind up and throw fossilized dinner rolls, jiggly cranberry cans, or gassy Brussels sprouts. Their throws aim at where you stood during the windup. Sidestep, flap over the food, or take cover. Walk into a mint-marked **Emergency Gravy Boat** to restore up to 35 health. A full-health turkey leaves the gravy for later.

Each capture has a 50% chance of a bonus. A third capture following two misses guarantees one. **Buttered boots** boost walking and sprint speed by 65% for 20 seconds. The **wishbone slinger** gives four faster, wider casts with a 52-meter reach. Both equip automatically and work with the regular controls.

The November forecast rolls a 35% chance of flurries at each course start and on periodic weather changes during play. Reduced-motion settings thin and slow the snowfall.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | W/A/S/D | Left stick |
| Aim | Mouse, or drag when the pointer is unlocked | Drag the world |
| Cast net | Left click or F | Tap Cast, or drag from Cast to aim and release to throw |
| Sprint | Hold Shift while moving | Full stick |
| Jump / glide | Tap / hold Space | Tap / hold Flap |
| Find next dish | H or compass | Compass |
| Switch first person / chase camera | V | Camera button below or beside the minimap |
| Enter, leave or inspect a display | G at a prompt | Tap the prompt |
| Map | M or minimap | Minimap |
| Pause | Escape or P | Pause button |

The arrow keys also move forward/back and turn. Q and E tilt the view. Pausing or switching away from the page stops the supper clock. After seven seconds without a nearby dish in sight, the compass arrow points to the nearest remaining dish. Ground arrows trace a walkable route around obstacles. For distant city targets, the hint names the landmark and the map preselects the stop. Each food-fight mode has its own personal best. The campaign record counts play time across its three completed courses.

## Map and photography

The detailed park map spans 1.36 × 1.36 km. The regional map spans 19.2 × 19.2 km around Broomfield, including surrounding communities. Building footprints, streets, paths, trees, and landmarks come from city GIS. Colorado DRAPP and USGS/USDA aerial photography cover the ground and rooftops. USGS elevation sampled on a 10-meter grid covers Community Park, Brunner Farmhouse, County Commons and the Dover area, transitioning to 150-meter regional coverage. Roof and tree heights use 2020 USGS lidar where supported. Other buildings and trees use estimates. Six neighborhood maps combine detailed aerial imagery, surveyed trails, streets, named amenities, building footprints and tree locations. The same aerials and trails appear underfoot. The portable soccer goals represent the Commons Blue Pod playing fields. The Dover cottage has an original game interior.

At Community Park, the Library and Auditorium has its photographed brick entrance, park-facing gable and glazed lobby. Its roof and the roofs of the City and County Building, Municipal Court, U.S. Post Office and North Metro Fire Rescue Headquarters follow the 2020 lidar returns inside their city footprints. Brunner Farmhouse has yellow lap siding, two brick chimneys, a garden-facing dormer and a white wraparound porch. Players can walk under the garden pergola beside the house. The window arrangements and porch dimensions are approximate. Footprint-based neighborhood roofs that fit inside a detailed course aerial use the same photograph as the ground. [Landmark photographs and credits](public/scenery/sources.json)

On Dover, the two sidewalk runs meet East 9th Avenue, wrap around the East 7th Avenue Circle openings and follow the southern turning circle to the greenbelt. Four [Dover Street View panoramas](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=39.92748,-105.05521&heading=0) informed the house finishes, blue street blades and low rail fence. The 3072-pixel Dover course aerial, traced pavement edges and asphalt texture come from the 2020 [State of Colorado Imagery](https://registry.opendata.aws/colorado-imagery/). Thirty-two crown locations use aerial estimates and lidar heights. Fifteen houses display roof meshes sampled from the same lidar within city building outlines. Two custom models at 735 Dover and next door use the city footprints and the supplied July 2026 street view for their front elevations. The folded camper, paired mailboxes, clipped hedge and leafed-out shade trees approximate that view. Fast travel faces the twin garage from the road. Parked sedans and SUVs use [Kenney’s Car Kit](https://kenney.nl/assets/car-kit). Run `python3 scripts/geo_dover.py` with Rasterio, NumPy and Pillow to refresh the aerial, and `python3 scripts/dover_material.py` to rebuild its street and house textures. The regional geometry and height exporters rebuild the block’s mapped features and roof meshes. With the original oak GLB in `download-models/`, run `python3 scripts/export_dover_exteriors.py` to regenerate the two exteriors and yard textures.

On mapped soft-surface trails, a compacted gravel scan by Rob Tuytel repeats at its photographed three-meter scale. Its color comes from the park and neighborhood aerials. To rebuild it, pass the 1K *Gravel Ground 01* diffuse JPEG to `python3 scripts/export_street.py --gravel`. Street surfaces and residential masonry use material artwork from *Street* by Pasha. Crosswalks follow the mapped pedestrian routes, and lane paint uses the city’s road class and one-way records. Street names come from the intersecting roads. At Main and First, four signal masts cycle through the crossing. Nearby detached homes use street-facing ranch models fitted to compatible surveyed footprints. The low brick homes on Main Street and the signal layout were informed by [Broomfield Street View](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=39.91645,-105.07167&heading=175). House fronts and individual furniture placements are illustrative.

Slatted benches, bins, path lights, hydrants and shrubs furnish Community Park and the detailed regional neighborhoods. Six posed spectators join the waving families at the parade. Model authors and adaptations are listed in [the scenery credits](public/scenery/sources.json). To rebuild the street model library, put the five credited source downloads in `download-models/streetscape/` and run `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export_streetscape.py`. The exporter reads the original pixelsquare ZIP with `bsdtar` and the other four sources as Sketchfab GLBs.

Broadleaf trees use eleven oak forms by LOLIPOP, with early autumn, late autumn and bare crowns. Each mapped trunk uses its lidar or inventory height. A location seed varies the model, crown spread and rotation, and places occasional young oaks near mature park oaks. Conifers use the spruce model.

The standing turkey measures 0.90 m from its feet to its fanned tail. The first-person camera sits at the model’s eyes, 0.67 m above the ground. Branch clearance uses the bird’s standing height.

Grass by Georgeous supplies three clumps for mown lawns, dormant meadow grass, and seed heads on mapped pond banks. Aerial vegetation and city footprints guide their placement. The western mountain skyline blends the relief and snow from *Snowy Mountain* by James Lucas (CC BY-NC 4.0) onto the high flanks of the USGS Front Range terrain. See the [Front Range sources](public/scenery/peaks-credits.json). The title and sky composites include a photograph of the Flatirons taken from Broomfield. Photography credits, licenses, source links, and modifications are available through **Map & photo credits** in the game and in the [map sources](public/geo/sources.json), [cover photography credits](public/cover/credits.json), and [scenery credits](public/scenery/sources.json).

## Build

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/`. The player model and its embedded color map are bundled in `public/models/bourbon-red.glb`. To regenerate them from the supplied FBX and PNG in `download-models/A_Turkey_BourbonRed/`, run `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export_turkey.py`. To rebuild the oak library and its crown measurements from the supplied GLB in `download-models/`, run `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export_oaks.py`. To rebuild the street textures from the supplied `download-models/street.glb`, run `python3 scripts/export_street.py` with Pillow and NumPy installed. With the same Python dependencies, run `python3 scripts/export_landscape.py` to rebuild the grass model and placement atlas and `python3 scripts/geo_peaks.py --cache /tmp/peaks-cache` to rebuild the mountain mesh and snow artwork. To rebuild the balloon pack from the supplied GLBs in `download-models/` and `download-models/ballons/`, run `blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export_parade.py`. The included Python scripts regenerate the bundled geography when refreshed source data is needed. The regional exporter requires Pillow.

To rebuild the seven landmark models, run `python3 scripts/geo_scale.py --cache /tmp/flappy-region-cache` with its documented dependencies. Save HonjuTheCat’s two CC0 originals from the scenery credits in that cache under their Wikimedia filenames (spaces replaced with underscores). Run `python3 scripts/export_landmarks.py --cache /tmp/flappy-region-cache` with NumPy, SciPy and Pillow installed.

## GitHub Pages

The Pages workflow tests pull requests to `main`, builds the Vite site with Node 24, and checks the bundled game and share-image assets. A push to `main` or a manual run on `main` deploys the verified `dist/` artifact to the `github-pages` environment. The last job confirms the deployed commit and domain using the GitHub API, then requests the public game, map, and social artwork. If the public homepage refuses the hosted runner with HTTP 403, the job records that limitation in its summary. You can repeat the public check from another network using `node scripts/check-pages.mjs --live`.

Repository Pages settings use **GitHub Actions** and the custom domain `turkey.kramnameloc.com`. The deployment environment allows `main`. The share button sends this canonical URL. Static Open Graph tags in `index.html` identify the JPEG preview and the square Apple touch icon in `public/social/`. The public link and artwork are available to preview crawlers without running the game.
