# Security review

Reviewed on November 26, 2026. Turkey Takeover ships as a static site. The browser reads bundled maps and models, stores local player preferences and records, and shares the game's canonical URL through the browser.

| Area | Finding and resolution |
| --- | --- |
| Browser rendering | The parade selector interpolated labels from GLB metadata into HTML. Dialogs, icons and the Pearl Street itinerary now use Lit bindings. A DOM regression test checks a model label containing markup and quotes. |
| Browser resource access | The production build now emits a Content Security Policy before loading any assets. Scripts, styles and fonts must come from the game origin. Three.js can read embedded textures through blob URLs. The browser suite collects policy violations during play. |
| Release verification | Generated HTML and map manifests supplied paths to the verifier. Local checks validate filenames and resolve symlinks before reading under `dist/`. Live checks request the canonical HTTPS origin and reject redirects. |
| Offline asset imports | The streetscape exporter streams the named FBX member into a regular temporary file. The geography exporters stage cache writes before publishing them. The park exporter validates a complete GIS response before caching it and refreshes incomplete older caches. |
| CI permissions | The Pages workflow uses commit-pinned actions and read-only repository access for pull requests. The deploy job receives Pages and identity-token write permissions on the main-branch deployment path. |

The dependency check used `npm audit` against the lockfile, including development dependencies. It reported zero known advisories on the review date. The offline exporters rely on their source archives and native tools for model content. Browser scores are stored on the player's device and can be edited there.
