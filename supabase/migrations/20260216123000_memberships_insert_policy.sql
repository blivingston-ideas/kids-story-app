-- Allow the creator of a universe to add their own initial parent membership.
create policy "Universe creators can add their own parent membership"
on memberships for insert
with check (
  auth.uid() = user_id
  and role = 'parent'
  and exists (
    select 1
    from universes u
    where u.id = memberships.universe_id
      and u.created_by = auth.uid()
  )
);

