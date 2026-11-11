"use client";

import { clock, dayLabel, fromYmd, minutesLabel } from "@/lib/dates";
import { LANES, type Profile, type Status, type Task } from "@/lib/types";
import { Draggable } from "./Lanes";

export interface CardActions {
  move(task: Task, status: Status): void;
  startFocus(task: Task): void;
  stopFocus(): void;
  flag(task: Task): void;
  edit(task: Task): void;
  remove(task: Task): void;
}

interface Props {
  task: Task;
  me: Profile;
  people: Map<string, Profile>;
  /** Who earned the points, once the task is done. */
  doneBy: string[];
  /** Whoever has a focus timer running on this task. */
  focusedBy?: Profile;
  proofUrl?: string;
  compact?: boolean;
  actions: CardActions;
}

export function TaskCard({ task, me, people, doneBy, focusedBy, proofUrl, compact, actions }: Props) {
  const done = task.status === "done";
  const lane = LANES.findIndex((l) => l.id === task.status);
  const owner = task.owner_id ? people.get(task.owner_id) : undefined;
  const doers = doneBy.map((id) => people.get(id)).filter((p): p is Profile => !!p);
  const flagger = task.flag_by ? people.get(task.flag_by) : undefined;
  const mineLive = focusedBy?.id === me.id;

  const pills = (
    <div className="meta">
      <span className="pill pts">
        {task.points} pts{done && doers.length > 1 ? " each" : ""}
      </span>
      {done ? (
        <span className={`pill ${doers.length === 1 ? doers[0].color : ""}`}>
          {doers.length ? `Done by ${doers.map((p) => p.display_name).join(" + ")}` : "Done"}
        </span>
      ) : (
        <span className={`pill ${owner?.color ?? ""}`}>{owner ? owner.display_name : "Up for grabs"}</span>
      )}
      {!done && task.estimate_minutes ? <span className="pill">{minutesLabel(task.estimate_minutes)}</span> : null}
      {!done && !compact && task.planned_date ? <span className="pill">{dayLabel(fromYmd(task.planned_date))}</span> : null}
      {!done && task.remind_at ? <span className="pill">Remind {clock(task.remind_at)}</span> : null}
      {!done && flagger && task.flag_kind ? (
        <span className="pill flag">
          {flagger.display_name}: points look {task.flag_kind}
        </span>
      ) : null}
      {focusedBy && !mineLive ? <span className="pill">{focusedBy.display_name} is on it</span> : null}
    </div>
  );

  if (compact) {
    return (
      <Draggable id={task.id} className={`compact ${done ? "isdone" : ""} ${focusedBy ? "live" : ""}`}>
        <div className="title">{task.title}</div>
        {pills}
        <div className="acts">
          {!done && (
            <button className="icon go" onClick={() => actions.move(task, "done")}>
              Done ✓
            </button>
          )}
          <span className="sp" />
          <button className="icon" onClick={() => actions.edit(task)}>
            Edit
          </button>
        </div>
      </Draggable>
    );
  }

  return (
    <Draggable id={task.id} className={focusedBy ? "live" : ""}>
      <div className="title">{task.title}</div>
      {task.notes && <div className="notes">{task.notes}</div>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {done && proofUrl && <img className="proofimg" src={proofUrl} alt={`Proof for ${task.title}`} />}
      {pills}
      <div className="acts">
        {lane > 0 && (
          <button className="icon" aria-label={`Move back to ${LANES[lane - 1].title}`} onClick={() => actions.move(task, LANES[lane - 1].id)}>
            ←
          </button>
        )}
        {lane < 3 && (
          <button
            className={`icon ${lane === 2 ? "go" : ""}`}
            aria-label={`Move to ${LANES[lane + 1].title}`}
            onClick={() => actions.move(task, LANES[lane + 1].id)}
          >
            {lane === 2 ? "Done ✓" : "→"}
          </button>
        )}
        {task.status === "doing" && (!focusedBy || mineLive) && (
          <button className="icon" onClick={() => (mineLive ? actions.stopFocus() : actions.startFocus(task))}>
            {mineLive ? "Stop timer" : "Start timer"}
          </button>
        )}
        {!done && (
          <button className="icon" onClick={() => actions.flag(task)}>
            {task.flag_by === me.id ? (task.flag_kind === "high" ? "Flag: low instead" : "Clear flag") : "Flag points"}
          </button>
        )}
        <span className="sp" />
        <button className="icon" onClick={() => actions.edit(task)}>
          Edit
        </button>
        <button className="icon" aria-label={`Delete ${task.title}`} onClick={() => actions.remove(task)}>
          ✕
        </button>
      </div>
    </Draggable>
  );
}
