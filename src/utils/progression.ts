import { TrackPoint } from "@/utils/gpxParser";

// Distance haversine en mètres
function distance(a: TrackPoint, b: TrackPoint) {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;

  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Trouve l’index du point GPX le plus proche
function findNearestPointIndex(
  pos: { lat: number; lon: number },
  track: TrackPoint[]
) {
  let minDist = Infinity;
  let index = 0;

  track.forEach((p, i) => {
    const d =
      distance({ lat: pos.lat, lon: pos.lon }, p);
    if (d < minDist) {
      minDist = d;
      index = i;
    }
  });

  return index;
}

// Calcule distance + dénivelé restants
export function computeRemaining(
  pos: { lat: number; lon: number },
  track: TrackPoint[]
) {
  if (track.length < 2) return { distance: 0, elevation: 0 };

  const startIndex = findNearestPointIndex(pos, track);

  let remainingDistance = 0;
  let remainingElevation = 0;

  for (let i = startIndex + 1; i < track.length; i++) {
    remainingDistance += distance(track[i - 1], track[i]);

    const prevEle = track[i - 1].ele ?? 0;
    const currEle = track[i].ele ?? 0;
    if (currEle > prevEle) {
      remainingElevation += currEle - prevEle;
    }
  }

  return {
    distance: Math.round((remainingDistance / 1000) * 100) / 100, // km
    elevation: Math.round(remainingElevation), // m
  };
}
