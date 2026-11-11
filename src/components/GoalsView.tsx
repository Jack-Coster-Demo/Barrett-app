"use client";

import { useState } from "react";
import { addDays, dayLabel, daysBetween, fromYmd, weekStart, ymd } from "@/lib/dates";
import type { Goal, GoalCheckin, GoalDraft, GoalKind, Profile } from "@/lib/types";

export interface GoalActions {
  save(draft: GoalDraft, existing?: Goal): Promise<void>;
  checkIn(goal: Goal, date: string): void;
  undoCheckIn(checkin: GoalCheckin): void;
  achieve(goal: Goal): void;
  reopen(goal: Goal): void;
  remove(goal: Goal): void;
}

interface Props {
  goals: Goal[];
  checkins: GoalCheckin[];
  me: Profile;
  profiles: Profile[];
  today: string;
  loaded: boolean;
  actions: GoalActions;
}

export function GoalsView({ goals, checkins, me, profiles, today, loaded, actions }: Props) {
  const [editing, setEditing] = useState<{ goal?: Goal } | null>(null);

  const live = goals.filter((g) => !g.deleted_at);
  const thisWeek = ymd(weekStart(fromYmd(today)));
  const yesterday = ymd(addDays(fromYmd(today), -1));

  const logged = (g: Goal, userId: string) =>
    checkins.filter((k) => k.goal_id === g.id && k.user_id === userId && k.kind === "checkin");

  /** Weeks in a row the weekly target was hit, counting this week once it is hit. */
  function streak(list: GoalCheckin[], target: number): number {
    const perWeek = new Map<string, number>();
    for (const k of list) {
      const w = ymd(weekStart(fromYmd(k.done_on)));
      perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
    }
    let n = (perWeek.get(thisWeek) ?? 0) >= target ? 1 : 0;
    for (let w = addDays(fromYmd(thisWeek), -7); (perWeek.get(ymd(w)) ?? 0) >= target; w = addDays(w, -7)) n++;
    return n;
  }

  // Mine first, then the other person's, then the ones we share.
  const sections = [
    ...[me, ...profiles.filter((p) => p.id !== me.id)].map((p) => ({
      key: p.id,
      title: p.id === me.id ? "Yours" : p.display_name,
      list: live.filter((g) => g.owner_id === p.id),
    })),
    { key: "both", title: "Together", list: live.filter((g) => !g.owner_id) },
  ].filter((s) => s.list.length);

  const card = (g: Goal) => {
    const doers = g.owner_id ? profiles.filter((p) => p.id === g.owner_id) : profiles;
    const iAmIn = doers.some((p) => p.id === me.id);
    const mine = logged(g, me.id);
    const todayRow = mine.find((k) => k.done_on === today);
    const yesterdayRow = mine.find((k) => k.done_on === yesterday);
    const achieved = !!g.achieved_at;
    const left = g.target_date ? daysBetween(today, g.target_date) : null;

    return (
      <article className={`goal ${achieved ? "isdone" : ""}`} key={g.id}>
        <header>
          <h4>{g.title}</h4>
          <button className="icon" onClick={() => setEditing({ goal: g })}>
            Edit
          </button>
          <button className="icon" aria-label={`Delete ${g.title}`} onClick={() => actions.remove(g)}>
            ✕
          </button>
        </header>
        {g.notes && <div className="notes">{g.notes}</div>}
        <div className="meta">
          {g.kind === "weekly" ? (
            <span className="pill">{g.weekly_target} times a week</span>
          ) : g.target_date ? (
            <span className={`pill ${!achieved && left !== null && left < 0 ? "late" : ""}`}>By {dayLabel(fromYmd(g.target_date))}</span>
          ) : (
            <span className="pill">No date set</span>
          )}
          {!achieved && g.kind === "target" && left !== null && left >= 0 && (
            <span className="pill">{left === 0 ? "Today" : `${left} ${left === 1 ? "day" : "days"} to go`}</span>
          )}
          {g.checkin_points > 0 && <span className="pill pts">{g.checkin_points} pts a session</span>}
          {g.kind === "target" && g.finish_points > 0 && <span className="pill pts">{g.finish_points} pts to finish</span>}
          {achieved && <span className="pill sapphire">Achieved {dayLabel(new Date(g.achieved_at!))}</span>}
        </div>

        {doers.map((p) => {
          const list = logged(g, p.id);
          const week = list.filter((k) => k.done_on >= thisWeek).length;
          const target = g.weekly_target ?? 0;
          const run = g.kind === "weekly" ? streak(list, target) : 0;
          return (
            <div className="progress" key={p.id}>
              {doers.length > 1 && (
                <span className="who">
                  <span className={`dot ${p.color}`} />
                  {p.display_name}
                </span>
              )}
              {g.kind === "weekly" ? (
                <>
                  <span className="pips" aria-hidden="true">
                    {Array.from({ length: Math.max(target, week) }, (_, i) => (
                      <i key={i} className={i < week ? `on ${p.color}` : ""} />
                    ))}
                  </span>
                  <span className="count">
                    {week} of {target} this week
                    {run > 1 ? ` · ${run} week streak` : ""}
                  </span>
                </>
              ) : (
                <span className="count">
                  {list.length} {list.length === 1 ? "session" : "sessions"} logged
                  {week ? ` · ${week} this week` : ""}
                </span>
              )}
            </div>
          );
        })}

        {iAmIn && !achieved && (
          <div className="acts">
            {todayRow ? (
              <button className="icon" onClick={() => actions.undoCheckIn(todayRow)}>
                Logged today ✓ Undo
              </button>
            ) : (
              <button className="icon go" onClick={() => actions.checkIn(g, today)}>
                Log today
              </button>
            )}
            {!yesterdayRow && (
              <button className="icon" onClick={() => actions.checkIn(g, yesterday)}>
                Log yesterday
              </button>
            )}
            {g.kind === "target" && (
              <>
                <span className="sp" />
                <button className="icon" onClick={() => actions.achieve(g)}>
                  Mark achieved
                </button>
              </>
            )}
          </div>
        )}
        {iAmIn && achieved && (
          <div className="acts">
            <button className="icon" onClick={() => actions.reopen(g)}>
              Reopen
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="stack">
      <div className="sectionhead">
        <h2>Personal goals</h2>
        <button className="btn small" onClick={() => setEditing({})}>
          New goal
        </button>
      </div>

      {loaded && live.length === 0 && (
        <p className="empty">
          No goals yet. Add one for something you are working toward, like the gym three times a week, training for a race or
          studying for a certificate.
        </p>
      )}

      {sections.map((s) => (
        <div className="group" key={s.key}>
          <div className="grouphead">
            <h3>{s.title}</h3>
          </div>
          <div className="projgrid">{s.list.map(card)}</div>
        </div>
      ))}

      {live.length > 0 && (
        <p className="note">Logging a session adds its points to the scoreboard, once a day per goal. No photo needed.</p>
      )}

      {editing && (
        <GoalEditor
          goal={editing.goal}
          me={me}
          profiles={profiles}
          onSave={(draft) => actions.save(draft, editing.goal)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function GoalEditor({
  goal,
  me,
  profiles,
  onSave,
  onClose,
}: {
  goal?: Goal;
  me: Profile;
  profiles: Profile[];
  onSave(draft: GoalDraft): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [owner, setOwner] = useState(goal ? (goal.owner_id ?? "") : me.id);
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "weekly");
  const [times, setTimes] = useState(String(goal?.weekly_target ?? 3));
  const [target, setTarget] = useState(goal?.target_date ?? "");
  const [points, setPoints] = useState(String(goal?.checkin_points ?? 5));
  const [finish, setFinish] = useState(String(goal?.finish_points ?? 20));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the goal a name.");
    const n = Math.round(Number(times));
    if (kind === "weekly" && !(n >= 1 && n <= 21)) return setError("Times a week needs to be between 1 and 21.");
    const p = Math.round(Number(points));
    if (!(p >= 0 && p <= 50)) return setError("Points a session need to be between 0 and 50.");
    const f = Math.round(Number(finish));
    if (kind === "target" && !(f >= 0 && f <= 200)) return setError("Points for finishing need to be between 0 and 200.");
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim(),
        owner_id: owner || null,
        kind,
        weekly_target: kind === "weekly" ? n : null,
        target_date: kind === "target" ? target || null : null,
        checkin_points: p,
        finish_points: kind === "target" ? f : (goal?.finish_points ?? 20),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The goal could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="goalTitle" onSubmit={submit} noValidate>
        <h2 id="goalTitle">{goal ? "Edit goal" : "New goal"}</h2>
        <div className="field">
          <label htmlFor="goTitle">What are you working toward</label>
          <input id="goTitle" maxLength={90} autoComplete="off" autoFocus placeholder="Gym" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="goNotes">Notes (optional)</label>
          <textarea id="goNotes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="goOwner">Whose goal</label>
            <select id="goOwner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
              <option value="">Both of us</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="goKind">Type</label>
            <select id="goKind" value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
              <option value="weekly">A number of times a week</option>
              <option value="target">Working toward a date</option>
            </select>
          </div>
          {kind === "weekly" ? (
            <div className="field">
              <label htmlFor="goTimes">Times a week</label>
              <input id="goTimes" type="number" min={1} max={21} inputMode="numeric" value={times} onChange={(e) => setTimes(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="goTarget">Race, exam or finish date (optional)</label>
              <input id="goTarget" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="goPoints">Points a session</label>
            <input id="goPoints" type="number" min={0} max={50} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          {kind === "target" && (
            <div className="field">
              <label htmlFor="goFinish">Points for finishing</label>
              <input id="goFinish" type="number" min={0} max={200} inputMode="numeric" value={finish} onChange={(e) => setFinish(e.target.value)} />
            </div>
          )}
        </div>
        <p className="note">
          {kind === "weekly"
            ? "Log each session. The count starts over every Monday."
            : "Log training or study sessions along the way, then mark it achieved when you cross the line or pass."}
        </p>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {goal ? "Save changes" : "Add goal"}
          </button>
        </div>
      </form>
    </div>
  );
}
