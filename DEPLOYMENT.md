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

## One-time setup for the shared log

The shared mode needs a database and three secrets. This is the only manual
setup, and it is done once, in the Cloudflare dashboard.

### 1. Create the database

Cloudflare Dashboard → **Storage & Databases → D1 → Create database**, name it
`stripping-historian`. Open its **Console** tab, paste the contents of
[`schema.sql`](./schema.sql), and run it.

### 2. Bind it to the Pages project

Workers & Pages → `stripping-historian` → **Settings → Bindings → Add → D1
database**:

| Variable name | Value |
|---|---|
| `DB` | the `stripping-historian` database |

The variable **must** be named `DB` — that is what `functions/api/sync.js` reads.

### 3. Add the three secrets

Same Settings page → **Environment variables → Add**, and click **Encrypt** on
each one:

| Name | Value |
|---|---|
| `AUTH_SECRET` | a long random string — sign-in cookies are signed with it |
| `ADMIN_PASSWORD` | the password you keep |
| `OPERATOR_PASSWORD` | the password you give the operators |

Generate a good `AUTH_SECRET` with:

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Set these for **Production** (and Preview, if you use preview deployments).
Then **redeploy** — environment variables are read at deploy time, so an
existing deployment will not pick them up on its own.

### 4. Check it

Open the site. You should get a password screen. Sign in with the admin
password; the sidebar should read **shared · admin** and the pill at the
bottom-right should settle on **Synced**.

If something is missing, the app says which: a missing `AUTH_SECRET` or both
passwords unset returns *"Server is not configured"*, and a missing `DB` binding
returns *"the D1 database binding 'DB' is missing"*.

## Rotating a password

Change the secret in the dashboard and redeploy. Changing `AUTH_SECRET` also
invalidates every existing sign-in, which is the fastest way to boot everyone
out if a password leaks.

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
