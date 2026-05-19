# Contributing

Thanks for helping improve AV Sync Lab. The project is intentionally
small: plain HTML, CSS, browser JavaScript, and a Node static server.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Start here

1. Search existing issues and pull requests.
2. Open or comment on an issue before non-trivial work.
3. Keep changes focused on one concern.
4. Run local checks and verify the relevant browser workflow.
5. Open a pull request that explains the user-facing reason for the change.

## Development setup

```bash
git clone https://github.com/Dhi13man/audio-video-sync-lab.git
cd audio-video-sync-lab
npm install
npm start
```

Expected server output:

```text
AV Sync Lab running at http://127.0.0.1:5177
```

Open <http://127.0.0.1:5177>.

## Local checks

```bash
npm run check
```

This runs JavaScript syntax checks and markdown linting.

## Project layout

| Path | Purpose |
| --- | --- |
| `public/index.html` | App shell and controls |
| `public/styles.css` | Layout, tokens, and component styles |
| `public/app.js` | Audio analysis, sync controls, preview, and export |
| `server.js` | Local static server and FFmpeg asset fallback proxy |
| `.github/` | Community templates and CI |

## Scope

Good contributions usually fit one of these categories:

- Sync accuracy improvements with before and after notes.
- Export correctness fixes with FFmpeg filter details.
- UI changes that make the workflow clearer or easier to verify.
- Browser compatibility fixes.
- Documentation that helps users complete a real task.

Avoid broad rewrites, framework migrations, dependency additions, or unrelated
cleanup mixed into feature work.

## Code style

- Use vanilla JavaScript and native browser APIs.
- Prefer modern CSS layout and styling over JavaScript measurement.
- Keep runtime npm dependencies at zero unless there is a strong reason.
- Match nearby helper patterns before adding new abstractions.
- Add comments only when they explain constraints or non-obvious decisions.
- Keep interactive controls keyboard-operable and accessible by name.
- Respect `prefers-reduced-motion` for motion-heavy UI changes.

## Commits

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Common types:

| Type | Use |
| --- | --- |
| `feat` | User-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting or CSS-only presentation change |
| `refactor` | Internal restructuring without behavior change |
| `perf` | Performance improvement |
| `test` | Test or validation changes |
| `build` | Tooling, package, or CI changes |
| `chore` | Maintenance |

Examples:

```text
feat(spectrogram): add waveform overlay
fix(render): preserve negative trim delay
docs: document release process
```

## Pull requests

Every pull request should include:

- A concise summary.
- The reason the change matters.
- A test plan with commands and browser workflows.
- Screenshots or clips for user-visible UI changes.
- Notes on sync-score impact when algorithm behavior changes.
- Notes on FFmpeg filter changes when export behavior changes.

UI changes should be checked at 1440 x 900, 1280 x 720, and 800 x 600 when
possible.

## Bug reports

Use the bug report template. Include:

- Steps to reproduce.
- Expected and actual behavior.
- Browser, OS, and Node version.
- Media codec, duration, and rough file size.
- Console or FFmpeg log output.

Do not attach private media. Synthetic samples or screenshots are safer.

## Feature requests

Describe the workflow problem first. Then include the desired outcome and 3-5
acceptance checks that would make the feature complete.

## Security reports

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).
