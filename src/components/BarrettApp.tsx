"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { addDays, clock, dayLabel, fromYmd, minutesLabel, monthStart, weekStart, ymd } from "@/lib/dates";
import { shrinkImage } from "@/lib/image";
import {
  LANES,
  type Cadence,
  type Completion,
  type FocusSession,
  type Goal,
  type GoalCheckin,
  type Period,
  type Prize,
  type Profile,
  type Project,
  type ProjectGroup,
  type Rule,
  type ShoppingItem,
  type Status,
  type Task,
  type TaskDraft,
} from "@/lib/types";
import { DragArea, Lane } from "./Lanes";
import { TaskCard, type CardActions } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { ProofDialog } from "./ProofDialog";
import { ProjectsView, type ProjectActions } from "./ProjectsView";
import { ShoppingView, type ShoppingActions } from "./ShoppingView";
import { GoalsView, type GoalActions } from "./GoalsView";

type Tab = "tasks" | "projects" | "shopping" | "goals";
const TABS: { id: Tab; title: string }[] = [
  { id: "tasks", title: "Tasks" },
  { id: "projects", title: "Projects" },
  { id: "shopping", title: "Shopping" },
  { id: "goals", title: "Goals" },
];

interface Toast {
  head: string;
  msg: string;
  action?: { label: string; run: () => void };
}

const CADENCE_LABEL: Record<Cadence, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

function periodStart(cadence: Cadence, now: Date): string {
  if (cadence === "daily") return ymd(now);
  return ymd(cadence === "weekly" ? weekStart(now) : monthStart(now));
}

export default function BarrettApp({ me, profiles }: { me: Profile; profiles: Profile[] }) {
  const sb = useMemo(() => createClient(), []);
  const people = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const other = profiles.find((p) => p.id !== me.id);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checkins, setCheckins] = useState<GoalCheckin[]>([]);
  /** Why projects, shopping and goals are unavailable: the 0002 migration has not been run yet. */
  const [extrasError, setExtrasError] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [tab, setTab] = useState<Tab>("tasks");
  const [view, setView] = useState<"board" | "week">("board");
  const [period, setPeriod] = useState<Period>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [editor, setEditor] = useState<{ task?: Task; date?: string; projectId?: string } | null>(null);
  const [proofFor, setProofFor] = useState<Task | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const signedPaths = useRef(new Set<string>());

  // ------------------------------------------------------------ loading and live sync

  const load = useCallback(async () => {
    // Everything open, plus finished work back to the start of last month's final week.
    const since = addDays(monthStart(new Date()), -8).toISOString();
    const [t, c, r, f, p, pt, g, pr, sh, go, gc] = await Promise.all([
      sb.from("tasks").select("*").or(`completed_at.is.null,completed_at.gte.${since}`).order("created_at"),
      sb.from("task_completions").select("*").gte("completed_at", since),
      sb.from("recurring_rules").select("id, title, points, cadence, active").eq("active", true).order("created_at"),
      sb.from("focus_sessions").select("*").is("ended_at", null),
      sb.from("prizes").select("*"),
      // Project tasks of any age, so a project's progress counts work finished long ago.
      sb.from("tasks").select("*").not("project_id", "is", null),
      sb.from("project_groups").select("*").order("created_at"),
      sb.from("projects").select("*").order("created_at"),
      sb.from("shopping_items").select("*").order("created_at"),
      sb.from("goals").select("*").order("created_at"),
      sb.from("goal_checkins").select("*").gte("done_on", ymd(addDays(new Date(), -182))),
    ]);
    const failed = t.error ?? c.error ?? r.error ?? f.error ?? p.error;
    if (failed) {
      setLoadError(`The board could not be loaded. ${failed.message}`);
      return;
    }
    setLoadError("");
    // The newer sections load separately, so the board still works before their migration is run.
    const extra = pt.error ?? g.error ?? pr.error ?? sh.error ?? go.error ?? gc.error;
    setExtrasError(extra ? extra.message : "");
    const byId = new Map<string, Task>();
    for (const row of [...((t.data ?? []) as Task[]), ...((extra ? [] : (pt.data ?? [])) as Task[])]) byId.set(row.id, row);
    const list = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    setTasks(list);
    if (!extra) {
      setGroups((g.data ?? []) as ProjectGroup[]);
      setProjects((pr.data ?? []) as Project[]);
      setShopping((sh.data ?? []) as ShoppingItem[]);
      setGoals((go.data ?? []) as Goal[]);
      setCheckins((gc.data ?? []) as GoalCheckin[]);
    }
    setCompletions((c.data ?? []) as Completion[]);
    setRules((r.data ?? []) as Rule[]);
    setSessions((f.data ?? []) as FocusSession[]);
    setPrizes((p.data ?? []) as Prize[]);
    setLoaded(true);

    // Proof photos live in a private bucket, so each one needs a short-lived link.
    const need = list
      .map((x) => x.proof_path)
      .filter((path): path is string => !!path && !signedPaths.current.has(path));
    if (need.length) {
      need.forEach((path) => signedPaths.current.add(path));
      const { data } = await sb.storage.from("proofs").createSignedUrls(need, 60 * 60 * 12);
      if (data) {
        setUrls((prev) => {
          const next = { ...prev };
          for (const row of data) if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
          return next;
        });
      }
    }
  }, [sb]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    // Creates today's recurring tasks if they are not there yet, then loads.
    const refresh = () => sb.rpc("generate_recurring").then(() => load());
    refresh();

    const channel = sb.channel("barrett").on("postgres_changes", { event: "*", schema: "public" }, reload).subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [sb, load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ------------------------------------------------------------ derived state

  const now = new Date();
  const today = ymd(now);
  const live = tasks.filter((t) => !t.deleted_at);
  const trashed = tasks.filter((t) => t.deleted_at);
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const doneBy = new Map<string, string[]>();
  for (const c of completions) doneBy.set(c.task_id, [...(doneBy.get(c.task_id) ?? []), c.user_id]);

  const focusByTask = new Map<string, Profile>();
  for (const s of sessions) {
    const who = people.get(s.user_id);
    if (who) focusByTask.set(s.task_id, who);
  }
  const myFocus = sessions.find((s) => s.user_id === me.id);
  const myFocusTask = myFocus ? tasks.find((t) => t.id === myFocus.task_id) : undefined;

  const scoreStart = period === "week" ? weekStart(now) : monthStart(now);
  const scoreDay = ymd(scoreStart);
  const score = (id: string) =>
    completions.filter((c) => c.user_id === id && new Date(c.completed_at) >= scoreStart).reduce((n, c) => n + c.points, 0) +
    checkins.filter((k) => k.user_id === id && k.done_on >= scoreDay).reduce((n, k) => n + k.points, 0);
  const left = profiles[0];
  const right = profiles[1];
  const leftPts = left ? score(left.id) : 0;
  const rightPts = right ? score(right.id) : 0;
  const total = leftPts + rightPts;
  const lead =
    !left || !right
      ? ""
      : leftPts === rightPts
        ? "Dead even. Next finished task takes the lead."
        : `${(leftPts > rightPts ? left : right).display_name} leads by ${Math.abs(leftPts - rightPts)} points.`;

  const wins = live
    .filter((t) => t.status === "done" && t.completed_at)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5);

  const recurring = live.flatMap((t) => {
    const rule = t.recurring_rule_id ? ruleById.get(t.recurring_rule_id) : undefined;
    if (!rule) return [];
    const start = periodStart(rule.cadence, now);
    if (t.status === "done" && (t.due_date ?? "") < start) return [];
    return [{ task: t, rule, rolled: t.status !== "done" && (t.due_date ?? start) < start }];
  });

  const liveGroups = groups.filter((x) => !x.deleted_at);
  const groupById = new Map(liveGroups.map((x) => [x.id, x]));
  const liveProjects = projects.filter((x) => !x.deleted_at && groupById.has(x.group_id));
  const projectLabel = new Map(liveProjects.map((x) => [x.id, `${groupById.get(x.group_id)?.name} · ${x.name}`]));
  const toBuy = shopping.filter((i) => !i.bought_at).length;

  const boardCutoff = addDays(now, -14).toISOString();
  const boardTasks = live.filter(
    (t) => !t.recurring_rule_id && (t.status !== "done" || (t.completed_at ?? "") >= boardCutoff),
  );

  // ------------------------------------------------------------ actions

  const fail = (what: string, message: string) => setToast({ head: "Not saved", msg: `${what} ${message}` });

  /** Runs a write, reports a failure, then reloads so the screen matches the database. */
  async function write(what: string, op: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    const { error } = await op;
    if (error) fail(what, error.message);
    await load();
    return !error;
  }

  async function stopFocus() {
    await write(
      "The timer could not be stopped.",
      sb.from("focus_sessions").update({ ended_at: new Date().toISOString() }).eq("user_id", me.id).is("ended_at", null),
    );
  }

  async function startFocus(task: Task) {
    await sb.from("focus_sessions").update({ ended_at: new Date().toISOString() }).eq("user_id", me.id).is("ended_at", null);
    await write("The timer could not be started.", sb.from("focus_sessions").insert({ task_id: task.id, user_id: me.id }));
  }

  async function move(task: Task, status: Status) {
    if (task.status === status) return;
    if (status === "done") return setProofFor(task);
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    if (task.status === "done") {
      await write("The task could not be reopened.", sb.rpc("reopen_task", { p_task: task.id, p_status: status }));
    } else {
      await write("The task could not be moved.", sb.from("tasks").update({ status }).eq("id", task.id));
    }
    if (status !== "doing" && myFocus?.task_id === task.id) await stopFocus();
  }

  async function plan(task: Task, date: string | null) {
    if (task.planned_date === date) return;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, planned_date: date } : t)));
    await write("The day could not be changed.", sb.from("tasks").update({ planned_date: date }).eq("id", task.id));
  }

  async function flag(task: Task) {
    const next =
      task.flag_by !== me.id
        ? { flag_by: me.id, flag_kind: "high" }
        : task.flag_kind === "high"
          ? { flag_by: me.id, flag_kind: "low" }
          : { flag_by: null, flag_kind: null };
    await write("The flag could not be saved.", sb.from("tasks").update(next).eq("id", task.id));
  }

  async function restore(task: Task) {
    await write("The task could not be restored.", sb.from("tasks").update({ deleted_at: null }).eq("id", task.id));
  }

  async function remove(task: Task) {
    const ok = await write(
      "The task could not be deleted.",
      sb.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", task.id),
    );
    if (!ok) return;
    if (myFocus?.task_id === task.id) await stopFocus();
    setToast({ head: "Deleted", msg: `"${task.title}"`, action: { label: "Undo", run: () => restore(task) } });
  }

  async function save(draft: TaskDraft, existing?: Task) {
    const fields = {
      title: draft.title,
      notes: draft.notes || null,
      points: draft.points,
      owner_id: draft.owner_id,
      proof_type: draft.proof_type,
      planned_date: draft.planned_date,
      estimate_minutes: draft.estimate_minutes,
      remind_at: draft.remind_at,
      // These columns only exist once the 0002 migration has been run.
      ...(extrasError ? {} : { project_id: draft.project_id, deadline: draft.deadline }),
    };
    let error: { message: string } | null;
    if (existing) {
      const keepsLane = existing.status === "done" || !!existing.recurring_rule_id;
      ({ error } = await sb
        .from("tasks")
        .update({
          ...fields,
          ...(keepsLane ? {} : { status: draft.status }),
          // changed points answer the flag
          ...(existing.points !== draft.points ? { flag_by: null, flag_kind: null } : {}),
        })
        .eq("id", existing.id));
    } else if (draft.repeat !== "none") {
      ({ error } = await sb.from("recurring_rules").insert({
        title: draft.title,
        points: draft.points,
        cadence: draft.repeat,
        proof_type: draft.proof_type,
        remind_at: draft.remind_at,
        owner_id: draft.owner_id,
        created_by: me.id,
      }));
      if (!error) ({ error } = await sb.rpc("generate_recurring"));
    } else {
      ({ error } = await sb.from("tasks").insert({ ...fields, status: draft.status, created_by: me.id }));
    }
    if (error) throw new Error(`The task could not be saved. ${error.message}`);
    await load();
    setToast({ head: existing ? "Saved" : "Added", msg: `"${draft.title}"` });
  }

  async function complete(task: Task, userIds: string[], file: File) {
    const blob = await shrinkImage(file);
    const path = `${task.id}/${Date.now()}.jpg`;
    const upload = await sb.storage.from("proofs").upload(path, blob, { contentType: "image/jpeg" });
    if (upload.error) throw new Error(`The photo could not be uploaded. ${upload.error.message}`);
    const { error } = await sb.rpc("complete_task", { p_task: task.id, p_users: userIds, p_proof: path });
    if (error) throw new Error(`The task could not be closed. ${error.message}`);
    await load();
    const names = userIds.map((id) => people.get(id)?.display_name).filter(Boolean).join(" and ");
    setToast({ head: "Points banked", msg: `+${task.points}${userIds.length > 1 ? " each" : ""} to ${names} for "${task.title}".` });
  }

  async function undoRecurring(task: Task) {
    await write("The task could not be reopened.", sb.rpc("reopen_task", { p_task: task.id, p_status: "ready" }));
  }

  async function stopRule(rule: Rule) {
    const ok = await write("The repeat could not be stopped.", sb.from("recurring_rules").update({ active: false }).eq("id", rule.id));
    if (!ok) return;
    await write(
      "The open copy could not be removed.",
      sb.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("recurring_rule_id", rule.id).neq("status", "done"),
    );
    setToast({ head: "Stopped", msg: `"${rule.title}" will not repeat any more.` });
  }

  async function savePrize(text: string) {
    const current = prizes.find((p) => p.period === period)?.description ?? "";
    if (text === current) return;
    await write("The prize could not be saved.", sb.from("prizes").upsert({ period, description: text }));
  }

  // ------------------------------------------------------------ projects, shopping, goals

  /** Like write, but throws so an open dialog can show what went wrong. */
  async function must(what: string, op: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await op;
    if (error) throw new Error(`${what} ${error.message}`);
    await load();
  }

  const stamp = () => new Date().toISOString();

  const projectActions: ProjectActions = {
    addTask: (projectId) => setEditor({ projectId }),
    editTask: (task) => setEditor({ task }),
    finishTask: (task) => setProofFor(task),
    saveGroup: (name, existing) =>
      must(
        "The group could not be saved.",
        existing
          ? sb.from("project_groups").update({ name }).eq("id", existing.id)
          : sb.from("project_groups").insert({ name, created_by: me.id }),
      ),
    saveProject: (draft, existing) => {
      const fields = { name: draft.name, group_id: draft.group_id, notes: draft.notes || null, target_date: draft.target_date };
      return must(
        "The project could not be saved.",
        existing ? sb.from("projects").update(fields).eq("id", existing.id) : sb.from("projects").insert({ ...fields, created_by: me.id }),
      );
    },
    restoreGroup: (group) =>
      void write("The group could not be restored.", sb.from("project_groups").update({ deleted_at: null }).eq("id", group.id)),
    restoreProject: (project) =>
      void write("The project could not be restored.", sb.from("projects").update({ deleted_at: null }).eq("id", project.id)),
    // Deleting a group or project keeps its tasks. They stay on the board and come back with it on restore.
    async removeGroup(group) {
      const ok = await write("The group could not be deleted.", sb.from("project_groups").update({ deleted_at: stamp() }).eq("id", group.id));
      if (ok) setToast({ head: "Deleted", msg: `"${group.name}". Its tasks stay on the board.`, action: { label: "Undo", run: () => projectActions.restoreGroup(group) } });
    },
    async removeProject(project) {
      const ok = await write("The project could not be deleted.", sb.from("projects").update({ deleted_at: stamp() }).eq("id", project.id));
      if (ok) setToast({ head: "Deleted", msg: `"${project.name}". Its tasks stay on the board.`, action: { label: "Undo", run: () => projectActions.restoreProject(project) } });
    },
  };

  const shoppingActions: ShoppingActions = {
    add: (title, store) =>
      write("The item could not be added.", sb.from("shopping_items").insert({ title, store: store || null, added_by: me.id })),
    toggle(item) {
      const next = item.bought_at ? { bought_at: null, bought_by: null } : { bought_at: stamp(), bought_by: me.id };
      setShopping((list) => list.map((i) => (i.id === item.id ? { ...i, ...next } : i)));
      void write("The item could not be updated.", sb.from("shopping_items").update(next).eq("id", item.id));
    },
    async remove(item) {
      const ok = await write("The item could not be removed.", sb.from("shopping_items").delete().eq("id", item.id));
      if (!ok) return;
      const { id, ...rest } = item;
      setToast({
        head: "Removed",
        msg: `"${item.title}"`,
        action: { label: "Undo", run: () => void write("The item could not be put back.", sb.from("shopping_items").insert({ id, ...rest })) },
      });
    },
    clearBought: () => void write("The list could not be cleared.", sb.from("shopping_items").delete().not("bought_at", "is", null)),
  };

  const goalActions: GoalActions = {
    save: (draft, existing) => {
      const fields = { ...draft, notes: draft.notes || null };
      return must(
        "The goal could not be saved.",
        existing ? sb.from("goals").update(fields).eq("id", existing.id) : sb.from("goals").insert({ ...fields, created_by: me.id }),
      );
    },
    async checkIn(goal, date) {
      const ok = await write(
        "The session could not be logged.",
        sb.from("goal_checkins").insert({ goal_id: goal.id, user_id: me.id, kind: "checkin", done_on: date, points: goal.checkin_points }),
      );
      if (ok) setToast({ head: goal.checkin_points ? "Points banked" : "Logged", msg: `${goal.checkin_points ? `+${goal.checkin_points} for ` : ""}"${goal.title}".` });
    },
    undoCheckIn: (checkin) => void write("The session could not be removed.", sb.from("goal_checkins").delete().eq("id", checkin.id)),
    async achieve(goal) {
      // Everyone on the goal gets the finish points: one person, or both for a shared goal.
      const who = goal.owner_id ? [goal.owner_id] : profiles.map((x) => x.id);
      const rows = who.map((user_id) => ({ goal_id: goal.id, user_id, kind: "finish", done_on: today, points: goal.finish_points }));
      const ok = await write("The goal could not be closed.", sb.from("goal_checkins").insert(rows));
      if (!ok) return;
      await write("The goal could not be closed.", sb.from("goals").update({ achieved_at: stamp() }).eq("id", goal.id));
      setToast({ head: "Goal achieved", msg: `"${goal.title}"${goal.finish_points ? ` +${goal.finish_points}${who.length > 1 ? " each" : ""}` : ""}. Nice work.` });
    },
    async reopen(goal) {
      const ok = await write("The goal could not be reopened.", sb.from("goal_checkins").delete().eq("goal_id", goal.id).eq("kind", "finish"));
      if (ok) await write("The goal could not be reopened.", sb.from("goals").update({ achieved_at: null }).eq("id", goal.id));
    },
    async remove(goal) {
      const ok = await write("The goal could not be deleted.", sb.from("goals").update({ deleted_at: stamp() }).eq("id", goal.id));
      if (!ok) return;
      setToast({
        head: "Deleted",
        msg: `"${goal.title}"`,
        action: { label: "Undo", run: () => void write("The goal could not be restored.", sb.from("goals").update({ deleted_at: null }).eq("id", goal.id)) },
      });
    },
  };

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("barrett-theme", next);
    } catch {
      // private browsing: the choice just does not persist
    }
  }

  const actions: CardActions = {
    move,
    startFocus,
    stopFocus,
    flag,
    edit: (task) => setEditor({ task }),
    remove,
  };

  const card = (task: Task, compact = false) => (
    <TaskCard
      key={task.id}
      task={task}
      me={me}
      people={people}
      doneBy={doneBy.get(task.id) ?? []}
      focusedBy={focusByTask.get(task.id)}
      proofUrl={task.proof_path ? urls[task.proof_path] : undefined}
      projectName={task.project_id ? projectLabel.get(task.project_id) : undefined}
      compact={compact}
      actions={actions}
    />
  );

  // ------------------------------------------------------------ week view data

  const monday = addDays(weekStart(now), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  /** The day a task shows on. Open recurring tasks follow you to today: that is the rollover. */
  const dayOf = (t: Task): string | null => {
    if (t.status === "done") return t.planned_date ?? (t.completed_at ? ymd(new Date(t.completed_at)) : null);
    if (t.recurring_rule_id) return (t.planned_date ?? today) < today ? today : (t.planned_date ?? today);
    return t.planned_date;
  };
  const weekTasks = live.filter((t) => !t.recurring_rule_id || ruleById.has(t.recurring_rule_id));
  const unplanned = weekTasks.filter((t) => t.status !== "done" && !t.recurring_rule_id && !t.planned_date);

  // ------------------------------------------------------------ render

  return (
    <div className="wrap">
      <div className="top">
        <div className="name">
          <h1>Barrett</h1>
          <span className="hello">Hi {me.display_name}</span>
        </div>
        <button className="btn" onClick={toggleTheme}>
          Light / dark
        </button>
        <Link className="btn" href="/account">
          Account
        </Link>
        <button className="btn primary" onClick={() => setEditor({})}>
          New task
        </button>
      </div>

      {loadError && <p className="err" role="alert">{loadError}</p>}

      {myFocus && myFocusTask && <FocusBar title={myFocusTask.title} startedAt={myFocus.started_at} onStop={stopFocus} />}

      <nav className="tabs" aria-label="Sections">
        {TABS.map((x) => (
          <button key={x.id} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {x.title}
            {x.id === "shopping" && toBuy > 0 && <span className="n">{toBuy}</span>}
          </button>
        ))}
      </nav>

      {tab !== "tasks" && extrasError && (
        <div className="panel" role="alert">
          <span className="label">One-time setup needed</span>
          <p>
            Projects, the shopping list and goals need a database update. In Supabase, open the SQL editor, paste the
            contents of <code>supabase/migrations/0002_projects_shopping_goals.sql</code>, run it once, then reload this page.
          </p>
          <p className="note">{extrasError}</p>
        </div>
      )}
      {tab === "projects" && !extrasError && (
        <ProjectsView
          groups={groups}
          projects={projects}
          tasks={live}
          people={people}
          doneBy={doneBy}
          today={today}
          loaded={loaded}
          actions={projectActions}
        />
      )}
      {tab === "shopping" && !extrasError && <ShoppingView items={shopping} people={people} loaded={loaded} actions={shoppingActions} />}
      {tab === "goals" && !extrasError && (
        <GoalsView goals={goals} checkins={checkins} me={me} profiles={profiles} today={today} loaded={loaded} actions={goalActions} />
      )}

      {tab === "tasks" && (
      <>
      <section className="score" aria-label="Score">
        <div className="duel">
          <div className="duelhead">
            <span className="label">{period === "week" ? "This week" : "This month"}</span>
            <div className="seg" role="group" aria-label="Recap period">
              <button aria-pressed={period === "week"} onClick={() => setPeriod("week")}>
                Week
              </button>
              <button aria-pressed={period === "month"} onClick={() => setPeriod("month")}>
                Month
              </button>
            </div>
          </div>
          <div className="players">
            {left && (
              <div className="player">
                <div className="who">
                  <span className={`dot ${left.color}`} />
                  {left.display_name}
                </div>
                <div className="pts">{leftPts}</div>
              </div>
            )}
            {right && (
              <div className="player right">
                <div className="who">
                  {right.display_name}
                  <span className={`dot ${right.color}`} />
                </div>
                <div className="pts">{rightPts}</div>
              </div>
            )}
          </div>
          {left && right && (
            <div className="bar" aria-hidden="true">
              <i className={left.color} style={{ width: `${total ? (leftPts / total) * 100 : 50}%` }} />
              <i className={right.color} style={{ width: `${total ? (rightPts / total) * 100 : 50}%` }} />
            </div>
          )}
          <div className="lead">{lead}</div>
          <div className="prize">
            <label className="label" htmlFor="prizeInput">
              {period === "week" ? "Weekly prize" : "Monthly prize"}
            </label>
            <input
              id="prizeInput"
              key={`${period}:${prizes.find((p) => p.period === period)?.description ?? ""}`}
              defaultValue={prizes.find((p) => p.period === period)?.description ?? ""}
              maxLength={80}
              placeholder="Loser buys dinner?"
              onBlur={(e) => savePrize(e.target.value.trim())}
            />
          </div>
        </div>
        <div className="wins">
          <span className="label">Recently finished</span>
          <ul>
            {wins.map((t) => {
              const by = (doneBy.get(t.id) ?? []).map((id) => people.get(id)).filter((p): p is Profile => !!p);
              const url = t.proof_path ? urls[t.proof_path] : undefined;
              return (
                <li key={t.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url ? <img className="thumb" src={url} alt={`Proof for ${t.title}`} /> : <span className="thumb" />}
                  <span className="t">
                    {by.map((p) => (
                      <span key={p.id} className={`dot ${p.color}`} title={p.display_name} />
                    ))}
                    {t.title}
                  </span>
                  <span className="p">
                    +{t.points}
                    {by.length > 1 ? " each" : ""}
                  </span>
                </li>
              );
            })}
            {loaded && wins.length === 0 && <li className="empty">Nothing finished yet. First one on the board takes the lead.</li>}
          </ul>
        </div>
      </section>

      <section className="stack">
        <div className="sectionhead">
          <h2>Recurring</h2>
          <button className="btn small ghost" aria-expanded={showRules} onClick={() => setShowRules((v) => !v)}>
            Manage ({rules.length})
          </button>
        </div>
        {showRules && (
          <div className="panel">
            <span className="label">Repeating tasks</span>
            <ul className="plain">
              {rules.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.title} · {CADENCE_LABEL[r.cadence]} · {r.points} pts
                  </span>
                  <button className="btn small danger" onClick={() => stopRule(r)}>
                    Stop repeating
                  </button>
                </li>
              ))}
              {rules.length === 0 && <li className="empty">Nothing repeats yet.</li>}
            </ul>
          </div>
        )}
        <div className="chips">
          {recurring.map(({ task: t, rule, rolled }) => {
            const done = t.status === "done";
            const by = (doneBy.get(t.id) ?? []).map((id) => people.get(id)?.display_name).filter(Boolean).join(" + ");
            return (
              <button
                key={t.id}
                className={`chip ${done ? "done" : ""}`}
                aria-pressed={done}
                onClick={() => (done ? undoRecurring(t) : setProofFor(t))}
              >
                <span className="box">{done ? "✓" : ""}</span>
                <span>
                  {t.title}
                  <small>
                    {CADENCE_LABEL[rule.cadence]} · {done ? `${by} +${t.points}` : `${t.points} pts`}
                    {!done && t.remind_at ? ` · remind ${clock(t.remind_at)}` : ""}
                    {rolled && t.due_date ? (
                      <>
                        {" · "}
                        <span className="late">rolled over from {dayLabel(fromYmd(t.due_date))}</span>
                      </>
                    ) : null}
                  </small>
                </span>
              </button>
            );
          })}
          {loaded && recurring.length === 0 && (
            <p className="empty">No repeating tasks yet. Add one with New task and pick Daily, Weekly or Monthly.</p>
          )}
        </div>
      </section>

      <section className="stack">
        <div className="sectionhead">
          <div className="row">
            <h2>Board</h2>
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={view === "board"} onClick={() => setView("board")}>
                Board
              </button>
              <button aria-pressed={view === "week"} onClick={() => setView("week")}>
                Week
              </button>
            </div>
          </div>
          <div className="row">
            {view === "week" && (
              <>
                <button className="btn small" aria-label="Previous week" onClick={() => setWeekOffset((n) => n - 1)}>
                  ←
                </button>
                <button className="btn small" onClick={() => setWeekOffset(0)}>
                  This week
                </button>
                <button className="btn small" aria-label="Next week" onClick={() => setWeekOffset((n) => n + 1)}>
                  →
                </button>
              </>
            )}
            <button className="btn small ghost" aria-expanded={showTrash} onClick={() => setShowTrash((v) => !v)}>
              Deleted ({trashed.length})
            </button>
          </div>
        </div>

        {showTrash && (
          <div className="panel">
            <span className="label">Deleted tasks</span>
            <ul className="plain">
              {trashed.map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <button className="btn small" onClick={() => restore(t)}>
                    Restore
                  </button>
                </li>
              ))}
              {trashed.length === 0 && <li className="empty">No deleted tasks.</li>}
            </ul>
          </div>
        )}

        {view === "board" ? (
          <DragArea
            onDrop={(id, lane) => {
              const task = tasks.find((t) => t.id === id);
              if (task) move(task, lane as Status);
            }}
          >
            <div className="board">
              {LANES.map((l) => {
                const list = boardTasks.filter((t) => t.status === l.id);
                if (l.id === "done") list.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
                return (
                  <Lane key={l.id} id={l.id}>
                    <header>
                      <h3>{l.title}</h3>
                      <span>{list.length}</span>
                    </header>
                    {list.map((t) => card(t))}
                    {loaded && list.length === 0 && (
                      <div className="empty">{l.id === "backlog" ? "Nothing waiting. Add a task to get started." : "Nothing here."}</div>
                    )}
                  </Lane>
                );
              })}
            </div>
          </DragArea>
        ) : (
          <DragArea
            onDrop={(id, lane) => {
              const task = tasks.find((t) => t.id === id);
              if (task) plan(task, lane === "unplanned" ? null : lane);
            }}
          >
            <div className="weekscroll">
              <div className="week">
                <Lane id="unplanned">
                  <header>
                    <h3>No day yet</h3>
                    <span>{unplanned.length}</span>
                  </header>
                  {unplanned.map((t) => card(t, true))}
                  {loaded && unplanned.length === 0 && <div className="empty">Everything has a day.</div>}
                </Lane>
                {days.map((d) => {
                  const key = ymd(d);
                  const list = weekTasks.filter((t) => dayOf(t) === key);
                  const open = list.filter((t) => t.status !== "done");
                  const pts = open.reduce((n, t) => n + t.points, 0);
                  const mins = open.reduce((n, t) => n + (t.estimate_minutes ?? 0), 0);
                  return (
                    <Lane key={key} id={key} className={key === today ? "today" : ""}>
                      <header>
                        <h3>{dayLabel(d)}</h3>
                        <span>{list.length}</span>
                      </header>
                      {list.map((t) => card(t, true))}
                      <button className="addday" onClick={() => setEditor({ date: key })}>
                        + Add
                      </button>
                      <footer>
                        {open.length ? `${pts} pts to earn${mins ? ` · ${minutesLabel(mins)}` : ""}` : "Nothing left"}
                      </footer>
                    </Lane>
                  );
                })}
              </div>
            </div>
          </DragArea>
        )}
        <p className="note">
          Drag a card to move it. On a phone, press and hold first. Closing a task needs a quick photo or screenshot.
        </p>
      </section>
      </>
      )}

      {editor && (
        <TaskEditor
          task={editor.task}
          date={editor.date}
          projectId={editor.projectId}
          profiles={profiles}
          groups={liveGroups}
          projects={liveProjects}
          onSave={(draft) => save(draft, editor.task)}
          onClose={() => setEditor(null)}
        />
      )}
      {proofFor && (
        <ProofDialog
          task={proofFor}
          me={me}
          other={other}
          onComplete={(ids, file) => complete(proofFor, ids, file)}
          onClose={() => setProofFor(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <div>
            <b>{toast.head}</b>
            <span>{toast.msg}</span>
          </div>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FocusBar({ title, startedAt, onStop }: { title: string; startedAt: string; onStop: () => void }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secs = now ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <div className="focus">
      <div className="clock" aria-label="Time on task">
        {mm}:{ss}
      </div>
      <div className="what">
        <b>{title}</b>
        <span>Focus timer running. Stay off the feeds until this is done.</span>
      </div>
      <button className="stop" onClick={onStop}>
        Stop timer
      </button>
    </div>
  );
}
