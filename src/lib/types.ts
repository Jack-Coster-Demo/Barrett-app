export type Status = "backlog" | "ready" | "doing" | "done";
export type ProofType = "photo" | "screenshot";
export type Cadence = "daily" | "weekly" | "monthly";
export type Period = "week" | "month";

export interface Profile {
  id: string;
  display_name: string;
  color: "sapphire" | "terracotta";
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  points: number;
  owner_id: string | null;
  status: Status;
  proof_type: ProofType;
  planned_date: string | null;
  estimate_minutes: number | null;
  remind_at: string | null;
  recurring_rule_id: string | null;
  due_date: string | null;
  rolled_from: string | null;
  flag_by: string | null;
  flag_kind: "high" | "low" | null;
  completed_at: string | null;
  proof_path: string | null;
  deleted_at: string | null;
  created_at: string;
  /** Set when the task belongs to a project. Missing until migration 0002 has been run. */
  project_id?: string | null;
  /** "Finish by" date. */
  deadline?: string | null;
}

export interface Completion {
  task_id: string;
  user_id: string;
  points: number;
  completed_at: string;
}

export interface Rule {
  id: string;
  title: string;
  points: number;
  cadence: Cadence;
  active: boolean;
}

export interface FocusSession {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface Prize {
  period: Period;
  description: string;
}

/** What the task editor hands back. */
export interface TaskDraft {
  title: string;
  notes: string;
  points: number;
  owner_id: string | null;
  proof_type: ProofType;
  planned_date: string | null;
  estimate_minutes: number | null;
  remind_at: string | null;
  status: Exclude<Status, "done">;
  repeat: Cadence | "none";
  project_id: string | null;
  deadline: string | null;
}

export interface ProjectGroup {
  id: string;
  name: string;
  deleted_at: string | null;
}

export interface Project {
  id: string;
  group_id: string;
  name: string;
  notes: string | null;
  target_date: string | null;
  deleted_at: string | null;
}

export interface ProjectDraft {
  name: string;
  group_id: string;
  notes: string;
  target_date: string | null;
}

export interface ShoppingItem {
  id: string;
  title: string;
  store: string | null;
  added_by: string | null;
  bought_at: string | null;
  bought_by: string | null;
}

export type GoalKind = "weekly" | "target";

export interface Goal {
  id: string;
  title: string;
  notes: string | null;
  /** null = a goal both people are working on. */
  owner_id: string | null;
  kind: GoalKind;
  weekly_target: number | null;
  target_date: string | null;
  checkin_points: number;
  finish_points: number;
  achieved_at: string | null;
  deleted_at: string | null;
}

export interface GoalCheckin {
  id: string;
  goal_id: string;
  user_id: string;
  kind: "checkin" | "finish";
  done_on: string;
  points: number;
}

export interface GoalDraft {
  title: string;
  notes: string;
  owner_id: string | null;
  kind: GoalKind;
  weekly_target: number | null;
  target_date: string | null;
  checkin_points: number;
  finish_points: number;
}

export const LANES: { id: Status; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "ready", title: "Ready to start" },
  { id: "doing", title: "In progress" },
  { id: "done", title: "Complete" },
];
