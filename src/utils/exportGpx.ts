import { TrackPoint } from "./gpxParser";

export function exportToGpx(points: TrackPoint[], filename: string) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("Points invalides pour l'export GPX");
  }

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyApp">
  <trk>
    <name>${filename}</name>
    <trkseg>
`;

  const body = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat}" lon="${p.lon}">
        ${p.ele !== undefined ? `<ele>${p.ele}</ele>` : ""}
        <time>${new Date(Number(p.time)).toISOString()}</time>
      </trkpt>`
    )
    .join("\n");

  const footer = `
    </trkseg>
  </trk>
</gpx>`;

  const blob = new Blob([header + body + footer], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename + ".gpx";
  link.click();
  URL.revokeObjectURL(url);
}
