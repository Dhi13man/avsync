# Third-Party Notices

This repository vendors a small set of browser JavaScript wrapper files so the
GitHub Pages build can load the FFmpeg worker from the same origin.

## FFmpeg WASM wrappers

| Package | Version | Path | License |
| --- | --- | --- | --- |
| `@ffmpeg/ffmpeg` | `0.12.10` | `public/vendor/ffmpeg/ffmpeg/0.12.10/` | MIT |
| `@ffmpeg/util` | `0.12.1` | `public/vendor/ffmpeg/util/0.12.1/` | MIT |

The larger `@ffmpeg/core` WebAssembly files are not committed to this
repository. They are fetched from jsDelivr at runtime and converted to Blob URLs
by the browser app.
