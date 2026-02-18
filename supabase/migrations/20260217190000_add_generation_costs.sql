create table if not exists public.generation_costs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  page_number int,
  step text not null,
  provider text not null default 'openai',
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  cached_input_tokens int,
  reasoning_tokens int,
  cost_usd numeric(12,6) not null default 0,
  response_id text,
  created_at timestamptz not null default now()
);

create index if not exists generation_costs_story_idx
  on public.generation_costs (story_id);

create index if not exists generation_costs_story_step_idx
  on public.generation_costs (story_id, step);

create index if not exists generation_costs_story_page_idx
  on public.generation_costs (story_id, page_number);

alter table public.generation_costs enable row level security;

drop policy if exists "Members read generation costs" on public.generation_costs;
create policy "Members read generation costs"
on public.generation_costs for select
using (
  exists (
    select 1
    from public.stories s
    where s.id = generation_costs.story_id
      and public.is_member(s.universe_id)
  )
);

drop policy if exists "Members insert generation costs" on public.generation_costs;
create policy "Members insert generation costs"
on public.generation_costs for insert
with check (
  exists (
    select 1
    from public.stories s
    where s.id = generation_costs.story_id
      and public.is_member(s.universe_id)
  )
);
