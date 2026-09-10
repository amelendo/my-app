// src/lib/trackStore.ts
// Persistance IndexedDB (idb) :
//  - "session"   : le parcours ENREGISTRÉ en cours (votre tracé GPS)
//  - "reference" : la trace GPX IMPORTÉE (pour la retrouver hors-ligne)
//
// La session porte un marqueur "active" : posé au démarrage d'une course,
// retiré à l'arrêt propre (Stop). S'il subsiste au lancement de l'app, c'est
// qu'une course a été interrompue (app tuée/suspendue) → on propose la reprise.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { TrackPoint, GPXTrack } from "@/utils/gpxParser";

interface SessionValue {
  id: string;
  points: TrackPoint[];
  active: boolean;
  freeMode: boolean;
  updatedAt: number;
}

interface TrackerDB extends DBSchema {
  session: { key: string; value: SessionValue };
  reference: {
    key: string;
    value: { id: string; track: GPXTrack; updatedAt: number };
  };
}

const DB_NAME = "trail-tracker";
const SESSION = "session";
const REFERENCE = "reference";
const CURRENT = "current";

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SESSION)) {
          db.createObjectStore(SESSION, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(REFERENCE)) {
          db.createObjectStore(REFERENCE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- Parcours enregistré (session GPS) ---------- */

/** Démarre une session : marque la course comme active. */
export async function beginSession(freeMode: boolean): Promise<void> {
  const db = await getDB();
  await db.put(SESSION, {
    id: CURRENT,
    points: [],
    active: true,
    freeMode,
    updatedAt: Date.now(),
  });
}

/** Sauvegarde les points en préservant le marqueur actif. */
export async function savePath(points: TrackPoint[]): Promise<void> {
  const db = await getDB();
  const prev = await db.get(SESSION, CURRENT);
  await db.put(SESSION, {
    id: CURRENT,
    points,
    active: prev?.active ?? true,
    freeMode: prev?.freeMode ?? false,
    updatedAt: Date.now(),
  });
}

/** Fin propre (Stop) : efface la session (rien à reprendre). */
export async function endSession(): Promise<void> {
  const db = await getDB();
  await db.delete(SESSION, CURRENT);
}

export const clearPath = endSession;

export async function loadPath(): Promise<TrackPoint[]> {
  const db = await getDB();
  const rec = await db.get(SESSION, CURRENT);
  return rec?.points ?? [];
}

/** Session interrompue récupérable, ou null. */
export async function getActiveSession(): Promise<{
  points: TrackPoint[];
  freeMode: boolean;
} | null> {
  const db = await getDB();
  const rec = await db.get(SESSION, CURRENT);
  if (rec && rec.active && rec.points.length > 1) {
    return { points: rec.points, freeMode: rec.freeMode };
  }
  return null;
}

/* ---------- Trace de référence importée (GPX) ---------- */
export async function saveReferenceTrack(track: GPXTrack): Promise<void> {
  const db = await getDB();
  await db.put(REFERENCE, { id: CURRENT, track, updatedAt: Date.now() });
}

export async function loadReferenceTrack(): Promise<GPXTrack | null> {
  const db = await getDB();
  const rec = await db.get(REFERENCE, CURRENT);
  return rec?.track ?? null;
}

export async function clearReferenceTrack(): Promise<void> {
  const db = await getDB();
  await db.delete(REFERENCE, CURRENT);
}
