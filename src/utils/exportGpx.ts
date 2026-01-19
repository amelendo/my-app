import { TrackPoint } from "@/utils/gpxParser";

export function exportToGpx(trackName: string, points: TrackPoint[]) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trail Navigator" xmlns="http://www.topografix.com/GPX/1/1">
<trk>
  <name>${trackName}</name>
  <trkseg>
`;

  const footer = `
  </trkseg>
</trk>
</gpx>`;

  const body = points
    .map((p) => {
      const time = p.time ? new Date(Number(p.time)).toISOString() : "";
      const ele = p.ele !== undefined ? `<ele>${p.ele}</ele>` : "";
      const timeTag = time ? `<time>${time}</time>` : "";

      return `
    <trkpt lat="${p.lat}" lon="${p.lon}">
      ${ele}
      ${timeTag}
    </trkpt>`;
    })
    .join("");

  return header + body + footer;
}
