"use client";

import { useEffect, useState } from "react";
import type { Profile, Task } from "@/lib/types";

interface Props {
  task: Task;
  me: Profile;
  other?: Profile;
  onComplete(userIds: string[], file: File): Promise<void>;
  onClose(): void;
}

/** Closing a task needs a quick photo or screenshot, like a delivery photo. */
export function ProofDialog({ task, me, other, onComplete, onClose }: Props) {
  const [who, setWho] = useState<"me" | "other" | "both">("me");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shot = task.proof_type === "screenshot";
  const ids = who === "both" && other ? [me.id, other.id] : [who === "other" && other ? other.id : me.id];
  const names = who === "both" && other ? `${me.display_name} and ${other.display_name} each` : who === "other" && other ? other.display_name : me.display_name;

  async function finish() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onComplete(ids, file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The task could not be closed. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="proofTitle">
        <h2 id="proofTitle">Nice work</h2>
        <p>
          &ldquo;{task.title}&rdquo; is worth {task.points} points to {names}.{" "}
          {shot ? "Add a quick screenshot to close it out." : "Snap a quick photo to close it out. Nothing fancy."}
        </p>
        {other && (
          <div className="field">
            <span className="lab" id="whoLab">
              Who did it
            </span>
            <div className="seg" role="group" aria-labelledby="whoLab" style={{ alignSelf: "flex-start" }}>
              <button type="button" aria-pressed={who === "me"} onClick={() => setWho("me")}>
                {me.display_name}
              </button>
              <button type="button" aria-pressed={who === "other"} onClick={() => setWho("other")}>
                {other.display_name}
              </button>
              <button type="button" aria-pressed={who === "both"} onClick={() => setWho("both")}>
                Together
              </button>
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="proofFile">{shot ? "Screenshot (required)" : "Photo (required)"}</label>
          <input id="proofFile" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {file && preview && <img className="preview" src={preview} alt="Proof preview" />}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="foot">
          <button className="btn" disabled={busy} onClick={onClose}>
            Not done yet
          </button>
          <button className="btn primary" disabled={!file || busy} onClick={finish}>
            {busy ? "Saving" : `Complete, +${task.points}`}
          </button>
        </div>
      </div>
    </div>
  );
}
