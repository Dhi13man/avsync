# Audio Video Sync Lab

> Local-first browser tool for replacing noisy video audio with a clean track,
> aligning it visually and by ear, then exporting a synced MP4.

[![CI](https://github.com/Dhi13man/audio-video-sync-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Dhi13man/audio-video-sync-lab/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-active-purple)](CODE_OF_CONDUCT.md)

Audio Video Sync Lab helps you fit an external clean audio track to a video.
Load both files, decode their audio, inspect aligned spectrograms, choose or
nudge an offset, preview the result, and render a video with the original video
stream plus the replacement audio. User media stays on your machine.

## Features

- Automatic alignment estimates from spectrogram feature correlation.
- Tempo refinement for recordings that drift slightly over time.
- Negative offsets for cases where the clean track starts after the video.
- Frame-scale nudges, spectrogram dragging, playhead scrubbing, and looped
  review.
- Preview modes for clean audio, blended audio, and original video audio.
- FFmpeg WASM export with `-c:v copy` and AAC replacement audio.
- Cross-origin isolation headers and same-origin FFmpeg asset proxy.
- Light and dark themes through native `color-scheme`.

## Prerequisites

- Node.js 18 or later.
- A recent Chromium, Firefox, or Safari build with `SharedArrayBuffer`,
  WebAudio, Canvas2D, and Web Worker support.
- Network access to jsDelivr when FFmpeg WASM assets are first loaded.

## Quick start

```bash
git clone https://github.com/Dhi13man/audio-video-sync-lab.git
cd audio-video-sync-lab
npm start
```

Expected output:

```text
Audio Video Sync Lab running at http://127.0.0.1:5177
```

Open <http://127.0.0.1:5177>.

## Usage

1. Load a video file and the clean audio track.
2. Click **Decode Media**.
3. Click **Estimate Match** and select the best candidate if needed.
4. Use **Track start**, nudges, or spectrogram dragging to refine sync.
5. Preview in **Clean track**, **Blend**, or **Original video** mode.
6. Click **Render File** to export a synced MP4.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play or pause |
| `Left Arrow` / `Right Arrow` | Nudge track start by 100 ms |
| `Shift` + arrow | Nudge track start by 1 s |
| `Alt` + arrow | Nudge track start by one frame, roughly 33 ms |
| `L` | Toggle loop playback |

Shortcuts are ignored while focus is inside an input or select.

## Development

Install development dependencies only when you need validation tools:

```bash
npm install
npm run check
```

The app has no runtime npm dependencies. The development dependency is used for
markdown linting.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Serve the app at `http://127.0.0.1:5177` |
| `npm run check:js` | Syntax-check `server.js` and `public/app.js` |
| `npm run lint:md` | Lint markdown documentation |
| `npm run check` | Run all local checks |

### Project structure

| Path | Purpose |
| --- | --- |
| `public/index.html` | App shell, controls, and preview markup |
| `public/styles.css` | CSS layers, layout, components, and responsive behavior |
| `public/app.js` | Audio decode, spectrogram analysis, preview, and export logic |
| `server.js` | Static server, isolation headers, and FFmpeg asset proxy |
| `.github/` | Community files, issue templates, PR template, and CI |
| `docs/RELEASE.md` | Release checklist |

## How it works

```mermaid
flowchart LR
  video["Video file"] --> extract["FFmpeg extracts mono audio"]
  audio["Clean track"] --> decode["Web Audio or FFmpeg decodes audio"]
  extract --> spec["STFT and log-mel spectrograms"]
  decode --> spec
  spec --> score["Feature correlation scores offsets"]
  score --> refine["Manual trim and tempo refinement"]
  refine --> preview["Browser preview"]
  refine --> render["FFmpeg render"]
  render --> output["Synced MP4"]
```

Important implementation details:

- Spectrograms are cached as offscreen bitmaps and redrawn as cropped views.
- Negative trim uses `adelay` in the export filter so a clean track can start
  after the video.
- Dragging trim during playback reseeks the clean audio source so preview stays
  responsive.
- The server sets COOP and COEP headers and proxies FFmpeg assets through
  `/vendor/ffmpeg/*`, which keeps FFmpeg WASM worker loading same-origin.

## Browser requirements

| Capability | Requirement |
| --- | --- |
| Cross-origin isolation | Provided by the included Node server |
| Audio APIs | WebAudio `decodeAudioData` and `AudioBufferSourceNode` |
| Rendering APIs | Canvas2D and Web Workers |
| FFmpeg export | SharedArrayBuffer-capable browser session |

Large videos are constrained by browser memory and local I/O. For long or 4K
media, use shorter test clips while tuning algorithm changes.

## Roadmap

- [ ] Multi-region alignment for videos that need re-sync at different
  timecodes.
- [ ] Waveform overlay on top of spectrograms.
- [ ] DTW-based fine alignment as an alternative to fixed-tempo refinement.
- [ ] Local project-state persistence.
- [ ] Export presets for proxy, mezzanine, and deliverable workflows.
- [ ] Optional vendored FFmpeg assets for fully offline use.

## Contributing

Bug reports, feature suggestions, and pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
and [SECURITY.md](SECURITY.md) before participating.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Versions follow
[Semantic Versioning](https://semver.org/).

## License

MIT. See [LICENSE](LICENSE).
