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
}

export const LANES: { id: Status; title: string }[] = [
  { id: "backlog", title: "Backlog" },
  { id: "ready", title: "Ready to start" },
  { id: "doing", title: "In progress" },
  { id: "done", title: "Complete" },
];
