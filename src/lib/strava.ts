// src/lib/strava.ts
// Client Strava côté front : connexion OAuth, stockage/rafraîchissement du
// token, et upload d'une trace. Le Client Secret n'est JAMAIS ici (il reste
// dans les fonctions serverless /api/strava/*).
//
// Note sécurité : les tokens sont conservés en localStorage pour un usage
// perso mono-utilisateur. C'est pragmatique mais vulnérable au XSS ; pour un
// usage multi-utilisateurs, préférer des cookies httpOnly côté serveur.

const STORAGE_KEY = "strava_tokens";
const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined;
const SCOPE = "activity:write";

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch (secondes)
  athlete?: { id: number; firstname?: string };
}

/* ---------------- Stockage ---------------- */
function readTokens(): StravaTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StravaTokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(t: StravaTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

export function isStravaConnected(): boolean {
  return readTokens() !== null;
}

export function disconnectStrava() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------------- OAuth ---------------- */
export function connectStrava() {
  if (!CLIENT_ID) {
    throw new Error("VITE_STRAVA_CLIENT_ID manquant");
  }
  const redirectUri = `${window.location.origin}/`;
  const url =
    "https://www.strava.com/oauth/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: SCOPE,
    }).toString();
  window.location.href = url;
}

/**
 * À appeler au démarrage : si l'URL contient ?code=... (retour Strava),
 * échange le code contre des tokens, les stocke, et nettoie l'URL.
 * Renvoie true si une connexion vient d'être établie.
 */
export async function handleStravaRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const scope = params.get("scope");
  if (!code) return false;

  // Nettoie l'URL quoi qu'il arrive (évite de rejouer le code)
  const clean = () =>
    window.history.replaceState({}, "", window.location.pathname);

  // L'utilisateur doit avoir accordé activity:write
  if (!scope || !scope.includes("activity:write")) {
    clean();
    throw new Error("Autorisation d'écriture Strava refusée");
  }

  try {
    const res = await fetch("/api/strava/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec de connexion Strava");
    writeTokens(data);
    return true;
  } finally {
    clean();
  }
}

async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch("/api/strava/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Échec du rafraîchissement");
  writeTokens(data);
  return data;
}

async function getValidAccessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new Error("Non connecté à Strava");
  // Marge de 60 s avant expiration
  if (tokens.expires_at * 1000 - Date.now() < 60_000) {
    const fresh = await refreshTokens(tokens.refresh_token);
    return fresh.access_token;
  }
  return tokens.access_token;
}

/* ---------------- Upload ---------------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadResult {
  activityId?: number;
  status: string;
}

/**
 * Envoie une trace GPX vers Strava et attend le résultat du traitement.
 */
export async function uploadToStrava(
  gpx: string,
  name: string
): Promise<UploadResult> {
  const accessToken = await getValidAccessToken();

  const res = await fetch("/api/strava/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, gpx, name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Upload refusé par Strava");
  }
  if (data.error) throw new Error(data.error); // ex : doublon

  // Le traitement est asynchrone : on interroge l'état quelques fois
  let current = data;
  for (let i = 0; i < 12 && !current.activity_id && !current.error; i++) {
    await sleep(2000);
    const s = await fetch("/api/strava/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, uploadId: data.id }),
    });
    current = await s.json();
  }

  if (current.error) throw new Error(current.error);
  return {
    activityId: current.activity_id ?? undefined,
    status: current.status ?? "En cours de traitement",
  };
}
