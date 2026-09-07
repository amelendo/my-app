// src/lib/supabase.ts — client Supabase (auth + base de données).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Message explicite plutôt qu'une erreur cryptique au premier appel
  console.warn(
    "Supabase non configuré : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "");

export const isSupabaseConfigured = Boolean(url && anonKey);
