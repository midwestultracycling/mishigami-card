/**
 * app.js — Mishigami Race Card main application
 *
 * Race start: July 11, 2026 at 7:00 AM CDT (= 12:00 UTC)
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

// Race start time: 2026-07-11 07:00 CDT = 12:00 UTC
const RACE_START_UTC = new Date('2026-07-11T12:00:00Z').getTime();

const ROUTES = {
  'mishigami': { file: 'routes/mishigami.json',  totalMi: 1121.0, label: 'MISHIGAMI MAIN EVENT' },
  'mini-gami': { file: 'routes/mini-gami.json',  totalMi: 484.0,  label: 'MINI-GAMI'            },
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  race:             null,
  route:            null,      // loaded JSON array
  photo:            null,      // HTMLImageElement
  name:             '',
  miles:            null,
  elapsed:          null,      // "HH:MM" string
  speed:            null,
  progressFraction: 0,
  format:           'square',
  showMap:          true,
  logoImg:          null,
  fontsReady:       false,
  renderPending:    false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const screenSelect  = $('screen-select');
const screenBuild   = $('screen-build');
const previewCanvas = $('preview-canvas');
const previewWrap   = $('preview-wrap');
const previewPH     = $('preview-placeholder');
const btnBack       = $('btn-back');
const btnGps        = $('btn-gps');
const btnGpsLabel   = $('btn-gps-label');
const gpsStatus     = $('gps-status');
const inputName     = $('input-name');
const inputMiles    = $('input-miles');
const inputElapsed  = $('input-elapsed');
const inputSpeed    = $('input-speed');
const btnPhoto      = $('btn-photo');
const inputPhoto    = $('input-photo');
const btnMapToggle  = $('btn-map-toggle');
const btnDownload   = $('btn-download');
const buildRaceLabel = $('build-race-label');

// ── Elapsed time formatting ───────────────────────────────────────────────────

function calcElapsed() {
  const now  = Date.now();
  const diff = now - RACE_START_UTC;
  if (diff < 0) return null; // Race hasn't started yet
  const totalMins = Math.floor(diff / 60000);
  const h  = Math.floor(totalMins / 60);
  const m  = totalMins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ── Canvas preview rendering ──────────────────────────────────────────────────

let _renderTimer = null;

function scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(doRender, 60);
}

function doRender() {
  if (!state.race || !state.fontsReady) return;

  const canvas = Renderer.renderCard({
    race:             state.race,
    photo:            state.photo,
    name:             state.name,
    miles:            state.miles,
    elapsed:          state.elapsed,
    speed:            state.speed,
    progressFraction: state.progressFraction,
    format:           state.format,
    logoImg:          state.logoImg,
    route:            state.route,
    showMap:          state.showMap,
  });

  // Copy to preview canvas
  const W = state.format === 'story' ? 1080 : 1080;
  const H = state.format === 'story' ? 1920 : 1080;
  previewCanvas.width  = W;
  previewCanvas.height = H;
  const ctx = previewCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  previewPH.style.display = 'none';
  previewCanvas.style.display = 'block';

  // Enable download once we have something to show
  btnDownload.disabled = false;
}

// ── GPS ───────────────────────────────────────────────────────────────────────

function getLocation() {
  if (!navigator.geolocation) {
    setGpsStatus('GPS not supported on this browser.', true);
    return;
  }

  btnGpsLabel.textContent = 'Getting location…';
  btnGps.disabled = true;
  setGpsStatus('', false);

  // IMPORTANT: call getCurrentPosition immediately — no await before this.
  // iOS Safari's user-activation window for geolocation is very short.
  // Any async gap (await, setTimeout, toBlob callback) before this call
  // can cause iOS to silently deny without showing the permission prompt.
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;

      // If route isn't loaded yet, show position but skip snap
      if (!state.route) {
        setGpsStatus(`Location found · accuracy ±${Math.round(accuracy)}m — route still loading, tap again in a moment.`, false);
        btnGpsLabel.textContent = 'Refresh Location';
        btnGps.disabled = false;
        return;
      }

      const result = GPX.snap(latitude, longitude, state.route);

      // Elapsed from race start
      const elapsed = calcElapsed();

      // Compute speed: miles / hours
      let speed = null;
      if (elapsed && result.distanceMiles > 0) {
        const parts = elapsed.split(':');
        const hours = parseInt(parts[0]) + parseInt(parts[1]) / 60;
        if (hours > 0) speed = result.distanceMiles / hours;
      }

      state.miles            = result.distanceMiles;
      state.elapsed          = elapsed;
      state.speed            = speed;
      state.progressFraction = result.progressFraction;

      // Populate fields
      inputMiles.value   = result.distanceMiles.toFixed(1);
      inputElapsed.value = elapsed || '';
      inputSpeed.value   = speed ? speed.toFixed(1) : '';

      const offKm = (result.offRouteMeters / 1000).toFixed(1);
      const pct   = (result.progressFraction * 100).toFixed(1);
      const warn  = result.offRouteMeters > 2000
        ? ` (${offKm}km off route — check accuracy)`
        : '';
      setGpsStatus(`${pct}% complete · accuracy ±${Math.round(accuracy)}m${warn}`, false);

      btnGpsLabel.textContent = 'Refresh Location';
      btnGps.disabled = false;
      scheduleRender();
    },
    err => {
      if (err.code === 1) {
        // Log permission state to console for diagnostics
        if (navigator.permissions) {
          navigator.permissions.query({ name: 'geolocation' })
            .then(p => console.log('[GPS] denied. Permissions API state:', p.state))
            .catch(e => console.warn('[GPS] permissions query failed:', e));
        }
        setGpsStatus(
          'Location blocked (code 1). Try in order: ' +
          '① Settings → Apps → Safari → Settings for Websites → Location → Ask or Allow, then reload. ' +
          '② Settings → Apps → Safari → Advanced → Website Data → find midwestultracycling → Delete, then reload. ' +
          '③ Open this page in a Private Browsing tab in Safari — iOS will prompt you fresh.',
          true
        );
      } else {
        setGpsStatus(
          err.code === 2 ? 'Location unavailable. Try again.' :
          err.code === 3 ? 'Location timed out. Try again.' :
          `Location error (code ${err.code}).`,
          true
        );
      }
      btnGpsLabel.textContent = 'Get My Location';
      btnGps.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

function setGpsStatus(msg, isError) {
  gpsStatus.textContent  = msg;
  gpsStatus.className    = 'gps-status' + (isError ? ' gps-error' : '');
}

// ── Route loading ─────────────────────────────────────────────────────────────

async function loadRoute(race) {
  try {
    state.route = await GPX.load(ROUTES[race].file);
    // Re-render so the route map appears if the toggle was already on
    scheduleRender();
  } catch (e) {
    console.error('Route load failed:', e);
    setGpsStatus('Route data unavailable — enter stats manually.', true);
  }
}

// ── Logo preload ──────────────────────────────────────────────────────────────

function loadLogo() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);  // graceful — card still renders without logo
    img.src = 'assets/logo.png';
  });
}

// ── Photo handling ────────────────────────────────────────────────────────────

function handlePhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      state.photo = img;
      $('btn-photo-label').textContent = 'Photo added — tap to change';
      scheduleRender();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Download / Share ──────────────────────────────────────────────────────────

function buildFilename() {
  const name    = state.name ? state.name.replace(/\s+/g, '-').toLowerCase() : 'rider';
  const race    = state.race === 'mishigami' ? 'mishigami' : 'mini-gami';
  const miPart  = state.miles != null ? `-${Math.round(state.miles)}mi` : '';
  const d       = new Date();
  const datePart = `-${d.getMonth() + 1}-${d.getDate()}`;
  return `${race}-race-card-${name}${miPart}${datePart}.png`;
}

function renderFull() {
  return Renderer.renderCard({
    race:             state.race,
    photo:            state.photo,
    name:             state.name,
    miles:            state.miles,
    elapsed:          state.elapsed,
    speed:            state.speed,
    progressFraction: state.progressFraction,
    format:           state.format,
    logoImg:          state.logoImg,
    route:            state.route,
    showMap:          state.showMap,
  });
}

async function downloadCard() {
  const canvas   = renderFull();
  const filename = buildFilename();

  // Try Web Share API with files (iOS native share sheet → "Save Image").
  // IMPORTANT: toBlob must be wrapped in a Promise and awaited — NOT used as a
  // callback — so iOS Safari keeps the user-activation context alive through
  // the async gap. Using canvas.toBlob(callback) breaks the activation chain
  // and causes iOS to skip the share sheet silently.
  if (typeof navigator.share === 'function') {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({ files: [file], title: 'Mishigami Race Card' });
      return; // success — share sheet appeared
    } catch (e) {
      if (e.name === 'AbortError') return; // user dismissed — fine
      console.warn('[Save] Web Share API failed, showing modal fallback:', e.message);
    }
  }

  // Fallback: show full-screen in-app image so user can long-press → Save to Photos.
  // Works on all iOS versions regardless of Web Share API support.
  // On desktop/Android, trigger a traditional file download instead.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    showSaveModal(canvas.toDataURL('image/png'));
  } else {
    triggerDownload(canvas, filename);
  }
}

function triggerDownload(canvas, filename) {
  const a    = document.createElement('a');
  a.download = filename;
  a.href     = canvas.toDataURL('image/png');
  a.click();
}

function showSaveModal(dataUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'save-overlay';
  overlay.innerHTML =
    '<div class="save-modal-inner">' +
      '<p class="save-modal-hint">Long press the image below<br>then tap <strong>Save to Photos</strong></p>' +
      '<img src="' + dataUrl + '" class="save-modal-img" alt="Race Card">' +
      '<button class="save-modal-close">Close</button>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('.save-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Screen transitions ────────────────────────────────────────────────────────

function showBuildScreen(race) {
  state.race  = race;
  state.route = null;

  buildRaceLabel.textContent = ROUTES[race].label;
  screenSelect.classList.remove('active');
  screenBuild.classList.add('active');

  loadRoute(race);
  scheduleRender();
}

function showSelectScreen() {
  state.race = null;
  screenBuild.classList.remove('active');
  screenSelect.classList.add('active');
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.querySelectorAll('.race-card').forEach(btn => {
  btn.addEventListener('click', () => showBuildScreen(btn.dataset.race));
});

btnBack.addEventListener('click', showSelectScreen);

btnGps.addEventListener('click', getLocation);

// Format toggle
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.format = btn.dataset.format;
    const isStory = state.format === 'story';
    previewCanvas.classList.toggle('story', isStory);
    previewWrap.classList.toggle('story', isStory);
    scheduleRender();
  });
});

// Name input
inputName.addEventListener('input', () => {
  state.name = inputName.value;
  scheduleRender();
});

// Manual stat inputs
inputMiles.addEventListener('input', () => {
  const v = parseFloat(inputMiles.value);
  state.miles = isNaN(v) ? null : v;
  // Recompute speed if elapsed is also set
  if (state.miles != null && state.elapsed) {
    const parts = state.elapsed.split(':');
    const hours = parseInt(parts[0]) + parseInt(parts[1] || 0) / 60;
    state.speed = hours > 0 ? state.miles / hours : null;
    if (state.speed) inputSpeed.value = state.speed.toFixed(1);
  }
  // Update progress bar
  if (state.miles != null && state.route) {
    state.progressFraction = state.miles / ROUTES[state.race].totalMi;
  }
  scheduleRender();
});

inputElapsed.addEventListener('input', () => {
  state.elapsed = inputElapsed.value || null;
  // Recompute speed
  if (state.miles != null && state.elapsed && /^\d+:\d{2}$/.test(state.elapsed)) {
    const parts = state.elapsed.split(':');
    const hours = parseInt(parts[0]) + parseInt(parts[1]) / 60;
    state.speed = hours > 0 ? state.miles / hours : null;
    if (state.speed) inputSpeed.value = state.speed.toFixed(1);
  }
  scheduleRender();
});

inputSpeed.addEventListener('input', () => {
  const v = parseFloat(inputSpeed.value);
  state.speed = isNaN(v) ? null : v;
  scheduleRender();
});

// Photo
btnPhoto.addEventListener('click', () => inputPhoto.click());
inputPhoto.addEventListener('change', () => handlePhotoFile(inputPhoto.files[0]));

// Drag-and-drop photo
previewWrap.addEventListener('dragover', e => { e.preventDefault(); previewWrap.classList.add('drag-over'); });
previewWrap.addEventListener('dragleave', () => previewWrap.classList.remove('drag-over'));
previewWrap.addEventListener('drop', e => {
  e.preventDefault();
  previewWrap.classList.remove('drag-over');
  handlePhotoFile(e.dataTransfer.files[0]);
});

// Route map toggle
if (btnMapToggle) {
  btnMapToggle.addEventListener('click', () => {
    state.showMap = !state.showMap;
    btnMapToggle.classList.toggle('active', state.showMap);
    btnMapToggle.textContent = state.showMap ? 'On' : 'Off';
    scheduleRender();
  });
}

// Download
btnDownload.addEventListener('click', downloadCard);

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // Wait for fonts
  await document.fonts.ready;
  state.fontsReady = true;

  // Preload logo
  state.logoImg = await loadLogo();

  // Sync map toggle button to initial state (map is on by default)
  if (btnMapToggle) {
    btnMapToggle.classList.toggle('active', state.showMap);
    btnMapToggle.textContent = state.showMap ? 'On' : 'Off';
  }

  // Kick initial render if a race is already selected (shouldn't happen on load)
  if (state.race) scheduleRender();
}

init();
