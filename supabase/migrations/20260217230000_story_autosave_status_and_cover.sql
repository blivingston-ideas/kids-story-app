-- Autosave + progressive image status + dedicated cover support.

alter table public.stories
  add column if not exists story_spark text;

alter table public.stories
  add column if not exists stage text;

alter table public.stories
  add column if not exists arc_summary text;

alter table public.stories
  add column if not exists cover_prompt text;

alter table public.stories
  add column if not exists cover_image_url text;

alter table public.stories
  add column if not exists first_page_image_url text;

alter table public.stories
  add column if not exists error_message text;

alter table public.stories
  add column if not exists updated_at timestamptz not null default now();

alter table public.stories
  alter column status drop default;

alter table public.stories
  alter column status set default 'generating';

alter table public.stories
  drop constraint if exists stories_status_check;

alter table public.stories
  add constraint stories_status_check
  check (status in ('generating', 'ready', 'error', 'generated', 'pending_review', 'approved'));

update public.stories
set status = 'ready'
where status in ('generated', 'pending_review', 'approved');

create index if not exists stories_owner_created_idx
  on public.stories (created_by, created_at desc);

alter table public.story_pages
  add column if not exists progress int not null default 0;

alter table public.story_pages
  add column if not exists error_message text;

alter table public.story_pages
  add column if not exists image_prompt text;

alter table public.story_pages
  drop constraint if exists story_pages_progress_check;

alter table public.story_pages
  add constraint story_pages_progress_check check (progress >= 0 and progress <= 100);

create or replace function public.set_stories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stories_updated_at on public.stories;
create trigger trg_stories_updated_at
before update on public.stories
for each row execute function public.set_stories_updated_at();

