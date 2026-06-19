/**
 * renderer.js — Canvas image composition for Mishigami Race Card
 *
 * Draws a branded race card at full 1080×1080 (square) or 1080×1920 (story).
 * Call renderCard() with all needed data; it returns a canvas element.
 */

'use strict';

const Renderer = (() => {

  // MUC brand colors
  const C = {
    bg:         '#051829',             // Dark Navy
    periwinkle: '#0063A0',             // Primary Blue (label / progress bar)
    pink:       '#F49A0B',             // Gold (badge / accent)
    cream:      '#FFFBF8',             // Cream
    cream60:    'rgba(255,251,248,0.6)',
    cream20:    'rgba(255,251,248,0.2)',
    cream10:    'rgba(255,251,248,0.1)',
    dark80:     'rgba(5,24,41,0.82)',   // Dark Navy 80%
    dark95:     'rgba(5,24,41,0.96)',   // Dark Navy 96%
    dark0:      'rgba(5,24,41,0)',
  };

  // Draw photo cover-cropped to fill the canvas
  function drawPhoto(ctx, img, W, H) {
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = img.naturalWidth  * scale;
    const sh = img.naturalHeight * scale;
    const sx = (W - sw) / 2;
    const sy = (H - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh);
  }

  // Gradient overlays (top + bottom bands)
  function drawGradients(ctx, W, H) {
    // Top band — lighter to let more photo through
    const topG = ctx.createLinearGradient(0, 0, 0, H * 0.42);
    topG.addColorStop(0,    'rgba(5,24,41,0.55)');   // was 0.82
    topG.addColorStop(0.6,  'rgba(5,24,41,0.18)');   // was 0.35
    topG.addColorStop(1,    C.dark0);
    ctx.fillStyle = topG;
    ctx.fillRect(0, 0, W, H * 0.42);

    // Bottom band — softened so stats stay legible but gradient is subtler
    const btmG = ctx.createLinearGradient(0, H * 0.52, 0, H);
    btmG.addColorStop(0,   C.dark0);
    btmG.addColorStop(0.4, 'rgba(5,24,41,0.55)');   // was 0.75
    btmG.addColorStop(1,   C.dark80);               // was dark95 (0.96)
    ctx.fillStyle = btmG;
    ctx.fillRect(0, H * 0.52, W, H * 0.48);
  }

  // Draw the Mishigami logo PNG in the top-left
  function drawLogo(ctx, logoImg, W, H) {
    if (!logoImg) return;
    const isStory = H > W;
    // Logo is square (515×515 — stacked M mark + Mishigami wordmark)
    const logoW = W * 0.20;
    const logoH = logoW;             // 1:1 square
    const padX  = W * 0.05;
    // Story: push below Instagram's top UI chrome (~13% from top)
    const padY  = isStory ? H * 0.13 : W * 0.05;
    ctx.drawImage(logoImg, padX, padY, logoW, logoH);
  }

  // Draw race badge top-right
  function drawRaceBadge(ctx, race, W, H) {
    const label    = race === 'mishigami' ? 'MAIN EVENT' : 'MINI-GAMI';
    const fontSize = Math.round(W * 0.021);
    const pad      = W * 0.05;
    const isStory  = H > W;
    // Story: align with logo safe zone
    const topY     = isStory ? H * 0.13 : pad;

    ctx.save();
    ctx.font      = `700 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = C.pink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0.28em';
    ctx.fillText(label, W - pad, topY + 4);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.restore();
  }

  // Draw the stats block in the bottom portion of the card
  function drawStats(ctx, { name, miles, elapsed, speed, progressFraction }, W, H) {
    const pad      = W * 0.05;
    const usableW  = W - pad * 2;
    // Instagram story safe zone: top 13% and bottom 18% covered by UI chrome.
    // Shift all stats up for story format so nothing is clipped.
    const isStory  = H > W;

    // ── Rider name ──────────────────────────────────────
    const nameSize = Math.round(W * 0.058);
    // Story: anchor at ~73% of canvas height.
    // Square: keep existing bottom-anchored position.
    const nameY    = isStory ? H * 0.73 : H - W * 0.285;

    if (name && name.trim()) {
      ctx.save();
      ctx.font         = `800 ${nameSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle    = C.cream;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(name.trim().toUpperCase(), pad, nameY);
      ctx.restore();
    }

    // ── Divider ─────────────────────────────────────────
    const divY = nameY + W * 0.018;
    ctx.save();
    ctx.strokeStyle = C.cream20;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(pad, divY);
    ctx.lineTo(W - pad, divY);
    ctx.stroke();
    ctx.restore();

    // ── Three stat columns ───────────────────────────────
    const stats = [
      { value: miles  != null ? formatMiles(miles)   : '—', label: 'MILES'     },
      { value: elapsed || '—',                               label: 'HOURS'     },
      { value: speed  != null ? formatSpeed(speed)   : '—', label: 'AVG SPEED' },
    ];

    const colW      = usableW / 3;
    const numSize   = Math.round(W * 0.068);
    const lblSize   = Math.round(W * 0.020);
    // Story: tighten stat block spacing so lblY stays within safe zone (≤1574px on 1920px canvas)
    const numY      = divY + (isStory ? W * 0.068 : W * 0.085);
    const lblY      = numY + (isStory ? W * 0.030 : W * 0.038);

    stats.forEach(({ value, label }, i) => {
      const cx = pad + colW * i + colW / 2;

      // Vertical separator (between columns)
      if (i > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,251,248,0.12)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(pad + colW * i, divY + W * 0.012);
        ctx.lineTo(pad + colW * i, lblY + lblSize * 0.4);
        ctx.stroke();
        ctx.restore();
      }

      // Stat value (large)
      ctx.save();
      ctx.font         = `700 ${numSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle    = C.cream;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, cx, numY);
      ctx.restore();

      // Stat label (small, spaced)
      ctx.save();
      ctx.font         = `600 ${lblSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillStyle    = C.periwinkle;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0.22em';
      ctx.fillText(label, cx, lblY);
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
      ctx.restore();
    });

    // ── Website watermark ────────────────────────────────
    const wtmkSize = Math.round(W * 0.016);
    // Story: keep watermark in safe zone (77% of canvas height ≈ 1478px on 1920).
    // Square: existing bottom position.
    const wtmkY    = isStory ? H * 0.80 : H - W * 0.038;
    ctx.save();
    ctx.font         = `400 ${wtmkSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle    = 'rgba(0,99,160,0.50)';    // Primary Blue 50%
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0.12em';
    ctx.fillText('MIDWESTULTRACYCLING.COM', W / 2, wtmkY);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.restore();

    // ── Progress bar ─────────────────────────────────────
    const barH   = 5;
    const prog   = Math.max(0, Math.min(1, progressFraction || 0));
    // Story: anchor bar at 80% of canvas (≈1536px on 1920) — within safe zone.
    // Square: keep at very bottom.
    const barTop = isStory ? Math.round(H * 0.82) - barH : H - barH;
    ctx.save();
    ctx.fillStyle = 'rgba(255,251,248,0.08)';
    ctx.fillRect(0, barTop, W, barH);
    if (prog > 0) {
      ctx.fillStyle = C.periwinkle;
      ctx.fillRect(0, barTop, W * prog, barH);
    }
    ctx.restore();
  }

  // Draw mini route-progress map in top-right corner (below race badge)
  function drawRouteMap(ctx, route, progressFraction, W, H) {
    if (!route || route.length < 2) return;
    const isStory = H > W;

    // ── Panel geometry ────────────────────────────────────────────────────────
    const mapSz  = Math.round(W * 0.22);   // square panel
    const pad    = W * 0.05;
    const inner  = 8;                       // padding inside panel
    // Position: top-right, below the race badge text
    const badgeH = Math.round(W * 0.021) + 20;   // badge font + gap
    const panelTopY = isStory ? H * 0.13 : pad;
    const mapX   = W - pad - mapSz;
    const mapY   = panelTopY + badgeH;

    // ── Background panel (rounded rect) ──────────────────────────────────────
    const px = mapX - inner, py = mapY - inner;
    const pw = mapSz + inner * 2, ph = mapSz + inner * 2;
    const rr = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(5,24,41,0.78)';
    ctx.beginPath();
    ctx.moveTo(px + rr, py);
    ctx.lineTo(px + pw - rr, py);
    ctx.arcTo(px + pw, py,      px + pw, py + rr,      rr);
    ctx.lineTo(px + pw, py + ph - rr);
    ctx.arcTo(px + pw, py + ph, px + pw - rr, py + ph, rr);
    ctx.lineTo(px + rr, py + ph);
    ctx.arcTo(px,       py + ph, px, py + ph - rr,     rr);
    ctx.lineTo(px, py + rr);
    ctx.arcTo(px,       py,      px + rr, py,           rr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Sample route (up to ~300 points for performance) ─────────────────────
    const step = Math.max(1, Math.floor(route.length / 300));
    const sampled = [];
    for (let i = 0; i < route.length; i += step) sampled.push(route[i]);
    const lastPt = route[route.length - 1];
    if (sampled[sampled.length - 1] !== lastPt) sampled.push(lastPt);

    // ── Bounding box ──────────────────────────────────────────────────────────
    let minLat = sampled[0][0], maxLat = sampled[0][0];
    let minLng = sampled[0][1], maxLng = sampled[0][1];
    for (const pt of sampled) {
      if (pt[0] < minLat) minLat = pt[0]; if (pt[0] > maxLat) maxLat = pt[0];
      if (pt[1] < minLng) minLng = pt[1]; if (pt[1] > maxLng) maxLng = pt[1];
    }
    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    // ── Mercator-aware aspect: scale to fit within the square panel ───────────
    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos(midLat * Math.PI / 180);
    const lngKm  = lngRange * 111 * cosLat;
    const latKm  = latRange * 111;

    let drawW, drawH, offX, offY;
    if (lngKm >= latKm) {
      drawW = mapSz;
      drawH = Math.round(mapSz * latKm / lngKm);
      offX  = mapX;
      offY  = mapY + (mapSz - drawH) / 2;
    } else {
      drawH = mapSz;
      drawW = Math.round(mapSz * lngKm / latKm);
      offX  = mapX + (mapSz - drawW) / 2;
      offY  = mapY;
    }

    // ── Project to canvas coordinates ─────────────────────────────────────────
    const toX = lng => offX + ((lng - minLng) / lngRange) * drawW;
    const toY = lat => offY + drawH - ((lat - minLat) / latRange) * drawH;
    const pts = sampled.map(([lat, lng]) => [toX(lng), toY(lat)]);

    // Split index: fraction of sampled points = fraction of route covered
    const splitIdx = Math.round(progressFraction * (pts.length - 1));

    // ── Draw full route (faint cream) ─────────────────────────────────────────
    const lw = Math.max(1.5, W * 0.0019);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,251,248,0.28)';
    ctx.lineWidth   = lw;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.stroke();
    ctx.restore();

    // ── Draw completed portion (gold) ─────────────────────────────────────────
    if (splitIdx > 1) {
      ctx.save();
      ctx.strokeStyle = C.pink;   // #F49A0B gold
      ctx.lineWidth   = lw + 0.5;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.beginPath();
      pts.slice(0, splitIdx + 1).forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
      ctx.restore();
    }

    // ── Start dot ─────────────────────────────────────────────────────────────
    {
      const [sx, sy] = pts[0];
      ctx.save();
      ctx.fillStyle = 'rgba(255,251,248,0.45)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, W * 0.0028), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Current position dot (gold glow) ─────────────────────────────────────
    if (splitIdx > 0) {
      const [dx, dy] = pts[Math.min(splitIdx, pts.length - 1)];
      const dotR = Math.max(3, W * 0.0038);
      const grd  = ctx.createRadialGradient(dx, dy, 0, dx, dy, dotR * 3.5);
      grd.addColorStop(0, 'rgba(244,154,11,0.65)');
      grd.addColorStop(1, 'rgba(244,154,11,0)');
      ctx.save();
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR * 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = C.pink;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Film-grain overlay using random noise
  function drawGrain(ctx, W, H) {
    const off = document.createElement('canvas');
    off.width  = W;
    off.height = H;
    const octx = off.getContext('2d');
    const img  = octx.createImageData(W, H);
    const d    = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255 | 0;
      d[i] = d[i+1] = d[i+2] = v;
      d[i+3] = 28; // very low opacity
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  }

  // Format helpers
  function formatMiles(m)  { return Number(m).toFixed(1); }
  function formatSpeed(s)  { return Number(s).toFixed(1); }

  /**
   * Main render function.
   * @param {object} opts
   *   race            'mishigami' | 'mini-gami'
   *   photo           HTMLImageElement | null
   *   name            string
   *   miles           number | null
   *   elapsed         string (e.g. "38:24") | null
   *   speed           number | null
   *   progressFraction 0–1
   *   format          'square' | 'story'
   *   logoImg         HTMLImageElement (pre-loaded)
   * @returns HTMLCanvasElement
   */
  function renderCard(opts) {
    const { race, photo, name, miles, elapsed, speed, progressFraction, format, logoImg, route, showMap } = opts;
    const W = 1080;
    const H = format === 'story' ? 1920 : 1080;

    const canvas    = document.createElement('canvas');
    canvas.width    = W;
    canvas.height   = H;
    const ctx       = canvas.getContext('2d');

    // 1. Dark base (visible if no photo)
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 2. Photo
    if (photo) drawPhoto(ctx, photo, W, H);

    // 3. Gradient overlays
    drawGradients(ctx, W, H);

    // 4. Logo + badge
    drawLogo(ctx, logoImg, W, H);
    drawRaceBadge(ctx, race, W, H);

    // 4.5 Route map (optional — rendered in top-right branding zone)
    if (showMap && route) {
      try {
        drawRouteMap(ctx, route, progressFraction, W, H);
      } catch (e) {
        console.error('drawRouteMap error:', e);
      }
    }

    // 5. Stats
    drawStats(ctx, { name, miles, elapsed, speed, progressFraction }, W, H);

    // 6. Grain (last, composited over everything)
    drawGrain(ctx, W, H);

    return canvas;
  }

  return { renderCard };
})();
