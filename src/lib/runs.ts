// src/lib/runs.ts — lecture/écriture des sorties dans Supabase (table runs).
import { supabase } from "@/lib/supabase";
import type { TrackPoint } from "@/utils/gpxParser";

export interface RunRecord {
  id: string;
  name: string | null;
  started_at: string | null;
  duration_s: number | null;
  distance_km: number | null;
  elevation_m: number | null;
  created_at: string;
}

export interface NewRun {
  name: string;
  startedAt: number; // epoch ms
  durationS: number;
  distanceKm: number;
  elevationM: number;
  points: TrackPoint[];
}

/** Enregistre une sortie sur le compte de l'utilisateur connecté. */
export async function saveRun(run: NewRun): Promise<void> {
  if (!supabase) throw new Error("Comptes non configurés");
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Non connecté");

  const { error } = await supabase.from("runs").insert({
    user_id: user.id,
    name: run.name,
    started_at: new Date(run.startedAt).toISOString(),
    duration_s: run.durationS,
    distance_km: run.distanceKm,
    elevation_m: run.elevationM,
    points: run.points,
  });
  if (error) throw error;
}

/** Liste les sorties de l'utilisateur (sans les points, pour rester léger). */
export async function listRuns(): Promise<RunRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("runs")
    .select("id,name,started_at,duration_s,distance_km,elevation_m,created_at")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Récupère une sortie complète (avec ses points) pour la rouvrir/exporter. */
export async function getRun(id: string) {
  if (!supabase) throw new Error("Comptes non configurés");
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** Supprime une sortie. */
export async function deleteRun(id: string): Promise<void> {
  if (!supabase) throw new Error("Comptes non configurés");
  const { error } = await supabase.from("runs").delete().eq("id", id);
  if (error) throw error;
}
