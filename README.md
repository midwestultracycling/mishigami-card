# Mishigami Race Card

A Progressive Web App for Mishigami 2026 riders to create branded race progress cards.

## What it does

- Riders open the URL on their phone during the race
- Tap **Get My Location** — GPS auto-calculates miles from start, elapsed time since 7AM start, and average speed
- Add a photo (camera or library)
- Download a branded 1080×1080 (feed) or 1080×1920 (story) PNG ready for Instagram or Strava

## Hosting (GitHub Pages)

1. Create a new GitHub repo (e.g. `mishigami-card`)
2. Push all files to `main` branch
3. Go to Settings → Pages → Source: Deploy from branch → `main` → `/ (root)`
4. Point `card.midwestultracycling.com` CNAME to `<your-username>.github.io`
5. Add a `CNAME` file containing `card.midwestultracycling.com`

## Updating for race day

- **Race start time:** Set in `app.js` → `RACE_START_UTC` (currently `2026-07-11T12:00:00Z` = 7AM CDT)
- **Route files:** Replace `routes/mishigami.json` and `routes/mini-gami.json` when 2026 routes are finalized
- **Logo:** `assets/logo.png` — swap with updated brand assets as needed

## File structure

```
mishigami-card/
├── index.html          Main app
├── style.css           UI styles (Mishigami brand tokens)
├── app.js              App logic, GPS, photo, download
├── gpx.js              Route engine (snap-to-route, Haversine)
├── renderer.js         Canvas image composition
├── manifest.json       PWA manifest
├── .nojekyll           Required for GitHub Pages
├── CNAME               Custom domain (add before deploy)
├── routes/
│   ├── mishigami.json  Main Event route (5,176 pts, 1,090 mi)
│   └── mini-gami.json  Mini-Gami route (3,781 pts, 532 mi)
└── assets/
    ├── logo.png        Mishigami brand mark (periwinkle PNG)
    ├── icon-192.png    PWA icon
    └── icon-512.png    PWA icon (large)
```
