-- Allow users to delete only their own stories inside universes where they are members.
create policy "Members delete own stories"
on stories for delete
using (
  is_member(universe_id)
  and created_by = auth.uid()
);
