# PodGen — Free AI Podcast Generator

Generate real, sourced podcasts on any topic. Free for all users. Installs on iPhone or Android like a native app.

---

## How it works

- **Frontend** — static HTML on GitHub Pages (free)
- **Backend** — a Cloudflare Worker (free tier: 100k requests/day) that holds your Anthropic API key
- **Users** pay nothing. You pay ~$0.05/episode in Anthropic API costs.

---

## Full deploy guide (~10 minutes)

### Part 1 — GitHub Pages (frontend)

1. Create a free GitHub account at github.com if you don't have one
2. Click **"New repository"** — name it `podgen` (or anything you like)
3. Set it to **Public**
4. Upload these files, keeping the folder structure:
   ```
   index.html
   manifest.json
   sw.js
   worker.js
   icons/icon-192.png
   icons/icon-512.png
   ```
5. Go to **Settings → Pages → Source: Deploy from branch → Branch: main / Folder: / (root) → Save**
6. Wait 60 seconds. Your app is live at:
   `https://YOUR-USERNAME.github.io/podgen`

---

### Part 2 — Cloudflare Worker (backend, free)

1. Go to **workers.cloudflare.com** and sign up for a free account (no credit card needed)
2. Click **"Create application" → "Create Worker"**
3. Name it `podgen` (your Worker URL will be `https://podgen.YOUR-NAME.workers.dev`)
4. Click **"Edit code"**
5. Delete all the default code and paste the entire contents of `worker.js` from this zip
6. Click **"Deploy"**

#### Add your Anthropic API key:

7. Go to your Worker's **Settings → Variables and Secrets**
8. Click **"Add variable"**
   - Variable name: `ANTHROPIC_API_KEY`
   - Value: your key from [console.anthropic.com/keys](https://console.anthropic.com/keys)
   - Click **"Encrypt"** then **"Save"**

#### Optional — set a daily episode limit:

9. Add another variable:
   - Variable name: `DAILY_LIMIT`
   - Value: `50` (or however many free episodes per day you want)
   - This requires also creating a KV namespace (see below)

#### Optional — KV namespace for rate limiting:

10. In Cloudflare dashboard → **Workers & Pages → KV → Create a namespace** → name it `PODGEN_KV`
11. Go back to your Worker → **Settings → Bindings → Add binding**
    - Type: KV namespace
    - Variable name: `PODGEN_KV`
    - KV namespace: select `PODGEN_KV`
12. Click Save and redeploy

#### Optional — lock to your domain only (security):

13. Add variable `ALLOWED_ORIGIN` = `https://YOUR-USERNAME.github.io`
    This prevents other sites from using your Worker.

---

### Part 3 — Connect frontend to Worker

1. Open your GitHub Pages app in a browser
2. You'll see a blue "Setup required" notice — tap it
3. Enter your Worker URL: `https://podgen.YOUR-NAME.workers.dev`
4. Tap **Save** — done. The URL is saved in your browser's localStorage.

> **Sharing with others:** When someone else opens your app, they'll see the same setup notice and need to enter the Worker URL once. You can pre-fill it by adding `?worker=https://podgen.YOUR-NAME.workers.dev` to your share URL — the app will auto-save it. (This feature is easy to add if needed.)

---

## Install on iPhone (Safari required)

1. Open your GitHub Pages URL in **Safari** — not Chrome
2. Tap the **Share button** (box with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** — installs with its own icon, works offline

## Install on Android (Chrome)

1. Open your GitHub Pages URL in **Chrome**
2. Tap the three-dot menu (⋮)
3. Tap **"Add to Home Screen"** or **"Install App"**

---

## Cost estimate

| Usage | Anthropic cost |
|---|---|
| 10 episodes/day | ~$0.50/day |
| 50 episodes/day | ~$2.50/day |
| 100 episodes/day | ~$5.00/day |

Cloudflare Workers free tier covers 100,000 requests/day — far more than you'll need.

---

## Voice quality tips

- **Best voices:** Safari on iPhone/Mac, or Chrome on Windows desktop
- Firefox has more robotic TTS — tell users to use Safari or Chrome
- The app automatically assigns different voices to each speaker based on what your device has

---

## Files in this zip

| File | Purpose |
|---|---|
| `index.html` | The entire frontend app — no build step |
| `manifest.json` | PWA install metadata |
| `sw.js` | Service worker for offline support |
| `worker.js` | Cloudflare Worker backend — paste into CF dashboard |
| `icons/` | App icons for home screen |
