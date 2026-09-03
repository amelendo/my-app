// src/lib/trackStore.ts
// Persistance IndexedDB (idb) :
//  - "session"   : le parcours ENREGISTRÉ en cours (votre tracé GPS)
//  - "reference" : la trace GPX IMPORTÉE (pour la retrouver hors-ligne)

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { TrackPoint, GPXTrack } from "@/utils/gpxParser";

interface TrackerDB extends DBSchema {
  session: {
    key: string;
    value: { id: string; points: TrackPoint[]; updatedAt: number };
  };
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
export async function savePath(points: TrackPoint[]): Promise<void> {
  const db = await getDB();
  await db.put(SESSION, { id: CURRENT, points, updatedAt: Date.now() });
}

export async function loadPath(): Promise<TrackPoint[]> {
  const db = await getDB();
  const rec = await db.get(SESSION, CURRENT);
  return rec?.points ?? [];
}

export async function clearPath(): Promise<void> {
  const db = await getDB();
  await db.delete(SESSION, CURRENT);
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
