-- Faster/progressive story illustration generation support.
-- Keep image_status as text + check to avoid enum "unsafe new value" transaction issues.

alter table public.story_pages
  alter column image_status type text
  using image_status::text;

alter table public.story_pages
  alter column image_status set default 'pending';

update public.story_pages
set image_status = 'pending'
where image_status = 'not_started';

alter table public.story_pages
  drop constraint if exists story_pages_image_status_check;

alter table public.story_pages
  add constraint story_pages_image_status_check
  check (image_status in ('pending', 'not_started', 'generating', 'ready', 'failed'));

alter table public.story_pages
  add column if not exists scene_json jsonb;

alter table public.story_pages
  add column if not exists image_prompt_json jsonb;

alter table public.story_pages
  add column if not exists image_model text;

alter table public.story_pages
  add column if not exists image_quality text;

alter table public.story_pages
  add column if not exists image_size text;

alter table public.story_pages
  add column if not exists image_generated_at timestamptz;

alter table public.stories
  add column if not exists image_mode text not null default 'fast'
  check (image_mode in ('fast','best'));
