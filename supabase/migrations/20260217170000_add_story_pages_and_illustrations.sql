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

create index if not exists story_pages_story_page_idx
  on public.story_pages (story_id, page_index);

alter table public.story_pages enable row level security;

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

insert into storage.buckets (id, name, public)
values ('story-illustrations', 'story-illustrations', true)
on conflict (id) do update set public = excluded.public;
