/**
 * exif.js — minimal, dependency-free EXIF reader for the Mishigami Race Card.
 *
 * Exposes a single global:  EXIF.read(arrayBuffer)  →  {
 *   isJpeg, hasExif,
 *   lat, lon,                 // decimal degrees (or undefined)
 *   dateTimeOriginal,         // "YYYY:MM:DD HH:MM:SS" string (or undefined)
 *   make, model               // camera strings (or undefined)
 * }
 *
 * Reads only what we need: JPEG APP1 → TIFF → IFD0 / GPS IFD / EXIF SubIFD.
 * Verified against real iPhone library photos during the Phase 2 spike.
 */
(function (global) {
  'use strict';

  function read(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) {
      return { isJpeg: false, hasExif: false };
    }
    // Walk JPEG markers to find APP1 (0xFFE1) carrying "Exif\0\0"
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        const segStart = offset + 4;
        if (view.getUint32(segStart) === 0x45786966 /* "Exif" */) {
          return parseTiff(view, segStart + 6); // skip "Exif\0\0"
        }
        return { isJpeg: true, hasExif: false };
      }
      if ((marker & 0xFF00) !== 0xFF00) break; // not a marker — bail
      if (marker === 0xFFDA) break;            // start of scan — no more headers
      offset += 2 + view.getUint16(offset + 2);
    }
    return { isJpeg: true, hasExif: false };
  }

  function parseTiff(view, tiffStart) {
    const byteOrder = view.getUint16(tiffStart);
    const little = byteOrder === 0x4949; // "II"
    if (!little && byteOrder !== 0x4D4D) return { isJpeg: true, hasExif: false };
    const g16 = o => view.getUint16(o, little);
    const g32 = o => view.getUint32(o, little);

    const out = { isJpeg: true, hasExif: true };
    const ifd0 = tiffStart + g32(tiffStart + 4);
    let gpsPtr = null, exifPtr = null;

    readIfd(view, ifd0, g16, g32, (tag, type, count, valOff) => {
      if (tag === 0x8825) gpsPtr  = tiffStart + g32(valOff);
      if (tag === 0x8769) exifPtr = tiffStart + g32(valOff);
      if (tag === 0x010F) out.make  = readAscii(view, type, count, valOff, tiffStart, g32);
      if (tag === 0x0110) out.model = readAscii(view, type, count, valOff, tiffStart, g32);
    });

    if (exifPtr) {
      readIfd(view, exifPtr, g16, g32, (tag, type, count, valOff) => {
        if (tag === 0x9003) out.dateTimeOriginal   = readAscii(view, type, count, valOff, tiffStart, g32); // local time, no tz
        if (tag === 0x9011) out.offsetTimeOriginal = readAscii(view, type, count, valOff, tiffStart, g32); // e.g. "-04:00"
      });
    }

    if (gpsPtr) {
      let latRef, lat, lonRef, lon, gpsTime, gpsDate;
      readIfd(view, gpsPtr, g16, g32, (tag, type, count, valOff) => {
        if (tag === 0x0001) latRef  = readAscii(view, type, count, valOff, tiffStart, g32);
        if (tag === 0x0002) lat     = readRationals(view, valOff, count, tiffStart, little, g32);
        if (tag === 0x0003) lonRef  = readAscii(view, type, count, valOff, tiffStart, g32);
        if (tag === 0x0004) lon     = readRationals(view, valOff, count, tiffStart, little, g32);
        if (tag === 0x0007) gpsTime = readRationals(view, valOff, count, tiffStart, little, g32); // [h,m,s] UTC
        if (tag === 0x001D) gpsDate = readAscii(view, type, count, valOff, tiffStart, g32);        // "YYYY:MM:DD" UTC
      });
      if (lat && lon) {
        out.lat = dms(lat, latRef, 'S');
        out.lon = dms(lon, lonRef, 'W');
      }
      // GPS timestamp is already UTC — the timezone-proof source of truth.
      if (gpsDate && gpsTime && gpsTime.length === 3) {
        const dm = /^(\d{4}):(\d{2}):(\d{2})/.exec(gpsDate);
        if (dm) {
          out.gpsTimestampMs = Date.UTC(
            +dm[1], +dm[2] - 1, +dm[3],
            Math.floor(gpsTime[0]), Math.floor(gpsTime[1]), Math.floor(gpsTime[2])
          );
        }
      }
    }
    return out;
  }

  function readIfd(view, ifd, g16, g32, cb) {
    const n = g16(ifd);
    for (let i = 0; i < n; i++) {
      const entry = ifd + 2 + i * 12;
      cb(g16(entry), g16(entry + 2), g32(entry + 4), entry + 8);
    }
  }

  function readAscii(view, type, count, valOff, tiffStart, g32) {
    if (type !== 2) return undefined;
    const dataOff = count > 4 ? tiffStart + g32(valOff) : valOff;
    let s = '';
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(dataOff + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  function readRationals(view, valOff, count, tiffStart, little, g32) {
    // 3 RATIONALs (deg, min, sec) never fit in 4 bytes → always a pointer
    const dataOff = tiffStart + g32(valOff);
    const vals = [];
    for (let i = 0; i < count; i++) {
      const num = view.getUint32(dataOff + i * 8, little);
      const den = view.getUint32(dataOff + i * 8 + 4, little);
      vals.push(den ? num / den : 0);
    }
    return vals;
  }

  function dms(parts, ref, negRef) {
    const dec = parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
    return (ref === negRef || ref === '-') ? -dec : dec;
  }

  global.EXIF = { read };
})(window);
