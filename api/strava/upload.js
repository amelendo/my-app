// api/strava/upload.js — Proxy d'upload GPX vers Strava.
// Nécessaire car l'API Strava n'autorise pas les appels directs depuis le
// navigateur (pas de CORS). Le front envoie le GPX + un access_token Bearer.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { accessToken, gpx, name, description } = req.body || {};
  if (!accessToken || !gpx) {
    return res.status(400).json({ error: "accessToken et gpx requis" });
  }

  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([gpx], { type: "application/gpx+xml" }),
      "activity.gpx"
    );
    form.append("data_type", "gpx");
    if (name) form.append("name", name);
    if (description) form.append("description", description);

    const r = await fetch("https://www.strava.com/api/v3/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Échec de l'upload vers Strava" });
  }
}
