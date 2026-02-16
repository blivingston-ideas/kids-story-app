-- Fix recursion in memberships SELECT RLS policy.
-- Previous policy used is_member(universe_id), and is_member() queries memberships,
-- which can recursively evaluate memberships policies.

drop policy if exists "Members can view memberships" on memberships;

create policy "Users can view their own memberships"
on memberships
for select
using (user_id = auth.uid());

