-- Style consistency columns for story-level image prompt locking.
alter table public.stories
  add column if not exists style_bible text;

alter table public.stories
  add column if not exists style_id text;

alter table public.stories
  add column if not exists image_model text;

alter table public.stories
  add column if not exists style_version int not null default 1;

alter table public.stories
  add column if not exists style_reference_image_url text;

update public.stories
set style_bible = coalesce(style_bible, 'Rendering: storybook illustration with stable medium and palette.\nLine quality: clean, consistent outlines.\nShading: soft and gentle.\nTexture: subtle paper texture only.\nPalette vibe: warm, playful, child-safe colors.\nLighting mood: cozy and readable.\nCamera defaults: kid-friendly wide/medium framing.\nCharacter rendering: stable face and feature consistency.\nEnvironment rendering: consistent material and brush behavior.\nComposition: clear focal point and uncluttered scenes.'),
    style_id = coalesce(style_id, 'legacy-style-v1');

alter table public.stories
  alter column style_bible set not null;

alter table public.stories
  alter column style_id set not null;

alter table public.story_pages
  add column if not exists image_prompt text;
