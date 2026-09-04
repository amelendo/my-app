// api/strava/auth.js — Échange OAuth Strava (côté serveur : garde le secret).
// Gère l'échange du "code" d'autorisation ET le rafraîchissement de token.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Strava non configuré côté serveur" });
  }

  const { code, refreshToken } = req.body || {};
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (code) {
    params.set("code", code);
    params.set("grant_type", "authorization_code");
  } else if (refreshToken) {
    params.set("refresh_token", refreshToken);
    params.set("grant_type", "refresh_token");
  } else {
    return res.status(400).json({ error: "code ou refreshToken requis" });
  }

  try {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    // On ne renvoie au client que le strict nécessaire
    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete
        ? { id: data.athlete.id, firstname: data.athlete.firstname }
        : undefined,
    });
  } catch (e) {
    return res.status(500).json({ error: "Échec de l'échange de token" });
  }
}
