# Sail Remote – Wind-Grid (kostenlose Lösung)

Der Client lädt **fertige** Winddaten von einer URL.  
Ein kostenloser Job (GitHub Actions) aktualisiert die Datei etwa **stündlich** über Open-Meteo.

## 1. Repo anlegen (einmalig)

1. Neues **öffentliches** GitHub-Repository, z. B. `sail-remote-wind`
2. Diese Dateien hineinkopieren:
   - `update-wind-grid.mjs`
   - `.github/workflows/update-wind.yml`
   - Ordner `public/` (kann leer starten)
3. **GitHub Pages** aktivieren:  
   Settings → Pages → Source: **Deploy from branch** → Branch `main` → Folder `/public`
4. Actions → Workflow **Update Wind Grid** → **Run workflow** (erster Lauf)

Nach dem Lauf erreichbar unter:

```text
https://DEIN-USER.github.io/sail-remote-wind/world.json
```

## 2. Im Spiel eintragen

In `sail-remote-v2.html` die URL setzen:

```js
const WIND_GRID_URL = 'https://DEIN-USER.github.io/sail-remote-wind/world.json';
```

Leer lassen (`''`) = nur Modell (wie bisher).

## 3. Lokal testen

```bash
node update-wind-grid.mjs
# → public/world.json
```

## Kosten

| Teil | Preis |
|------|--------|
| Open-Meteo | gratis (Fair Use) |
| GitHub Actions | gratis für öffentliche Repos |
| GitHub Pages | gratis |

Später: dieselbe `world.json` auf deinen gemieteten Server legen – Client-URL ändern, fertig.

## Format `world.json`

```json
{
  "updated": "2026-08-23T14:15:00.000Z",
  "source": "open-meteo",
  "unit": "kn",
  "points": [
    { "lat": 54.5, "lon": 10.2, "speed": 18.2, "dir": 270 }
  ]
}
```
