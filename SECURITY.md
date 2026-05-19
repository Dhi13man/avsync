# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| `main` | Yes |
| `< 0.1.0` | No |

Before `1.0.0`, security fixes land on `main` first and are released as patch
versions when practical.

## Reporting a vulnerability

Do not open a public issue for security-sensitive reports.

Use GitHub private vulnerability reporting if it is enabled for the repository.
If it is not enabled, contact the maintainer privately through the GitHub
repository owner profile and include:

- Affected version, commit, or hosted URL.
- Browser, OS, and Node version if relevant.
- Reproduction steps or a minimal proof of concept.
- Impact assessment and any known workaround.

You should receive an acknowledgement within 7 days. Valid reports are triaged
by impact, exploitability, and user exposure.

## Security scope

In scope:

- Cross-origin isolation, worker, or FFmpeg asset loading issues.
- Local file handling bugs that expose media outside the current browser
  session.
- Export pipeline behavior that could execute unexpected FFmpeg arguments.
- Dependency or supply-chain issues in release tooling.

Out of scope:

- Vulnerabilities in local media files or codecs outside this project.
- Denial-of-service from intentionally huge local media files.
- Reports that require physical access to the user's machine.
- Generic findings without a project-specific exploit path.

## Privacy model

The app is designed to process media locally. The included server fetches FFmpeg
WASM assets through `/vendor/ffmpeg/*`; user media is not uploaded by the app.
