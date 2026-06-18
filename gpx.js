/**
 * gpx.js — Route engine for Mishigami Race Card
 * Loads pre-processed route JSON and snaps a GPS position to the route
 * to calculate miles from start.
 */

'use strict';

const GPX = (() => {

  // Haversine distance in meters
  function distM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  /**
   * Snap a GPS position to the nearest point on the route polyline.
   * route: array of [lat, lng, cumulativeMiles]
   * Returns { distanceMiles, progressFraction, offRouteMeters }
   */
  function snap(userLat, userLng, route) {
    let minDistM = Infinity;
    let bestMiles = 0;

    for (let i = 0; i < route.length - 1; i++) {
      const [lat1, lng1, d1] = route[i];
      const [lat2, lng2, d2] = route[i + 1];

      // Project user onto segment using dot product in lat/lng space
      // (valid for small segments — max ~0.5km between sampled points)
      const dx = lat2 - lat1;
      const dy = lng2 - lng1;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = ((userLat - lat1) * dx + (userLng - lng1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }

      const cLat = lat1 + t * dx;
      const cLng = lng1 + t * dy;
      const dM = distM(userLat, userLng, cLat, cLng);

      if (dM < minDistM) {
        minDistM = dM;
        bestMiles = d1 + t * (d2 - d1);
      }
    }

    const totalMiles = route[route.length - 1][2];
    return {
      distanceMiles: bestMiles,
      progressFraction: bestMiles / totalMiles,
      offRouteMeters: minDistM
    };
  }

  /**
   * Load a route. Checks the bundled ROUTE_DATA global first (works as a
   * local file:// without a server), then falls back to fetch() when served
   * over HTTP (e.g. GitHub Pages).
   * Route data is an array of [lat, lng, cumulativeMiles].
   */
  function load(url) {
    // url is like 'routes/mishigami.json' — extract the race key from the filename
    const key = url.replace('routes/', '').replace('.json', '');
    if (typeof ROUTE_DATA !== 'undefined' && ROUTE_DATA[key]) {
      return Promise.resolve(ROUTE_DATA[key]);
    }
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load route: ${url}`);
      return r.json();
    });
  }

  return { snap, load, distM };
})();
