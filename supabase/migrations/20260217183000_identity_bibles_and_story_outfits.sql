-- Identity is stable; outfits vary by story.
-- Note: this repository uses profiles_kid/profiles_adult (no unified profiles table),
-- so we store profile_kind + profile_id.

create table if not exists public.character_identity_bibles (
  id uuid primary key default gen_random_uuid(),
  universe_id uuid not null references public.universes(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('kid', 'adult')),
  profile_id uuid not null,
  version int not null default 1,
  source_hash text not null,
  identity_bible_json jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (profile_kind, profile_id, version)
);

create index if not exists character_identity_bibles_profile_idx
  on public.character_identity_bibles (profile_kind, profile_id, status, created_at desc);

create table if not exists public.character_identity_reference_images (
  id uuid primary key default gen_random_uuid(),
  identity_bible_id uuid not null references public.character_identity_bibles(id) on delete cascade,
  kind text not null check (kind in ('portrait', 'full_body')),
  image_url text not null,
  model text,
  seed text,
  params_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists character_identity_reference_images_identity_kind_idx
  on public.character_identity_reference_images (identity_bible_id, kind, created_at desc);

create table if not exists public.story_character_outfits (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('kid', 'adult')),
  profile_id uuid not null,
  outfit_json jsonb not null,
  outfit_lock boolean not null default false,
  created_at timestamptz not null default now(),
  unique (story_id, profile_kind, profile_id)
);

alter table public.story_characters
  add column if not exists identity_bible_id uuid references public.character_identity_bibles(id) on delete set null;

alter table public.story_characters
  add column if not exists outfit_id uuid references public.story_character_outfits(id) on delete set null;

alter table public.character_identity_bibles enable row level security;
alter table public.character_identity_reference_images enable row level security;
alter table public.story_character_outfits enable row level security;

drop policy if exists "Members read identity bibles" on public.character_identity_bibles;
create policy "Members read identity bibles"
on public.character_identity_bibles for select
using (public.is_member(universe_id));

drop policy if exists "Members manage identity bibles" on public.character_identity_bibles;
create policy "Members manage identity bibles"
on public.character_identity_bibles for all
using (public.is_member(universe_id))
with check (public.is_member(universe_id));

drop policy if exists "Members read identity reference images" on public.character_identity_reference_images;
create policy "Members read identity reference images"
on public.character_identity_reference_images for select
using (
  exists (
    select 1
    from public.character_identity_bibles cib
    where cib.id = character_identity_reference_images.identity_bible_id
      and public.is_member(cib.universe_id)
  )
);

drop policy if exists "Members manage identity reference images" on public.character_identity_reference_images;
create policy "Members manage identity reference images"
on public.character_identity_reference_images for all
using (
  exists (
    select 1
    from public.character_identity_bibles cib
    where cib.id = character_identity_reference_images.identity_bible_id
      and public.is_member(cib.universe_id)
  )
)
with check (
  exists (
    select 1
    from public.character_identity_bibles cib
    where cib.id = character_identity_reference_images.identity_bible_id
      and public.is_member(cib.universe_id)
  )
);

drop policy if exists "Members read story character outfits" on public.story_character_outfits;
create policy "Members read story character outfits"
on public.story_character_outfits for select
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_character_outfits.story_id
      and public.is_member(s.universe_id)
  )
);

drop policy if exists "Members manage story character outfits" on public.story_character_outfits;
create policy "Members manage story character outfits"
on public.story_character_outfits for all
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_character_outfits.story_id
      and public.is_member(s.universe_id)
  )
)
with check (
  exists (
    select 1
    from public.stories s
    where s.id = story_character_outfits.story_id
      and public.is_member(s.universe_id)
  )
);
