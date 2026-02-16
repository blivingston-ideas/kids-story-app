-- Accept invite token securely for authenticated users.
-- This avoids client-side privileged writes and keeps invite acceptance atomic.

create or replace function public.accept_invite_token(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row invites%rowtype;
  current_user uuid := auth.uid();
begin
  if current_user is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invite_row
  from invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if invite_row.accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;

  if invite_row.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  insert into memberships (universe_id, user_id, role)
  values (invite_row.universe_id, current_user, invite_row.role)
  on conflict (universe_id, user_id) do nothing;

  update invites
  set accepted_at = now()
  where id = invite_row.id
    and accepted_at is null;

  return invite_row.universe_id;
end;
$$;

revoke all on function public.accept_invite_token(text) from public;
grant execute on function public.accept_invite_token(text) to authenticated;
