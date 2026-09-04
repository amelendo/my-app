// api/strava/status.js — Interroge l'état d'un upload Strava (proxy CORS).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { accessToken, uploadId } = req.body || {};
  if (!accessToken || !uploadId) {
    return res.status(400).json({ error: "accessToken et uploadId requis" });
  }

  try {
    const r = await fetch(
      `https://www.strava.com/api/v3/uploads/${uploadId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Échec de la vérification d'upload" });
  }
}
