# Changelog

All notable changes to AVSync are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Open-source release metadata, community guidelines, support policy, security
  policy, issue templates, pull request template, and release checklist.
- Project validation scripts for JavaScript syntax checks and markdown linting.

### Changed

- Package metadata now declares MIT licensing and public package intent.
- Product surfaces now use the AVSync brand with search-friendly audio-video
  sync metadata.
- GitHub Pages deployment workflow and static-host FFmpeg loading path.
- Cloudflare Pages is now the primary custom-domain host, with production
  response headers documented and configured in `public/_headers`.

## [0.1.0] - 2026-05-20

### Added

- Browser-based video and clean-audio sync workspace.
- Spectrogram analysis with candidate offset estimation and tempo refinement.
- Preview modes for clean, blended, and original audio playback.
- Region looping, frame-scale nudges, and spectrogram drag adjustment.
- FFmpeg WASM export path that copies the original video stream and replaces
  audio with AAC.
- Same-origin FFmpeg asset proxy for cross-origin isolation compatibility.

[Unreleased]: https://github.com/Dhi13man/avsync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Dhi13man/avsync/releases/tag/v0.1.0
