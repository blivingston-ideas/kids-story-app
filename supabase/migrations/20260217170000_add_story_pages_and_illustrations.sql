-- Story pages + per-page illustration state

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'image_status'
      and n.nspname = 'public'
  ) then
    create type public.image_status as enum ('not_started', 'generating', 'ready', 'failed');
  end if;
end $$;

create table if not exists public.story_pages (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  page_index int not null check (page_index >= 0),
  text text not null,
  image_status public.image_status not null default 'not_started',
  image_path text,
  image_prompt text,
  image_error text,
  created_at timestamptz not null default now(),
  unique (story_id, page_index)
);

alter table public.story_pages
  add column if not exists image_status public.image_status not null default 'not_started';

alter table public.story_pages
  add column if not exists image_path text;

alter table public.story_pages
  add column if not exists image_prompt text;

alter table public.story_pages
  add column if not exists image_error text;

alter table public.story_pages
  add column if not exists image_url text;

alter table public.story_pages
  add column if not exists prompt_json jsonb;

alter table public.story_pages
  add column if not exists used_reference_image_ids jsonb;

create index if not exists story_pages_story_page_idx
  on public.story_pages (story_id, page_index);

create table if not exists public.story_bibles (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null unique references public.stories(id) on delete cascade,
  universe_id uuid not null references public.universes(id) on delete cascade,
  story_bible_json jsonb not null,
  beat_sheet_json jsonb not null,
  continuity_ledger_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_refs (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.universes(id) on delete cascade,
  profile_id uuid,
  character_id text not null,
  name text not null,
  visual_bible_json jsonb,
  ref_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (universe_id, character_id)
);

create table if not exists public.character_bibles (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.universes(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('kid', 'adult')),
  profile_id uuid not null,
  version int not null default 1,
  source_hash text not null,
  visual_bible_json jsonb not null,
  style_guide_json jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (profile_kind, profile_id, version)
);

create index if not exists character_bibles_profile_lookup_idx
  on public.character_bibles (profile_kind, profile_id, status, created_at desc);

create table if not exists public.character_reference_images (
  id uuid primary key default gen_random_uuid(),
  character_bible_id uuid not null references public.character_bibles(id) on delete cascade,
  kind text not null check (kind in ('portrait','full_body','turnaround')),
  image_url text not null,
  model text,
  seed text,
  params_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists character_reference_images_bible_kind_idx
  on public.character_reference_images (character_bible_id, kind, created_at desc);

create table if not exists public.generation_logs (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.universes(id) on delete cascade,
  story_id uuid references public.stories(id) on delete cascade,
  step text not null,
  payload jsonb,
  response jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles_kid
  add column if not exists profile_photo_url text;

alter table public.profiles_kid
  add column if not exists profile_attributes_json jsonb;

alter table public.profiles_adult
  add column if not exists profile_photo_url text;

alter table public.profiles_adult
  add column if not exists profile_attributes_json jsonb;

alter table public.story_pages enable row level security;
alter table public.story_bibles enable row level security;
alter table public.character_refs enable row level security;
alter table public.character_bibles enable row level security;
alter table public.character_reference_images enable row level security;
alter table public.generation_logs enable row level security;

drop policy if exists "Members read story pages" on public.story_pages;
create policy "Members read story pages"
on public.story_pages for select
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_pages.story_id
      and public.is_member(s.universe_id)
  )
);

drop policy if exists "Members insert story pages" on public.story_pages;
create policy "Members insert story pages"
on public.story_pages for insert
with check (
  exists (
    select 1
    from public.stories s
    where s.id = story_pages.story_id
      and public.is_member(s.universe_id)
  )
);

drop policy if exists "Members update story pages" on public.story_pages;
create policy "Members update story pages"
on public.story_pages for update
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_pages.story_id
      and public.is_member(s.universe_id)
  )
)
with check (
  exists (
    select 1
    from public.stories s
    where s.id = story_pages.story_id
      and public.is_member(s.universe_id)
  )
);

drop policy if exists "Members read story bibles" on public.story_bibles;
create policy "Members read story bibles"
on public.story_bibles for select
using (public.is_member(universe_id));

drop policy if exists "Members manage story bibles" on public.story_bibles;
create policy "Members manage story bibles"
on public.story_bibles for all
using (public.is_member(universe_id))
with check (public.is_member(universe_id));

drop policy if exists "Members read character refs" on public.character_refs;
create policy "Members read character refs"
on public.character_refs for select
using (public.is_member(universe_id));

drop policy if exists "Members manage character refs" on public.character_refs;
create policy "Members manage character refs"
on public.character_refs for all
using (public.is_member(universe_id))
with check (public.is_member(universe_id));

drop policy if exists "Members read character bibles" on public.character_bibles;
create policy "Members read character bibles"
on public.character_bibles for select
using (public.is_member(universe_id));

drop policy if exists "Members manage character bibles" on public.character_bibles;
create policy "Members manage character bibles"
on public.character_bibles for all
using (public.is_member(universe_id))
with check (public.is_member(universe_id));

drop policy if exists "Members read character reference images" on public.character_reference_images;
create policy "Members read character reference images"
on public.character_reference_images for select
using (
  exists (
    select 1
    from public.character_bibles cb
    where cb.id = character_reference_images.character_bible_id
      and public.is_member(cb.universe_id)
  )
);

drop policy if exists "Members manage character reference images" on public.character_reference_images;
create policy "Members manage character reference images"
on public.character_reference_images for all
using (
  exists (
    select 1
    from public.character_bibles cb
    where cb.id = character_reference_images.character_bible_id
      and public.is_member(cb.universe_id)
  )
)
with check (
  exists (
    select 1
    from public.character_bibles cb
    where cb.id = character_reference_images.character_bible_id
      and public.is_member(cb.universe_id)
  )
);

drop policy if exists "Members read generation logs" on public.generation_logs;
create policy "Members read generation logs"
on public.generation_logs for select
using (public.is_member(universe_id));

drop policy if exists "Members insert generation logs" on public.generation_logs;
create policy "Members insert generation logs"
on public.generation_logs for insert
with check (public.is_member(universe_id));

insert into storage.buckets (id, name, public)
values ('story-illustrations', 'story-illustrations', true)
on conflict (id) do update set public = excluded.public;
