-- Profile appearance support for illustration identity consistency.
-- Note: repository uses profiles_kid / profiles_adult (no unified profiles table).

alter table public.profiles_kid
  add column if not exists profile_appearance_json jsonb;

alter table public.profiles_adult
  add column if not exists profile_appearance_json jsonb;

alter table public.profiles_kid
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles_adult
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles_kid
  add column if not exists created_by uuid references auth.users(id);

update public.profiles_kid pk
set created_by = coalesce(
  u.created_by,
  (
    select m.user_id
    from public.memberships m
    where m.universe_id = pk.universe_id
      and m.role = 'parent'
    order by m.created_at asc
    limit 1
  )
)
from public.universes u
where u.id = pk.universe_id
  and pk.created_by is null;

alter table public.profiles_kid
  alter column created_by set default auth.uid();

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_kid_updated_at on public.profiles_kid;
create trigger trg_profiles_kid_updated_at
before update on public.profiles_kid
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_profiles_adult_updated_at on public.profiles_adult;
create trigger trg_profiles_adult_updated_at
before update on public.profiles_adult
for each row execute function public.set_row_updated_at();

drop policy if exists "Parents manage profiles" on public.profiles_adult;
drop policy if exists "Parents manage kid profiles" on public.profiles_kid;

drop policy if exists "Owner inserts adult profiles" on public.profiles_adult;
create policy "Owner inserts adult profiles"
on public.profiles_adult for insert
with check (
  public.is_member(universe_id)
  and auth.uid() = user_id
);

drop policy if exists "Owner updates adult profiles" on public.profiles_adult;
create policy "Owner updates adult profiles"
on public.profiles_adult for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Owner deletes adult profiles" on public.profiles_adult;
create policy "Owner deletes adult profiles"
on public.profiles_adult for delete
using (auth.uid() = user_id);

drop policy if exists "Owner inserts kid profiles" on public.profiles_kid;
create policy "Owner inserts kid profiles"
on public.profiles_kid for insert
with check (
  public.is_member(universe_id)
  and auth.uid() = created_by
);

drop policy if exists "Owner updates kid profiles" on public.profiles_kid;
create policy "Owner updates kid profiles"
on public.profiles_kid for update
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "Owner deletes kid profiles" on public.profiles_kid;
create policy "Owner deletes kid profiles"
on public.profiles_kid for delete
using (auth.uid() = created_by);

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do update set public = excluded.public;

