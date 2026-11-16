-- Barrett: a weekly repeating task can be tied to a day of the week ("weekly on Tuesday").

-- 1 = Monday ... 7 = Sunday. Null = any day that week, which is how weekly tasks worked before.
alter table public.recurring_rules add column weekday smallint check (weekday between 1 and 7);

-- Same as before, plus: a weekly rule with a weekday puts its copy on that day of the week.
-- The copy is still created at the start of the week, so it can be seen and done early,
-- and it still rolls over if it is not finished. A rule made after its day has already
-- passed starts the following week instead of showing up late straight away.
create or replace function public.generate_recurring()
returns void
language plpgsql
as $$
declare
  r public.recurring_rules;
  ps date;
  planned date;
begin
  for r in select * from public.recurring_rules where active loop
    ps := public.period_start(r.cadence);
    planned := ps;
    if r.cadence = 'weekly' and r.weekday is not null then
      planned := ps + (r.weekday - 1);
      if planned < (r.created_at at time zone 'America/Los_Angeles')::date then
        continue;
      end if;
    end if;
    if not exists (
      select 1 from public.tasks t
      where t.recurring_rule_id = r.id
        and t.deleted_at is null
        and (t.status <> 'done' or t.due_date >= ps)
    ) then
      insert into public.tasks
        (title, points, owner_id, status, proof_type, remind_at, recurring_rule_id, due_date, planned_date, created_by)
      values
        (r.title, r.points, r.owner_id, 'ready', r.proof_type, r.remind_at, r.id, ps, planned, r.created_by)
      on conflict (recurring_rule_id, due_date) where recurring_rule_id is not null do nothing;
    end if;
  end loop;
end;
$$;
