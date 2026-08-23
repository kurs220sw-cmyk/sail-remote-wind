/**
 * Sail Remote – Wellen-Grid Updater (Open-Meteo Marine)
 * Erzeugt public/waves.json (48×32, Höhe + Richtung + Periode + Dünung)
 *
 *   node update-waves-grid.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'public');
const OUT_FILE = path.join(OUT_DIR, 'waves.json');

const COLS = 48;
const ROWS = 32;
const LAT_MIN = -70;
const LAT_MAX = 75;
const LON_MIN = -180;
const LON_MAX = 180;
const BATCH = 50;
const PAUSE_MS = 550;

function buildPoints() {
  const pts = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const lat = LAT_MIN + ((LAT_MAX - LAT_MIN) * (r + 0.5)) / ROWS;
      const lon = LON_MIN + ((LON_MAX - LON_MIN) * (c + 0.5)) / COLS;
      pts.push({
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100
      });
    }
  }
  return pts;
}

function parsePoint(p, cur) {
  const h = Number(cur.wave_height);
  const d = Number(cur.wave_direction);
  const per = Number(cur.wave_period);
  const sw = Number(cur.swell_wave_height);
  return {
    lat: p.lat,
    lon: p.lon,
    height: Number.isFinite(h) ? h : null,
    dir: Number.isFinite(d) ? d : null,
    period: Number.isFinite(per) ? per : null,
    swell: Number.isFinite(sw) ? sw : null
  };
}

async function fetchBatch(batch) {
  const lats = batch.map((p) => p.lat).join(',');
  const lons = batch.map((p) => p.lon).join(',');
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&current=wave_height,wave_direction,wave_period,swell_wave_height`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'API error');

  if (Array.isArray(data)) {
    return batch.map((p, i) => parsePoint(p, (data[i] && data[i].current) || {}));
  }
  if (data.current) {
    if (Array.isArray(data.current.wave_height)) {
      return batch.map((p, i) =>
        parsePoint(p, {
          wave_height: data.current.wave_height[i],
          wave_direction: data.current.wave_direction
            ? data.current.wave_direction[i]
            : null,
          wave_period: data.current.wave_period
            ? data.current.wave_period[i]
            : null,
          swell_wave_height: data.current.swell_wave_height
            ? data.current.swell_wave_height[i]
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
  console.log(`Wellen-Punkte: ${pts.length} (${COLS}×${ROWS})`);
  const results = [];

  for (let i = 0; i < pts.length; i += BATCH) {
    const batch = pts.slice(i, i + BATCH);
    const n = Math.floor(i / BATCH) + 1;
    const total = Math.ceil(pts.length / BATCH);
    process.stdout.write(`Batch ${n}/${total}… `);
    try {
      const part = await fetchBatch(batch);
      results.push(...part);
      const ok = part.filter((p) => p.height != null).length;
      console.log(`ok (${ok}/${part.length})`);
    } catch (e) {
      console.log('FEHLER:', e.message);
      results.push(
        ...batch.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          height: null,
          dir: null,
          period: null,
          swell: null
        }))
      );
    }
    if (i + BATCH < pts.length) await sleep(PAUSE_MS);
  }

  const valid = results.filter((p) => p.height != null);
  const payload = {
    updated: new Date().toISOString(),
    source: 'open-meteo-marine',
    unit: 'm',
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
    const hs = valid.map((p) => p.height);
    console.log(`Wellen: ${Math.min(...hs).toFixed(1)}–${Math.max(...hs).toFixed(1)} m`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
