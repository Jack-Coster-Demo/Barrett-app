-- Barrett: household task, points and proof tracker.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  color text not null default 'sapphire' check (color in ('sapphire', 'terracotta')),
  created_at timestamptz not null default now()
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  points int not null default 5 check (points between 1 and 200),
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  proof_type text not null default 'photo' check (proof_type in ('photo', 'screenshot')),
  remind_at time,
  owner_id uuid references public.profiles (id),
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  points int not null default 5 check (points between 1 and 200),
  owner_id uuid references public.profiles (id),          -- null = up for grabs
  status text not null default 'backlog' check (status in ('backlog', 'ready', 'doing', 'done')),
  proof_type text not null default 'photo' check (proof_type in ('photo', 'screenshot')),
  planned_date date,                                       -- day it sits on in the week view
  estimate_minutes int check (estimate_minutes between 1 and 1440),
  remind_at time,                                          -- "remind if not done by"
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  due_date date,                                           -- recurring only: start of the period it belongs to
  rolled_from date,                                        -- recurring only: original period if it rolled over
  flag_by uuid references public.profiles (id),            -- other person questions the points
  flag_kind text check (flag_kind in ('high', 'low')),
  completed_at timestamptz,
  proof_path text,                                         -- object path in the private "proofs" bucket
  deleted_at timestamptz,                                  -- soft delete, so tasks can be restored
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index tasks_open_idx on public.tasks (status) where deleted_at is null;
-- One instance of a recurring rule per period. Also makes generation safe when both phones load at once.
create unique index tasks_rule_period_idx on public.tasks (recurring_rule_id, due_date)
  where recurring_rule_id is not null;

-- Who earned the points. Two rows when a task was done together.
create table public.task_completions (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  points int not null,
  completed_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_completions_time_idx on public.task_completions (completed_at);

-- Focus timer. The browser extension reads the open row to know a timer is running.
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index focus_one_active_idx on public.focus_sessions (user_id) where ended_at is null;

create table public.prizes (
  period text primary key check (period in ('week', 'month')),
  description text not null default ''
);
insert into public.prizes (period) values ('week'), ('month');

-- ---------------------------------------------------------------- access

-- A member is someone with a profile row. If they have set up two-step
-- verification, they must also have passed it in this session.
create or replace function public.is_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
    and (
      (select auth.jwt() ->> 'aal') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = auth.uid() and status = 'verified'
      )
    );
$$;

alter table public.profiles enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.prizes enable row level security;

-- Profiles are created by hand (see README), so signing up alone grants nothing.
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());
create policy "members rename themselves" on public.profiles
  for update to authenticated using (id = auth.uid() and public.is_member()) with check (id = auth.uid());

create policy "members all" on public.recurring_rules
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.tasks
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.task_completions
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.focus_sessions
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.prizes
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- ---------------------------------------------------------------- proof photos

insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false)
  on conflict (id) do nothing;

create policy "members read proofs" on storage.objects
  for select to authenticated using (bucket_id = 'proofs' and public.is_member());
create policy "members add proofs" on storage.objects
  for insert to authenticated with check (bucket_id = 'proofs' and public.is_member());

-- ---------------------------------------------------------------- functions

-- Start of the current period for a cadence, in household local time.
create or replace function public.period_start(p_cadence text)
returns date
language sql
stable
as $$
  select case p_cadence
    when 'daily' then (now() at time zone 'America/Los_Angeles')::date
    when 'weekly' then date_trunc('week', (now() at time zone 'America/Los_Angeles'))::date
    else date_trunc('month', (now() at time zone 'America/Los_Angeles'))::date
  end;
$$;

-- Creates this period's instance of each recurring rule. An instance that was
-- not finished stays open and blocks a new one: that is the rollover.
-- Safe to call as often as you like; the app calls it on load.
create or replace function public.generate_recurring()
returns void
language plpgsql
as $$
declare
  r public.recurring_rules;
  ps date;
begin
  for r in select * from public.recurring_rules where active loop
    ps := public.period_start(r.cadence);
    if not exists (
      select 1 from public.tasks t
      where t.recurring_rule_id = r.id
        and t.deleted_at is null
        and (t.status <> 'done' or t.due_date >= ps)
    ) then
      insert into public.tasks
        (title, points, owner_id, status, proof_type, remind_at, recurring_rule_id, due_date, planned_date, created_by)
      values
        (r.title, r.points, r.owner_id, 'ready', r.proof_type, r.remind_at, r.id, ps, ps, r.created_by)
      on conflict (recurring_rule_id, due_date) where recurring_rule_id is not null do nothing;
    end if;
  end loop;
end;
$$;

-- Closes a task. Proof is required. p_users gets the points: one person, or both.
create or replace function public.complete_task(p_task uuid, p_users uuid[], p_proof text)
returns void
language plpgsql
as $$
declare
  t public.tasks;
  ps date;
begin
  if p_proof is null or length(p_proof) = 0 then
    raise exception 'Proof is required to close a task';
  end if;
  if p_users is null or array_length(p_users, 1) is null then
    raise exception 'Pick who did the task';
  end if;

  select * into t from public.tasks where id = p_task for update;
  if not found then
    raise exception 'Task not found';
  end if;

  if t.recurring_rule_id is not null then
    select public.period_start(cadence) into ps from public.recurring_rules where id = t.recurring_rule_id;
  end if;

  update public.tasks set
    status = 'done',
    completed_at = now(),
    proof_path = p_proof,
    flag_by = null,
    flag_kind = null,
    -- a rolled-over recurring task counts for the period it was finally done in
    rolled_from = case when ps is not null and due_date < ps then due_date else rolled_from end,
    due_date = case when ps is not null and due_date < ps then ps else due_date end
  where id = p_task;

  delete from public.task_completions where task_id = p_task;
  insert into public.task_completions (task_id, user_id, points)
    select p_task, u, t.points from unnest(p_users) as u;

  update public.focus_sessions set ended_at = now() where task_id = p_task and ended_at is null;
end;
$$;

-- Moves a finished task back onto the board and takes the points back.
create or replace function public.reopen_task(p_task uuid, p_status text)
returns void
language plpgsql
as $$
begin
  if p_status not in ('backlog', 'ready', 'doing') then
    raise exception 'Unknown lane';
  end if;
  delete from public.task_completions where task_id = p_task;
  update public.tasks set status = p_status, completed_at = null, proof_path = null where id = p_task;
end;
$$;

-- ---------------------------------------------------------------- live sync

alter publication supabase_realtime add table
  public.tasks, public.task_completions, public.recurring_rules, public.focus_sessions, public.prizes;
