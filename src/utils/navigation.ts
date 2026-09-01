// src/utils/navigation.ts
// Aides à la navigation sur une trace GPX importée :
// point le plus proche, distance restante, détection "hors trace".

import type { TrackPoint } from "@/utils/gpxParser";

export interface NavInfo {
  nearestIndex: number;      // index du point de trace le plus proche
  distanceToTrackM: number;  // écart latéral à la trace (m)
  remainingKm: number;       // distance restante jusqu'à l'arrivée (km)
  progressRatio: number;     // 0 → 1 (avancement sur la trace)
  currentCumDist: number;    // distance cumulée au point le plus proche (km)
  offTrack: boolean;         // true si écart > seuil
}

const OFF_TRACK_THRESHOLD_M = 40;

export function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const f1 = (a.lat * Math.PI) / 180;
  const f2 = (b.lat * Math.PI) / 180;
  const df = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/**
 * Calcule les informations de navigation pour une position donnée.
 *
 * `searchFrom` permet une recherche fenêtrée autour du dernier index connu
 * (bien plus rapide qu'un balayage complet sur une longue trace). En cas
 * d'écart important, on retombe sur un balayage complet pour se re-caler.
 */
export function computeNavInfo(
  position: TrackPoint,
  track: TrackPoint[],
  searchFrom = 0
): NavInfo | null {
  if (track.length === 0) return null;

  const totalKm = track[track.length - 1].cumDist ?? 0;

  const scan = (start: number, end: number) => {
    let bestIdx = start;
    let bestDist = Infinity;
    for (let i = start; i < end; i++) {
      const d = distanceMeters(position, track[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return { bestIdx, bestDist };
  };

  // Recherche fenêtrée autour du dernier point
  const WINDOW = 150;
  const lo = Math.max(0, searchFrom - WINDOW);
  const hi = Math.min(track.length, searchFrom + WINDOW);
  let { bestIdx, bestDist } = scan(lo, hi);

  // Re-calage complet si on semble avoir quitté la fenêtre
  if (bestDist > OFF_TRACK_THRESHOLD_M) {
    const full = scan(0, track.length);
    if (full.bestDist < bestDist) {
      bestIdx = full.bestIdx;
      bestDist = full.bestDist;
    }
  }

  const currentCumDist = track[bestIdx].cumDist ?? 0;
  const remainingKm = Math.max(0, totalKm - currentCumDist);

  return {
    nearestIndex: bestIdx,
    distanceToTrackM: bestDist,
    remainingKm,
    progressRatio: totalKm > 0 ? currentCumDist / totalKm : 0,
    currentCumDist,
    offTrack: bestDist > OFF_TRACK_THRESHOLD_M,
  };
}
