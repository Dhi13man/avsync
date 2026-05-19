# GitHub Pages Hosting

AVSync can run on GitHub Pages as a static site. The app serves its own
HTML, CSS, JavaScript, icon, manifest, robots file, and small FFmpeg wrapper
files from `public/`.

## Deployment

The Pages workflow deploys `public/` whenever `main` changes. It also runs the
same local validation as CI before publishing.

Manual deploys are available from the GitHub Actions **Pages** workflow.

## Default URL

After the workflow finishes, the project site is available at:

```text
https://dhi13man.github.io/audio-video-sync-lab/
```

## Custom domain

To connect a custom domain:

1. Add a repository variable named `PAGES_CUSTOM_DOMAIN` with the exact domain,
   such as `avsynclab.com` or `sync.example.com`.
2. Run the **Pages** workflow or push to `main`. The workflow writes that value
   into `public/CNAME` before deploying.
3. Configure DNS at the domain registrar.

For an apex domain, add these `A` records:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `185.199.108.153` |
| `@` | `A` | `185.199.109.153` |
| `@` | `A` | `185.199.110.153` |
| `@` | `A` | `185.199.111.153` |

For a `www` or other subdomain, add a `CNAME` record:

| Host | Type | Value |
| --- | --- | --- |
| `www` | `CNAME` | `dhi13man.github.io` |

Then set the same custom domain in the repository's GitHub Pages settings and
enable HTTPS after DNS validation completes.

## Static-host compatibility

GitHub Pages cannot run the local Node server. The browser app therefore serves
the FFmpeg wrapper worker from `public/vendor/` and loads the large FFmpeg WASM
core from jsDelivr through same-origin Blob URLs at runtime.
