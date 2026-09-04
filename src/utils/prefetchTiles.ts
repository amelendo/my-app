// src/utils/prefetchTiles.ts
// Pré-téléchargement des tuiles de carte pour l'usage hors-ligne.
//
// Principe : on ne reconstruit PAS les URLs de tuiles à la main (fragile avec
// les tuiles vectorielles Mapbox). On crée une carte cachée et on la déplace
// sur chaque tuile ciblée : GL demande alors lui-même les bonnes tuiles, que
// le service worker (workbox) met en cache.
//
// Trois modes de ciblage :
//   - prefetchArea   : corridor autour d'une trace GPX
//   - prefetchBounds : rectangle (zone visible sur la carte)
//   - gridAround     : disque autour d'une position (via prefetchArea)

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

export interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

interface Job {
  z: number;
  lng: number;
  lat: number;
}

export interface PrefetchResult {
  done: number;
  total: number;
  aborted: boolean;
  capped: boolean;
}

interface DriveOptions {
  token: string;
  style: string;
  maxTiles?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/* ---------- Génération des tuiles cibles ---------- */
function tilesFromPoints(points: TrackPoint[], zooms: number[]): Set<string> {
  const set = new Set<string>();
  for (const z of zooms) {
    for (const p of points) {
      const tx = lngToTileX(p.lon, z);
      const ty = latToTileY(p.lat, z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) set.add(`${z}/${tx + dx}/${ty + dy}`);
    }
  }
  return set;
}

function tilesFromBounds(b: Bounds, zooms: number[]): Set<string> {
  const set = new Set<string>();
  for (const z of zooms) {
    const xMin = lngToTileX(b.west, z);
    const xMax = lngToTileX(b.east, z);
    const yMin = latToTileY(b.north, z); // le nord a le plus petit y
    const yMax = latToTileY(b.south, z);
    for (let x = xMin; x <= xMax; x++)
      for (let y = yMin; y <= yMax; y++) set.add(`${z}/${x}/${y}`);
  }
  return set;
}

function setToJobs(set: Set<string>): Job[] {
  return [...set].map((key) => {
    const [z, x, y] = key.split("/").map(Number);
    return { z, lng: tileXToLng(x + 0.5, z), lat: tileYToLat(y + 0.5, z) };
  });
}

/* ---------- Estimation (avant lancement) ---------- */
export interface Estimate {
  tiles: number;
  megabytes: number; // approximation
  minutes: number; // approximation
}

const AVG_TILE_KB = 45; // ordre de grandeur d'une tuile vectorielle
const SEC_PER_TILE = 0.45; // temps moyen par déplacement

export function estimateBounds(b: Bounds, zooms: number[]): Estimate {
  const tiles = tilesFromBounds(b, zooms).size;
  return {
    tiles,
    megabytes: Math.round((tiles * AVG_TILE_KB) / 1024),
    minutes: Math.max(1, Math.round((tiles * SEC_PER_TILE) / 60)),
  };
}

/* ---------- Cœur : pilote la carte cachée ---------- */
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

async function driveJobs(
  jobs: Job[],
  opts: DriveOptions
): Promise<PrefetchResult> {
  const { token, style, maxTiles = 4000, onProgress, signal } = opts;
  const capped = jobs.length > maxTiles;
  if (capped) jobs = jobs.slice(0, maxTiles);
  const total = jobs.length;

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

/* ---------- API publique ---------- */
export interface PrefetchAreaOptions extends DriveOptions {
  points: TrackPoint[];
  zooms?: number[];
}
export function prefetchArea(opts: PrefetchAreaOptions): Promise<PrefetchResult> {
  const jobs = setToJobs(tilesFromPoints(opts.points, opts.zooms ?? [13, 14, 15]));
  return driveJobs(jobs, opts);
}

export interface PrefetchBoundsOptions extends DriveOptions {
  bounds: Bounds;
  zooms?: number[];
}
export function prefetchBounds(
  opts: PrefetchBoundsOptions
): Promise<PrefetchResult> {
  const jobs = setToJobs(tilesFromBounds(opts.bounds, opts.zooms ?? [13, 14, 15]));
  return driveJobs(jobs, opts);
}

/**
 * Grille de points couvrant un carré autour d'un centre
 * (pré-téléchargement "autour de ma position").
 */
export function gridAround(
  center: { lat: number; lon: number },
  radiusKm = 3,
  stepKm = 0.8
): TrackPoint[] {
  const dLat = stepKm / 111;
  const dLon = stepKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  const steps = Math.ceil(radiusKm / stepKm);
  const points: TrackPoint[] = [];
  for (let i = -steps; i <= steps; i++)
    for (let j = -steps; j <= steps; j++)
      points.push({ lat: center.lat + i * dLat, lon: center.lon + j * dLon });
  return points;
}
