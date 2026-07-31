# Cloudflare Pages Deployment Guide

## Quick Start

### 1. Get Your Cloudflare Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Sign up (free) or log in
3. Navigate to **Account Settings** → **API Tokens**
4. Click **Create Token** and select "Edit Cloudflare Workers"
5. Copy the token and save it (you'll use it next)

### 2. Set Up GitHub Secrets

1. Go to your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Value:** (paste your token from step 1)
3. Click **New repository secret** again and add:
   - **Name:** `CLOUDFLARE_ACCOUNT_ID`
   - **Value:** (get this from Cloudflare Dashboard → Account Home, it's shown on the right)

### 3. Deploy via GitHub

Just push to `main` or `master` branch:

```bash
git push origin main
```

GitHub Actions will automatically:
- Run your tests (`npm test`)
- Deploy to Cloudflare Pages
- Show deployment status in your PR/push

### 4. Get Your Live URL

After first deployment, you'll get a URL like:
- `https://stripping-historian.pages.dev` (automatic)
- Or connect a custom domain in Cloudflare Dashboard

## Manual Deployment (without GitHub Actions)

If you prefer to deploy manually:

```bash
# Install Wrangler CLI
npm install -g wrangler

# Authenticate (opens browser)
wrangler auth

# Deploy
wrangler pages deploy . --project-name=stripping-historian
```

## What Happens on Deploy

1. ✅ Tests run (`npm test`)
2. ✅ Your `index.html` is served
3. ✅ HTTPS enabled automatically
4. ✅ Global CDN caches your app
5. ✅ Zero downtime deployments

## Free Tier Limits (You Won't Hit These)

- Unlimited requests
- Unlimited bandwidth
- Unlimited deployments
- Unlimited projects

## Troubleshooting

### Deployment fails with "not authenticated"
- Check `CLOUDFLARE_API_TOKEN` is set in GitHub Secrets
- Make sure token has "Edit Cloudflare Workers" permission

### Can't find Account ID
- Dashboard → Account Home → right sidebar shows "Account ID"
- Copy the full ID (looks like: `abc123def456ghi789`)

### Tests fail before deploying
- Run `npm test` locally
- Fix any test failures
- Push again

## Next Steps

- Set up a custom domain (optional): Cloudflare Dashboard → Pages → stripping-historian
- Enable advanced security features (optional, paid plans)
- Monitor deployments in GitHub Actions tab
