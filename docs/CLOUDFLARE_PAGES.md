# Cloudflare Pages Hosting

Cloudflare Pages is the primary production host for AVSync custom domains.
GitHub remains the source repository, while Cloudflare owns the public domain,
TLS, redirects, and static response headers.

## Production URLs

| URL | Purpose |
| --- | --- |
| `https://avsync.dhimanseal.com` | Canonical production URL |
| `https://avsync.dhi13man.com` | Alias that redirects to the canonical URL |
| `https://dhi13man.github.io/avsync/` | GitHub Pages fallback |

## Project Settings

Use these settings for the Cloudflare Pages project:

| Setting | Value |
| --- | --- |
| Project name | `avsync` |
| Source | `Dhi13man/avsync` |
| Production branch | `main` |
| Build command | `npm run check` |
| Build output directory | `public` |
| Node.js version | `18` or later |

The app is static. The build command validates JavaScript and markdown, and
Cloudflare publishes the files already present in `public/`.

## Custom Domains

Add `avsync.dhimanseal.com` through the Pages project's **Custom domains**
screen. Cloudflare will create or update the DNS record for the zone.

Keep `avsync.dhi13man.com` proxied in Cloudflare DNS and redirect it to the
canonical domain with a Redirect Rule:

```text
https://avsync.dhi13man.com/*
```

Redirect target:

```text
https://avsync.dhimanseal.com/${1}
```

Use a `301` status and preserve the query string.

## Headers

Cloudflare Pages reads `public/_headers` during deployment. AVSync uses it to
set cross-origin isolation headers, basic security headers, cache policy, and a
canonical `Link` header.

These headers are important for the browser FFmpeg path because the app loads a
same-origin FFmpeg wrapper worker and fetches the larger FFmpeg WASM core at
runtime.
