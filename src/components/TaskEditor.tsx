"use client";

import { useState } from "react";
import type { Cadence, Profile, Project, ProjectGroup, ProofType, Status, Task, TaskDraft } from "@/lib/types";

interface Props {
  task?: Task;
  /** Pre-filled day when adding from the week view. */
  date?: string;
  /** Pre-picked project when adding from the Projects section. */
  projectId?: string;
  profiles: Profile[];
  /** Live groups and projects. Empty until there is somewhere to file a task. */
  groups: ProjectGroup[];
  projects: Project[];
  onSave(draft: TaskDraft): Promise<void>;
  onClose(): void;
}

const POINT_CHIPS = [
  { v: 5, label: "5 quick job" },
  { v: 10, label: "10 some effort" },
  { v: 20, label: "20 project" },
];
const TIME_CHIPS = [15, 30, 60];

export function TaskEditor({ task, date, projectId, profiles, groups, projects, onSave, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [points, setPoints] = useState(String(task?.points ?? 5));
  const [owner, setOwner] = useState(task?.owner_id ?? "");
  const [proof, setProof] = useState<ProofType>(task?.proof_type ?? "photo");
  const [planned, setPlanned] = useState(task?.planned_date ?? date ?? "");
  const [estimate, setEstimate] = useState(task?.estimate_minutes ? String(task.estimate_minutes) : "");
  const [remind, setRemind] = useState(task?.remind_at?.slice(0, 5) ?? "");
  const [status, setStatus] = useState<Exclude<Status, "done">>(
    task && task.status !== "done" ? task.status : date ? "ready" : "backlog",
  );
  const [repeat, setRepeat] = useState<Cadence | "none">("none");
  const [project, setProject] = useState(task?.project_id ?? projectId ?? "");
  const [deadline, setDeadline] = useState(task?.deadline ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isInstance = !!task?.recurring_rule_id;
  const showLane = !isInstance && task?.status !== "done" && repeat === "none";
  // One-off tasks only: a repeating task has no finish line to file under a project.
  const oneOff = !isInstance && repeat === "none";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the task a name.");
    const p = Math.round(Number(points));
    if (!(p >= 1 && p <= 200)) return setError("Points need to be between 1 and 200.");
    const est = estimate ? Math.round(Number(estimate)) : null;
    if (est !== null && !(est >= 1 && est <= 1440)) return setError("Time estimate needs to be between 1 and 1440 minutes.");
    setBusy(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim(),
        points: p,
        owner_id: owner || null,
        proof_type: proof,
        planned_date: planned || null,
        estimate_minutes: est,
        remind_at: remind || null,
        status,
        repeat,
        project_id: oneOff ? project || null : null,
        deadline: oneOff ? deadline || null : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="editorTitle" onSubmit={submit} noValidate>
        <h2 id="editorTitle">{task ? "Edit task" : "New task"}</h2>
        <div className="field">
          <label htmlFor="fTitle">What needs doing</label>
          <input id="fTitle" maxLength={90} autoComplete="off" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fNotes">Notes (optional)</label>
          <textarea id="fNotes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="fPoints">Points</label>
            <input id="fPoints" type="number" min={1} max={200} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
            <div className="row">
              {POINT_CHIPS.map((c) => (
                <button type="button" key={c.v} className="btn small" aria-pressed={points === String(c.v)} onClick={() => setPoints(String(c.v))}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="fEstimate">Time estimate, minutes (optional)</label>
            <input id="fEstimate" type="number" min={1} max={1440} inputMode="numeric" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            <div className="row">
              {TIME_CHIPS.map((m) => (
                <button type="button" key={m} className="btn small" aria-pressed={estimate === String(m)} onClick={() => setEstimate(String(m))}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="fOwner">Who</label>
            <select id="fOwner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Up for grabs</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fProof">Proof when done</label>
            <select id="fProof" value={proof} onChange={(e) => setProof(e.target.value as ProofType)}>
              <option value="photo">Photo (around the house)</option>
              <option value="screenshot">Screenshot (online)</option>
            </select>
          </div>
          {!task && (
            <div className="field">
              <label htmlFor="fRepeat">Repeats</label>
              <select id="fRepeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Cadence | "none")}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}
          {repeat === "none" && (
            <div className="field">
              <label htmlFor="fPlanned">Planned day (optional)</label>
              <input id="fPlanned" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </div>
          )}
          {oneOff && (
            <div className="field">
              <label htmlFor="fDeadline">Finish by (optional)</label>
              <input id="fDeadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          )}
          {oneOff && projects.length > 0 && (
            <div className="field">
              <label htmlFor="fProject">Project (optional)</label>
              <select id="fProject" value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">No project</option>
                {groups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {projects
                      .filter((p) => p.group_id === g.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="fRemind">Remind if not done by</label>
            <input id="fRemind" type="time" value={remind} onChange={(e) => setRemind(e.target.value)} />
          </div>
          {showLane && (
            <div className="field">
              <label htmlFor="fStatus">Lane</label>
              <select id="fStatus" value={status} onChange={(e) => setStatus(e.target.value as Exclude<Status, "done">)}>
                <option value="backlog">Backlog</option>
                <option value="ready">Ready to start</option>
                <option value="doing">In progress</option>
              </select>
            </div>
          )}
        </div>
        {repeat !== "none" && <p className="note">A fresh copy appears each period. If it is not finished, it rolls over until it is.</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {task ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}
