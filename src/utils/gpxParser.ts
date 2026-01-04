export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface GPXTrack {
  name: string;
  points: TrackPoint[];
  distance: number;       // km
  elevationGain: number;  // m
  elevationLoss: number;  // m
}

// 🔧 Elevation noise threshold (meters)
// Small changes are accumulated, not ignored
const ELEVATION_THRESHOLD = 3;

export const parseGPX = (gpxContent: string): GPXTrack => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxContent, "text/xml");

  const trackName =
    xmlDoc.querySelector("trk name")?.textContent || "Unnamed Track";
  const trackPoints = xmlDoc.querySelectorAll("trkpt");

  const points: TrackPoint[] = [];
  trackPoints.forEach((point) => {
    const lat = parseFloat(point.getAttribute("lat") || "0");
    const lon = parseFloat(point.getAttribute("lon") || "0");
    const ele = point.querySelector("ele")?.textContent;
    const time = point.querySelector("time")?.textContent;

    points.push({
      lat,
      lon,
      ele: ele ? parseFloat(ele) : undefined,
      time: time || undefined,
    });
  });

  let distance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;

  // 🔁 Buffer for small elevation changes
  let elevationBuffer = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // 🌍 Distance (Haversine)
    const R = 6371000; // meters
    const φ1 = (prev.lat * Math.PI) / 180;
    const φ2 = (curr.lat * Math.PI) / 180;
    const Δφ = ((curr.lat - prev.lat) * Math.PI) / 180;
    const Δλ = ((curr.lon - prev.lon) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) *
        Math.cos(φ2) *
        Math.sin(Δλ / 2) *
        Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance += R * c;

    // ⛰️ Elevation gain / loss (buffered & filtered)
    if (prev.ele !== undefined && curr.ele !== undefined) {
      elevationBuffer += curr.ele - prev.ele;

      if (elevationBuffer > ELEVATION_THRESHOLD) {
        elevationGain += elevationBuffer;
        elevationBuffer = 0;
      } else if (elevationBuffer < -ELEVATION_THRESHOLD) {
        elevationLoss += Math.abs(elevationBuffer);
        elevationBuffer = 0;
      }
    }
  }

  return {
    name: trackName,
    points,
    distance: Math.round((distance / 1000) * 100) / 100, // km (2 decimals)
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
  };
};
