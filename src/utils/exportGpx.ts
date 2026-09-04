import { TrackPoint } from "./gpxParser";

/** Construit le contenu GPX (texte XML) à partir d'une liste de points. */
export function buildGpx(points: TrackPoint[], name: string): string {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("Points invalides pour l'export GPX");
  }

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trail Navigator">
  <trk>
    <name>${name}</name>
    <trkseg>
`;

  const body = points
    .map((p) => {
      const time =
        p.time !== undefined && !Number.isNaN(Number(p.time))
          ? `<time>${new Date(Number(p.time)).toISOString()}</time>`
          : "";
      const ele = p.ele !== undefined ? `<ele>${p.ele}</ele>` : "";
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}${time}</trkpt>`;
    })
    .join("\n");

  const footer = `
    </trkseg>
  </trk>
</gpx>`;

  return header + body + footer;
}

/** Déclenche le téléchargement d'un fichier .gpx dans le navigateur. */
export function exportToGpx(points: TrackPoint[], filename: string) {
  const gpx = buildGpx(points, filename);
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename + ".gpx";
  link.click();
  URL.revokeObjectURL(url);
}
