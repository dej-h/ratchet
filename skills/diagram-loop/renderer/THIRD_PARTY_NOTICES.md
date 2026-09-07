# Third-party dependency notices

The renderer installs dependencies from `package-lock.json`; dependency source
is not vendored in this repository. The lock currently selects these principal
runtime packages and licenses:

| Package | Selected version | License |
|---|---:|---|
| Remotion, bundler, and renderer | 4.0.520 | Remotion License |
| ELK.js | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later |
| Inter font package | 5.3.0 | OFL-1.1 |
| Iconify Logos pack | 1.2.13 | CC0-1.0 |
| Iconify Lucide pack | 1.2.129 | ISC |
| Iconify utilities | 3.1.4 | MIT |
| `@napi-rs/canvas` | 1.0.8 | MIT |
| React and React DOM | 19.2.8 | MIT |
| YAML | 2.9.0 | ISC |
| Zod | 4.5.4 | MIT |

The asset manifest for each run separately records the source, license,
attribution, transformations, and byte hash for every selected visual asset.

Remotion has a commercial licensing boundary. Confirm that the intended use is
eligible under the current [Remotion License](https://www.remotion.dev/license)
or that the required company license exists before using the renderer.
