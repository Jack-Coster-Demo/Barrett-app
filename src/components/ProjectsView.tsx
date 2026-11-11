"use client";

import { useState } from "react";
import { dayLabel, fromYmd } from "@/lib/dates";
import { LANES, type Profile, type Project, type ProjectDraft, type ProjectGroup, type Task } from "@/lib/types";

export interface ProjectActions {
  addTask(projectId: string): void;
  editTask(task: Task): void;
  finishTask(task: Task): void;
  saveGroup(name: string, existing?: ProjectGroup): Promise<void>;
  saveProject(draft: ProjectDraft, existing?: Project): Promise<void>;
  removeGroup(group: ProjectGroup): void;
  removeProject(project: Project): void;
  restoreGroup(group: ProjectGroup): void;
  restoreProject(project: Project): void;
}

interface Props {
  groups: ProjectGroup[];
  projects: Project[];
  /** Live tasks only. */
  tasks: Task[];
  people: Map<string, Profile>;
  doneBy: Map<string, string[]>;
  today: string;
  loaded: boolean;
  actions: ProjectActions;
}

type Dialog = { kind: "group"; group?: ProjectGroup } | { kind: "project"; project?: Project; groupId: string };

export function ProjectsView({ groups, projects, tasks, people, doneBy, today, loaded, actions }: Props) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const liveGroups = groups.filter((g) => !g.deleted_at);
  const liveIds = new Set(liveGroups.map((g) => g.id));
  const goneGroups = groups.filter((g) => g.deleted_at);
  const goneProjects = projects.filter((p) => p.deleted_at && liveIds.has(p.group_id));
  const goneCount = goneGroups.length + goneProjects.length;

  const tasksOf = (projectId: string) =>
    tasks
      .filter((t) => t.project_id === projectId)
      .sort(
        (a, b) =>
          Number(a.status === "done") - Number(b.status === "done") ||
          (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
          a.created_at.localeCompare(b.created_at),
      );

  return (
    <section className="stack">
      <div className="sectionhead">
        <h2>Projects</h2>
        <div className="row">
          {goneCount > 0 && (
            <button className="btn small ghost" aria-expanded={showDeleted} onClick={() => setShowDeleted((v) => !v)}>
              Deleted ({goneCount})
            </button>
          )}
          <button className="btn small" onClick={() => setDialog({ kind: "group" })}>
            New group
          </button>
        </div>
      </div>

      {showDeleted && goneCount > 0 && (
        <div className="panel">
          <span className="label">Deleted groups and projects</span>
          <ul className="plain">
            {goneGroups.map((g) => (
              <li key={g.id}>
                <span>{g.name} (group)</span>
                <button className="btn small" onClick={() => actions.restoreGroup(g)}>
                  Restore
                </button>
              </li>
            ))}
            {goneProjects.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <button className="btn small" onClick={() => actions.restoreProject(p)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loaded && liveGroups.length === 0 && (
        <p className="empty">
          No groups yet. A group holds related projects, for example House Projects with Closets and Garage inside it.
        </p>
      )}

      {liveGroups.map((g) => {
        const mine = projects.filter((p) => p.group_id === g.id && !p.deleted_at);
        const all = mine.flatMap((p) => tasksOf(p.id));
        const done = all.filter((t) => t.status === "done").length;
        return (
          <div className="group" key={g.id}>
            <div className="grouphead">
              <h3>{g.name}</h3>
              <span className="count">
                {mine.length} {mine.length === 1 ? "project" : "projects"}
                {all.length ? ` · ${done} of ${all.length} tasks done` : ""}
              </span>
              <span className="sp" />
              <button className="icon" onClick={() => setDialog({ kind: "group", group: g })}>
                Rename
              </button>
              <button className="icon" aria-label={`Delete group ${g.name}`} onClick={() => actions.removeGroup(g)}>
                ✕
              </button>
              <button className="btn small" onClick={() => setDialog({ kind: "project", groupId: g.id })}>
                Add project
              </button>
            </div>
            <div className="projgrid">
              {mine.map((p) => {
                const list = tasksOf(p.id);
                const closed = list.filter((t) => t.status === "done");
                const pts = list.reduce((n, t) => n + t.points, 0);
                const earned = closed.reduce((n, t) => n + t.points, 0);
                const late = !!p.target_date && p.target_date < today && closed.length < list.length;
                return (
                  <article className="proj" key={p.id}>
                    <header>
                      <h4>{p.name}</h4>
                      <button className="icon" onClick={() => setDialog({ kind: "project", project: p, groupId: g.id })}>
                        Edit
                      </button>
                      <button className="icon" aria-label={`Delete project ${p.name}`} onClick={() => actions.removeProject(p)}>
                        ✕
                      </button>
                    </header>
                    {p.notes && <div className="notes">{p.notes}</div>}
                    <div className="meta">
                      <span className="pill">
                        {closed.length} of {list.length} done
                      </span>
                      {pts > 0 && (
                        <span className="pill">
                          {earned} of {pts} pts
                        </span>
                      )}
                      {p.target_date && <span className={`pill ${late ? "late" : ""}`}>By {dayLabel(fromYmd(p.target_date))}</span>}
                    </div>
                    <div className="bar thin" aria-hidden="true">
                      <i className="sapphire" style={{ width: `${list.length ? (closed.length / list.length) * 100 : 0}%` }} />
                    </div>
                    <ul className="steps">
                      {list.map((t) => {
                        const isDone = t.status === "done";
                        const owner = t.owner_id ? people.get(t.owner_id) : undefined;
                        const doers = (doneBy.get(t.id) ?? []).map((id) => people.get(id)).filter((x): x is Profile => !!x);
                        return (
                          <li key={t.id} className={isDone ? "isdone" : ""}>
                            <button
                              className="box"
                              disabled={isDone}
                              aria-label={isDone ? `${t.title} is done` : `Close ${t.title}`}
                              onClick={() => actions.finishTask(t)}
                            >
                              {isDone ? "✓" : ""}
                            </button>
                            <div className="steptext">
                              <span className="title">{t.title}</span>
                              <div className="meta">
                                <span className="pill pts">{t.points} pts</span>
                                {isDone ? (
                                  <span className={`pill ${doers.length === 1 ? doers[0].color : ""}`}>
                                    {doers.length ? `Done by ${doers.map((x) => x.display_name).join(" + ")}` : "Done"}
                                  </span>
                                ) : (
                                  <>
                                    <span className={`pill ${owner?.color ?? ""}`}>{owner ? owner.display_name : "Up for grabs"}</span>
                                    <span className="pill">{LANES.find((l) => l.id === t.status)?.title}</span>
                                    {t.deadline && (
                                      <span className={`pill ${t.deadline < today ? "late" : ""}`}>By {dayLabel(fromYmd(t.deadline))}</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <button className="icon" onClick={() => actions.editTask(t)}>
                              Edit
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <button className="addday" onClick={() => actions.addTask(p.id)}>
                      + Add task
                    </button>
                  </article>
                );
              })}
              {mine.length === 0 && <p className="empty">No projects in this group yet.</p>}
            </div>
          </div>
        );
      })}

      {liveGroups.length > 0 && (
        <p className="note">
          Project tasks are regular tasks. They show on the board, earn points and need a photo or screenshot to close.
        </p>
      )}

      {dialog?.kind === "group" && (
        <GroupDialog group={dialog.group} onSave={(name) => actions.saveGroup(name, dialog.group)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "project" && (
        <ProjectDialog
          project={dialog.project}
          groupId={dialog.groupId}
          groups={liveGroups}
          onSave={(draft) => actions.saveProject(draft, dialog.project)}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function GroupDialog({ group, onSave, onClose }: { group?: ProjectGroup; onSave(name: string): Promise<void>; onClose(): void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the group a name.");
    setBusy(true);
    setError("");
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The group could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="groupTitle" onSubmit={submit} noValidate>
        <h2 id="groupTitle">{group ? "Rename group" : "New group"}</h2>
        <div className="field">
          <label htmlFor="gName">Group name</label>
          <input id="gName" maxLength={60} autoComplete="off" autoFocus placeholder="House Projects" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {group ? "Save" : "Add group"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectDialog({
  project,
  groupId,
  groups,
  onSave,
  onClose,
}: {
  project?: Project;
  groupId: string;
  groups: ProjectGroup[];
  onSave(draft: ProjectDraft): Promise<void>;
  onClose(): void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [group, setGroup] = useState(project?.group_id ?? groupId);
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [target, setTarget] = useState(project?.target_date ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the project a name.");
    setBusy(true);
    setError("");
    try {
      await onSave({ name: name.trim(), group_id: group, notes: notes.trim(), target_date: target || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="projTitle" onSubmit={submit} noValidate>
        <h2 id="projTitle">{project ? "Edit project" : "New project"}</h2>
        <div className="field">
          <label htmlFor="pName">Project name</label>
          <input id="pName" maxLength={60} autoComplete="off" autoFocus placeholder="Closets" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pNotes">Notes (optional)</label>
          <textarea id="pNotes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="pGroup">Group</label>
            <select id="pGroup" value={group} onChange={(e) => setGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pTarget">Finish by (optional)</label>
            <input id="pTarget" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {project ? "Save changes" : "Add project"}
          </button>
        </div>
      </form>
    </div>
  );
}
