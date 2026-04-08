# PodGen — AI Podcast Generator

A Progressive Web App that generates real, sourced podcasts on any topic, using your Anthropic API key to search the web and write the script. Installable on iPhone or Android — use it at the gym, in the car, or at work.

## Features

- **Any topic** — search anything; the app finds real current information first
- **4 formats** — News deep-dive, Interview, Panel debate, Explainer
- **Always sourced** — every factual claim has a tappable green badge linking to the original paper or article
- **Fully listenable** — text-to-speech with distinct voices per speaker + narrator
- **Illustrative fiction segments** — clearly labelled storytelling to humanise the topic
- **Speed control** — 0.75x to 2x
- **Episode history** — last 10 episodes saved locally, tap to replay
- **Works offline** — app shell cached; only API calls need internet
- **Installs on your phone** — no App Store needed

## You need

An **Anthropic API key** — get one free at [console.anthropic.com/keys](https://console.anthropic.com/keys). Your key is saved only in your browser's localStorage. It is never sent anywhere except directly to `api.anthropic.com`.

Generating one episode costs roughly **$0.03–0.08** in API credits depending on topic depth.

---

## Deploy to GitHub Pages (free, 5 minutes)

1. Create a new GitHub repository (e.g. `podgen`)
2. Upload these files keeping the folder structure:
   ```
   index.html
   manifest.json
   sw.js
   icons/icon-192.png
   icons/icon-512.png
   README.md
   ```
3. Go to your repo → **Settings → Pages → Source: Deploy from branch → main / root → Save**
4. Wait ~60 seconds. Your app is live at:
   `https://YOUR-USERNAME.github.io/podgen`

---

## Install on iPhone (Safari required)

1. Open your GitHub Pages URL in **Safari** (not Chrome)
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **"Add"** — it installs like a native app with its own icon

## Install on Android (Chrome)

1. Open your GitHub Pages URL in **Chrome**
2. Tap the three-dot menu
3. Tap **"Add to Home Screen"** or **"Install App"**

---

## Voice quality tips

- **Best voices**: Safari on iPhone/Mac, Chrome on Windows/Mac desktop
- Firefox tends to have more robotic TTS voices
- The app assigns different voices to each speaker automatically based on what your device has available
- Narrator voice is deliberately different (slower pitch) for the fiction segments

---

## File structure

```
index.html       — entire app (single file, no build step needed)
manifest.json    — PWA install metadata
sw.js            — service worker for offline support
icons/           — app icons for home screen
```

No npm, no build step, no server needed. It's a single HTML file.
