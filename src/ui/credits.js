import { html } from 'lit-html';
import { heading } from './panel.js';

export function creditsPanel() {
  return html`${heading('FIELD ARCHIVE', 'Map & photo credits')}
    <div class="credits">
      <h3>Broomfield geography</h3>
      <p>
        Buildings, streets, paths, landmarks, and surveyed trees come from the City and County of
        Broomfield. USGS elevation follows the local slopes. USGS lidar supplies many roof and tree heights,
        with estimates elsewhere. The Dover aerial comes from Colorado’s 2020 Denver Regional Aerial
        Photography Project (CC0). Fifteen Dover roofs follow the laser survey. The two houses at 735 Dover
        and next door use modeled exteriors based on a July 2026 street view. Five civic roof models follow
        the lidar survey. The Library and Auditorium exterior uses local photographs by HonjuTheCat (CC0).
        Brunner Farmhouse was modeled from the city’s exterior photograph and footprint.
        <a href="/geo/sources.json" target="_blank" rel="noopener">Map sources and coverage</a>
      </p>
      <h3>Pearl Street and the teahouse</h3>
      <p>
        The Boulder walk compresses the blocks between the mall and 1770 13th Street. Street-level
        photographs and the city’s civic-area plan guided the original scenery. ImageGen supplied the
        shopfronts and ornamental textures.
        <a href="/scenery/pearl-sources.json" target="_blank" rel="noopener">Boulder references and artwork</a>
      </p>
      <h3>Game artwork</h3>
      <p>
        The menu and share preview use the same poster, created with ImageGen. It depicts a Bourbon Red
        turkey chasing a slice of pumpkin pie below the Flatirons.
        <a href="/cover/credits.json" target="_blank" rel="noopener">Artwork and photography credits</a>.
      </p>
      <h3>Player model</h3>
      <p>
        The Bourbon Red turkey uses the supplied model, color texture, and character animations. Its right
        wing also appears in first person.
      </p>
      <h3>Field scenery</h3>
      <p>
        Adapted Broomfield Flatirons by Kpsudeep (CC BY-SA 4.0), photographic panorama by Greg Zaal, grass
        by Charlotte Baglioni, cottonwood by Famartin (CC BY-SA 4.0), oak by Betelguese (CC BY-SA 3.0), and
        photographed façades by Scouser. The grass clumps and seed heads are adapted from grass by Georgeous
        (Sketchfab Standard). Parked vehicles on Dover use Kenney’s Car Kit (CC0). Soft-surface trails use
        Gravel Ground 01 by Rob Tuytel (CC0). Road surfaces, ironwork, and residential masonry are adapted
        from Street by Pasha (CC BY 4.0). Street furniture and controls are adapted from AndrewPunchak and
        pixelsquare, posed spectators from PolyOne Studio, ranch houses from Designed By Jonathan, and
        shrubs from LOLIPOP (CC BY 4.0). The balloon models are by Macys Parade and the 1993 Sonic model is
        by pika39019 (CC BY 4.0). The oak models and their autumn and summer foliage are adapted from the
        Oak trees pack by LOLIPOP (CC BY 4.0).
        <a href="/scenery/sources.json" target="_blank" rel="noopener">Scenery sources and licenses</a>.
        The western skyline combines USGS terrain with sculpted relief and snow from Snowy Mountain by
        James Lucas (CC BY-NC 4.0).
        <a href="/scenery/peaks-credits.json" target="_blank" rel="noopener">Front Range sources</a>
      </p>
    </div>`;
}
