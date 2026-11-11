-- Barrett: project groups, the household shopping list and personal goals.
-- Run this once in the Supabase SQL editor, after 0001_init.sql.

-- ---------------------------------------------------------------- projects

-- Group -> project -> tasks. Example: House Projects -> Closets -> "Buy rod for the front hall closet".
create table public.project_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  deleted_at timestamptz,                                  -- soft delete, so a group can be restored
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.project_groups (id) on delete cascade,
  name text not null,
  notes text,
  target_date date,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index projects_group_idx on public.projects (group_id);

-- A project's tasks are ordinary tasks: same board, same points, same proof.
alter table public.tasks
  add column project_id uuid references public.projects (id) on delete set null,
  add column deadline date;                                -- "finish by", separate from the planned day
create index tasks_project_idx on public.tasks (project_id) where project_id is not null;

-- ---------------------------------------------------------------- shopping list

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  store text,                                              -- optional: Costco, Home Depot, ...
  added_by uuid references public.profiles (id),
  bought_at timestamptz,
  bought_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- personal goals

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  owner_id uuid references public.profiles (id),           -- null = both of us
  kind text not null check (kind in ('weekly', 'target')), -- "x times a week" or "finish by a date"
  weekly_target int check (weekly_target between 1 and 21),
  target_date date,
  checkin_points int not null default 5 check (checkin_points between 0 and 50),
  finish_points int not null default 20 check (finish_points between 0 and 200),
  achieved_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- One row per session logged, plus one 'finish' row per person when the goal is achieved.
create table public.goal_checkins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  kind text not null default 'checkin' check (kind in ('checkin', 'finish')),
  done_on date not null,
  points int not null default 0,
  created_at timestamptz not null default now()
);
-- One check-in per person per goal per day, so points cannot be farmed.
create unique index goal_checkins_day_idx on public.goal_checkins (goal_id, user_id, done_on)
  where kind = 'checkin';
create unique index goal_checkins_finish_idx on public.goal_checkins (goal_id, user_id)
  where kind = 'finish';
create index goal_checkins_time_idx on public.goal_checkins (done_on);

-- ---------------------------------------------------------------- access

alter table public.project_groups enable row level security;
alter table public.projects enable row level security;
alter table public.shopping_items enable row level security;
alter table public.goals enable row level security;
alter table public.goal_checkins enable row level security;

create policy "members all" on public.project_groups
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.projects
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.shopping_items
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.goals
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members all" on public.goal_checkins
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- ---------------------------------------------------------------- live sync

alter publication supabase_realtime add table
  public.project_groups, public.projects, public.shopping_items, public.goals, public.goal_checkins;

-- ---------------------------------------------------------------- starter data

-- The first group, project and task. Delete these lines before running if you would rather start empty.
with g as (
  insert into public.project_groups (name) values ('House Projects') returning id
), p as (
  insert into public.projects (group_id, name) select id, 'Closets' from g returning id
)
insert into public.tasks (title, points, status, proof_type, project_id, deadline)
select 'Buy rod and storage solution for front hall closet', 10, 'ready', 'photo', id, date '2026-11-25'
from p;
