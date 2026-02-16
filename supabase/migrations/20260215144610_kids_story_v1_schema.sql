-- Enable extensions
create extension if not exists "pgcrypto";

-- ========================
-- TABLES
-- ========================

create table universes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent','grandparent','kid')),
  created_at timestamptz not null default now(),
  unique (universe_id, user_id)
);

create table profiles_adult (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references universes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  persona_label text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table profiles_kid (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references universes(id) on delete cascade,
  display_name text not null,
  age int,
  themes text[] default '{}',
  books_we_like text[] default '{}',
  character_traits text[] default '{}',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table stories (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references universes(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  tone text not null check (tone in ('calm','silly','adventurous')),
  length_minutes int not null,
  prompt jsonb not null,
  content text not null,
  status text not null default 'approved' check (status in ('generated','pending_review','approved')),
  created_at timestamptz not null default now()
);

create table story_characters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  character_type text not null check (character_type in ('kid','adult','custom')),
  character_id uuid,
  custom_name text,
  created_at timestamptz not null default now()
);

create table story_shares (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null unique references stories(id) on delete cascade,
  share_token text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references universes(id) on delete cascade,
  email text not null,
  role text not null check (role in ('parent','grandparent','kid')),
  token text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- ========================
-- RLS
-- ========================

alter table universes enable row level security;
alter table memberships enable row level security;
alter table profiles_adult enable row level security;
alter table profiles_kid enable row level security;
alter table stories enable row level security;
alter table story_characters enable row level security;
alter table story_shares enable row level security;
alter table invites enable row level security;

-- Helper function
create or replace function is_member(u_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from memberships
    where universe_id = u_id
    and user_id = auth.uid()
  );
$$;

-- UNIVERSes
create policy "Users can read their universes"
on universes for select
using (is_member(id));

create policy "Users can create universe"
on universes for insert
with check (auth.uid() = created_by);

-- MEMBERSHIPS
create policy "Members can view memberships"
on memberships for select
using (is_member(universe_id));

-- PROFILES
create policy "Members can read adult profiles"
on profiles_adult for select
using (is_member(universe_id));

create policy "Members can read kid profiles"
on profiles_kid for select
using (is_member(universe_id));

create policy "Parents manage profiles"
on profiles_adult for all
using (exists (
  select 1 from memberships
  where universe_id = profiles_adult.universe_id
  and user_id = auth.uid()
  and role = 'parent'
));

create policy "Parents manage kid profiles"
on profiles_kid for all
using (exists (
  select 1 from memberships
  where universe_id = profiles_kid.universe_id
  and user_id = auth.uid()
  and role = 'parent'
));

-- STORIES
create policy "Members read stories"
on stories for select
using (is_member(universe_id));

create policy "Members create stories"
on stories for insert
with check (is_member(universe_id));

create policy "Members read story characters"
on story_characters for select
using (exists (
  select 1 from stories s
  where s.id = story_id
  and is_member(s.universe_id)
));

create policy "Members manage story characters"
on story_characters for insert
with check (exists (
  select 1 from stories s
  where s.id = story_id
  and is_member(s.universe_id)
));

-- INVITES
create policy "Parents manage invites"
on invites for all
using (exists (
  select 1 from memberships
  where universe_id = invites.universe_id
  and user_id = auth.uid()
  and role = 'parent'
));

-- STORY SHARES (read via token server-side)
create policy "Members manage shares"
on story_shares for all
using (exists (
  select 1 from stories s
  where s.id = story_id
  and is_member(s.universe_id)
));
