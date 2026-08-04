# Deployment

The app is a single static file (`index.html`) with no build step. It is hosted
on **Cloudflare Pages**:

**https://stripping-historian.pages.dev**

## How deploys happen

Cloudflare Pages is connected to this repository through Cloudflare's **Git
integration**, watching the `main` branch. Every push to `main` triggers a
Cloudflare build that publishes the repo root as-is. There is nothing to
configure in GitHub — no API token, no secret, no deploy workflow.

```
push to main  ->  Cloudflare Pages build  ->  https://stripping-historian.pages.dev
```

GitHub Actions runs the test suite only (`.github/workflows/ci.yml`). It does
not deploy. A red CI run does not block the Cloudflare deploy, so keep `main`
green: run `npm test` before you push.

## Settings on the Cloudflare side

| Setting | Value |
|---|---|
| Project name | `stripping-historian` |
| Production branch | `main` |
| Build command | *(none)* |
| Build output directory | `/` (repo root) |

Because there is no build step, whatever `index.html` is at the tip of `main`
is what the site serves.

## Manual deploy

Only needed if the Git integration is disconnected:

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=stripping-historian
```

## Custom domain

Cloudflare Dashboard -> Workers & Pages -> `stripping-historian` -> Custom
domains. Cloudflare issues the certificate automatically.

## A note on data

The app stores everything in **IndexedDB in the visitor's browser**. Deploying
a new version never touches operator data, and data does not travel between
machines or browsers. **Backup** in the sidebar remains the only way to move or
preserve a dataset.
