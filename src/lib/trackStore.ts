// src/lib/trackStore.ts
// Persistance du tracé en cours via IndexedDB (idb).
// Remplace localStorage : pas de limite ~5 Mo, pas de JSON.stringify bloquant.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { TrackPoint } from "@/utils/gpxParser";

interface TrackerDB extends DBSchema {
  session: {
    key: string;
    value: { id: string; points: TrackPoint[]; updatedAt: number };
  };
}

const DB_NAME = "trail-tracker";
const STORE = "session";
const CURRENT = "current";

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function savePath(points: TrackPoint[]): Promise<void> {
  const db = await getDB();
  await db.put(STORE, { id: CURRENT, points, updatedAt: Date.now() });
}

export async function loadPath(): Promise<TrackPoint[]> {
  const db = await getDB();
  const rec = await db.get(STORE, CURRENT);
  return rec?.points ?? [];
}

export async function clearPath(): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, CURRENT);
}
