/**
 * Sail Remote – Wind-Grid Updater (kostenlos / Open-Meteo)
 *
 * Erzeugt world.json mit echten Windwerten für die Weltkarte.
 * Läuft lokal oder per GitHub Action (stündlich).
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

// Raster grob wie Spiel-Weltkarte (etwas dichter für Interpolation)
const COLS = 24;
const ROWS = 16;
const LAT_MIN = -60;
const LAT_MAX = 75;
const LON_MIN = -180;
const LON_MAX = 180;
const BATCH = 80; // Orte pro Open-Meteo-Request
const PAUSE_MS = 400;

function buildPoints() {
  const pts = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const lat = LAT_MIN + (LAT_MAX - LAT_MIN) * (r + 0.5) / ROWS;
      const lon = LON_MIN + (LON_MAX - LON_MIN) * (c + 0.5) / COLS;
      pts.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
    }
  }
  return pts;
}

async function fetchBatch(batch) {
  const lats = batch.map((p) => p.lat).join(',');
  const lons = batch.map((p) => p.lon).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'API error');

  // Multi-location: Array von Objekten
  if (Array.isArray(data)) {
    return batch.map((p, i) => {
      const cur = (data[i] && data[i].current) || {};
      return {
        lat: p.lat,
        lon: p.lon,
        speed: Number(cur.wind_speed_10m) || 0,
        dir: Number(cur.wind_direction_10m) || 0
      };
    });
  }
  // Einzelobjekt-Fallback
  if (data.current) {
    return batch.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      speed: Number(data.current.wind_speed_10m) || 0,
      dir: Number(data.current.wind_direction_10m) || 0
    }));
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
      console.log('ok');
    } catch (e) {
      console.log('FEHLER:', e.message);
      // Fallback: leere Werte, Client nutzt Modell
      results.push(
        ...batch.map((p) => ({ lat: p.lat, lon: p.lon, speed: null, dir: null }))
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
    console.log(
      `Wind: ${Math.min(...speeds).toFixed(0)}–${Math.max(...speeds).toFixed(0)} kn`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
