# Release Process

This checklist keeps releases repeatable while the project is small.

## Prerequisites

- Node.js 18 or later.
- A clean git working tree.
- Permission to push tags and create GitHub releases.

## Versioning

Audio Video Sync Lab follows Semantic Versioning:

- `PATCH`: bug fixes, documentation updates, small UI corrections.
- `MINOR`: new user-facing features that do not break existing workflows.
- `MAJOR`: breaking changes to documented workflows or output behavior.

## Checklist

1. Confirm the working tree is clean.

   ```bash
   git status --short
   ```

2. Run local validation.

   ```bash
   npm install
   npm run check
   ```

3. Update `CHANGELOG.md`.

   Move items from `[Unreleased]` into the new version section and add the
   release date in `YYYY-MM-DD` format.

4. Commit the release metadata.

   ```bash
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore(release): prepare v0.1.0"
   ```

5. Create an annotated tag.

   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   ```

6. Push the branch and tag.

   ```bash
   git push origin HEAD
   git push origin v0.1.0
   ```

7. Create the GitHub release from the tag.

   ```bash
   gh release create v0.1.0 --notes-from-tag
   ```

## Release verification

After publishing:

- Open the release archive and confirm it excludes local media artifacts.
- Run `npm start` from a fresh checkout.
- Load a small video and clean track, estimate a match, preview, and render.
- Confirm the rendered MP4 plays in at least one browser and one desktop player.
