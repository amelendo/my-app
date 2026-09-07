-- Schéma Phase 1 — à exécuter dans Supabase → SQL Editor.
-- Crée les tables profiles et runs, avec Row Level Security (isolation par utilisateur).

-- Profils (1 par compte)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text,
  created_at timestamptz default now()
);

-- Sorties enregistrées
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text,
  started_at timestamptz,
  duration_s integer,
  distance_km double precision,
  elevation_m double precision,
  points jsonb,              -- le tracé (liste de points)
  created_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.runs enable row level security;

-- Profils : chacun ne voit et ne modifie que le sien
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_self_upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- Sorties : chacun ne voit et ne gère que les siennes
create policy "runs_owner_select" on public.runs
  for select using (auth.uid() = user_id);
create policy "runs_owner_insert" on public.runs
  for insert with check (auth.uid() = user_id);
create policy "runs_owner_update" on public.runs
  for update using (auth.uid() = user_id);
create policy "runs_owner_delete" on public.runs
  for delete using (auth.uid() = user_id);

-- Crée automatiquement un profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
