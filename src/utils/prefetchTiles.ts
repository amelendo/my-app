// src/utils/prefetchTiles.ts
// Pré-téléchargement des tuiles de carte pour l'usage hors-ligne.
//
// Principe : on ne reconstruit PAS les URLs de tuiles à la main (fragile avec
// les tuiles vectorielles Mapbox). On crée une carte Mapbox cachée et on la
// déplace sur chaque tuile d'un corridor autour de la trace : GL demande alors
// lui-même les bonnes tuiles, que le service worker (workbox) met en cache.
//
// Limites assumées : ce n'est pas l'offline "officiel" de Mapbox (SDK natif).
// C'est un préchauffage best-effort du cache. Une grande zone = gros volume.

import mapboxgl from "mapbox-gl";
import type { TrackPoint } from "@/utils/gpxParser";

/* ---------- Maths "slippy tiles" ---------- */
function lngToTileX(lng: number, z: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
}
function tileXToLng(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function tileYToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface PrefetchOptions {
  token: string;
  style: string;
  points: TrackPoint[];
  zooms?: number[];
  /** Sécurité : nombre max de positions visitées. */
  maxTiles?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface PrefetchResult {
  done: number;
  total: number;
  aborted: boolean;
  capped: boolean;
}

/** Attend que la carte ait fini de charger ses tuiles, avec un plafond de temps. */
function waitIdle(map: mapboxgl.Map, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      map.off("idle", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    map.on("idle", finish);
  });
}

export async function prefetchArea(
  opts: PrefetchOptions
): Promise<PrefetchResult> {
  const {
    token,
    style,
    points,
    zooms = [13, 14, 15],
    maxTiles = 1500,
    onProgress,
    signal,
  } = opts;

  // Corridor de tuiles autour de la trace (tuile de chaque point + voisines)
  const set = new Set<string>();
  for (const z of zooms) {
    for (const p of points) {
      const tx = lngToTileX(p.lon, z);
      const ty = latToTileY(p.lat, z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          set.add(`${z}/${tx + dx}/${ty + dy}`);
        }
      }
    }
  }

  let jobs = [...set].map((key) => {
    const [z, x, y] = key.split("/").map(Number);
    return { z, lng: tileXToLng(x + 0.5, z), lat: tileYToLat(y + 0.5, z) };
  });

  const capped = jobs.length > maxTiles;
  if (capped) jobs = jobs.slice(0, maxTiles);
  const total = jobs.length;

  // Carte cachée hors écran
  mapboxgl.accessToken = token;
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;width:512px;height:512px;pointer-events:none;";
  document.body.appendChild(container);

  const map = new mapboxgl.Map({
    container,
    style,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });

  const cleanup = () => {
    try {
      map.remove();
    } catch {
      /* ignore */
    }
    container.remove();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      map.once("load", () => resolve());
      map.once("error", (e) => reject(e?.error ?? new Error("Erreur carte")));
    });

    let done = 0;
    for (const job of jobs) {
      if (signal?.aborted) return { done, total, aborted: true, capped };
      map.jumpTo({ center: [job.lng, job.lat], zoom: job.z });
      await waitIdle(map, 4000);
      done++;
      onProgress?.(done, total);
    }
    return { done, total, aborted: false, capped };
  } finally {
    cleanup();
  }
}
