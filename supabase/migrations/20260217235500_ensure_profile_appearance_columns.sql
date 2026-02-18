-- Ensure profile appearance/photo columns exist on profile tables.
alter table public.profiles_kid
  add column if not exists profile_photo_url text;

alter table public.profiles_kid
  add column if not exists profile_attributes_json jsonb;

alter table public.profiles_kid
  add column if not exists profile_appearance_json jsonb;

alter table public.profiles_adult
  add column if not exists profile_photo_url text;

alter table public.profiles_adult
  add column if not exists profile_attributes_json jsonb;

alter table public.profiles_adult
  add column if not exists profile_appearance_json jsonb;