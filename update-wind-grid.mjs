/**
 * Sail Remote – Wind-Grid Updater (kostenlos / Open-Meteo)
 *
 * Erzeugt world.json mit echten Windwerten für die Weltkarte.
 * Läuft lokal oder per GitHub Action (stündlich).
 *
 * Raster: 48×32 = 1536 Punkte (Stürme besser sichtbar)
 * Inkl. Böen (wind_gusts_10m)
 *
 * Nutzung lokal:
 *   node update-wind-grid.mjs
 * Ausgabe: ./public/world.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'public');
const OUT_FILE = path.join(OUT_DIR, 'world.json');

// Dichteres Raster – Südlicher Ozean / Stürme besser abgedeckt
const COLS = 48;
const ROWS = 32;
const LAT_MIN = -70;
const LAT_MAX = 75;
const LON_MIN = -180;
const LON_MAX = 180;
const BATCH = 60; // etwas kleiner = stabilere Requests
const PAUSE_MS = 500;

function buildPoints() {
  const pts = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const lat = LAT_MIN + (LAT_MAX - LAT_MIN) * (r + 0.5) / ROWS;
      const lon = LON_MIN + (LON_MAX - LON_MIN) * (c + 0.5) / COLS;
      pts.push({
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100
      });
    }
  }
  return pts;
}

function parsePoint(p, cur) {
  const speed = Number(cur.wind_speed_10m);
  const dir = Number(cur.wind_direction_10m);
  const gust = Number(cur.wind_gusts_10m);
  return {
    lat: p.lat,
    lon: p.lon,
    speed: Number.isFinite(speed) ? speed : null,
    dir: Number.isFinite(dir) ? dir : null,
    gust: Number.isFinite(gust) ? gust : null
  };
}

async function fetchBatch(batch) {
  const lats = batch.map((p) => p.lat).join(',');
  const lons = batch.map((p) => p.lon).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'API error');

  if (Array.isArray(data)) {
    return batch.map((p, i) => parsePoint(p, (data[i] && data[i].current) || {}));
  }
  if (data.current) {
    // Manche Antworten: current.* als Arrays
    if (Array.isArray(data.current.wind_speed_10m)) {
      return batch.map((p, i) =>
        parsePoint(p, {
          wind_speed_10m: data.current.wind_speed_10m[i],
          wind_direction_10m: data.current.wind_direction_10m[i],
          wind_gusts_10m: data.current.wind_gusts_10m
            ? data.current.wind_gusts_10m[i]
            : null
        })
      );
    }
    return batch.map((p) => parsePoint(p, data.current));
  }
  throw new Error('Unerwartetes API-Format');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const pts = buildPoints();
  console.log(`Punkte: ${pts.length} (${COLS}×${ROWS})`);
  const results = [];

  for (let i = 0; i < pts.length; i += BATCH) {
    const batch = pts.slice(i, i + BATCH);
    const n = Math.floor(i / BATCH) + 1;
    const total = Math.ceil(pts.length / BATCH);
    process.stdout.write(`Batch ${n}/${total} (${batch.length} Orte)… `);
    try {
      const part = await fetchBatch(batch);
      results.push(...part);
      const ok = part.filter((p) => p.speed != null).length;
      console.log(`ok (${ok}/${part.length})`);
    } catch (e) {
      console.log('FEHLER:', e.message);
      results.push(
        ...batch.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          speed: null,
          dir: null,
          gust: null
        }))
      );
    }
    if (i + BATCH < pts.length) await sleep(PAUSE_MS);
  }

  const valid = results.filter((p) => p.speed != null);
  const payload = {
    updated: new Date().toISOString(),
    source: 'open-meteo',
    unit: 'kn',
    cols: COLS,
    rows: ROWS,
    count: results.length,
    valid: valid.length,
    points: results
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`Geschrieben: ${OUT_FILE}`);
  console.log(`Gültig: ${valid.length}/${results.length}`);
  if (valid.length) {
    const speeds = valid.map((p) => p.speed);
    const gusts = valid.map((p) => p.gust).filter((g) => g != null);
    console.log(
      `Wind: ${Math.min(...speeds).toFixed(0)}–${Math.max(...speeds).toFixed(0)} kn`
    );
    if (gusts.length) {
      console.log(
        `Böen: ${Math.min(...gusts).toFixed(0)}–${Math.max(...gusts).toFixed(0)} kn`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
