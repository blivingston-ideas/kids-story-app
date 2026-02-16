-- Fix memberships insert RLS for initial universe setup.
-- The direct universes lookup in policy checks is filtered by universes RLS
-- before membership exists. Use a SECURITY DEFINER helper for this check.

create or replace function public.can_create_parent_membership_for_owned_universe(
  target_universe_id uuid,
  target_user_id uuid,
  target_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_user_id
    and target_role = 'parent'
    and exists (
      select 1
      from public.universes u
      where u.id = target_universe_id
        and u.created_by = auth.uid()
    );
$$;

revoke all on function public.can_create_parent_membership_for_owned_universe(uuid, uuid, text) from public;
grant execute on function public.can_create_parent_membership_for_owned_universe(uuid, uuid, text) to authenticated;

drop policy if exists "Universe creators can add their own parent membership" on memberships;

create policy "Universe creators can add their own parent membership"
on memberships
for insert
with check (
  public.can_create_parent_membership_for_owned_universe(universe_id, user_id, role)
);

