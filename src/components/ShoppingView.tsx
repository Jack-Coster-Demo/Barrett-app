"use client";

import { useState } from "react";
import type { Profile, ShoppingItem } from "@/lib/types";

export interface ShoppingActions {
  add(title: string, store: string, link: string | null): Promise<boolean>;
  update(item: ShoppingItem, fields: { title: string; store: string | null; link: string | null }): Promise<boolean>;
  toggle(item: ShoppingItem): void;
  remove(item: ShoppingItem): void;
  clearBought(): void;
}

interface Props {
  items: ShoppingItem[];
  people: Map<string, Profile>;
  loaded: boolean;
  actions: ShoppingActions;
}

const ANYWHERE = "Anywhere";

/** Turns what was typed into a safe http(s) address. "" = nothing typed, null = not a usable address. */
function cleanLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Short label for a link: the site name without "www." */
function linkLabel(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

export function ShoppingView({ items, people, loaded, actions }: Props) {
  const [title, setTitle] = useState("");
  const [store, setStore] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const cleaned = cleanLink(link);

  const open = items.filter((i) => !i.bought_at);
  const bought = items
    .filter((i) => i.bought_at)
    .sort((a, b) => (b.bought_at ?? "").localeCompare(a.bought_at ?? ""));
  const stores = [...new Set(items.map((i) => i.store).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));
  // Named stores first, then everything without one.
  const sections = [...new Set(open.map((i) => i.store ?? ANYWHERE))].sort(
    (a, b) => Number(a === ANYWHERE) - Number(b === ANYWHERE) || a.localeCompare(b),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy || cleaned === null) return;
    setBusy(true);
    const ok = await actions.add(title.trim(), store.trim(), cleaned || null);
    setBusy(false);
    if (ok) {
      setTitle(""); // the store stays, so several items for one shop go in quickly
      setLink("");
    }
  }

  const [editing, setEditing] = useState<{ id: string; title: string; store: string; link: string } | null>(null);
  const editLink = editing ? cleanLink(editing.link) : "";

  async function saveEdit(e: React.FormEvent, item: ShoppingItem) {
    e.preventDefault();
    if (!editing || !editing.title.trim() || editLink === null || busy) return;
    setBusy(true);
    const ok = await actions.update(item, { title: editing.title.trim(), store: editing.store.trim() || null, link: editLink || null });
    setBusy(false);
    if (ok) setEditing(null);
  }

  const row = (i: ShoppingItem) => {
    const who = i.added_by ? people.get(i.added_by) : undefined;
    if (editing?.id === i.id) {
      return (
        <li key={i.id}>
          <form className="addrow edit" onSubmit={(e) => saveEdit(e, i)}>
            <input
              aria-label="Item"
              maxLength={90}
              autoComplete="off"
              autoFocus
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <input
              className="store"
              aria-label="Store (optional)"
              placeholder="Store (optional)"
              maxLength={40}
              autoComplete="off"
              list="storeList"
              value={editing.store}
              onChange={(e) => setEditing({ ...editing, store: e.target.value })}
            />
            <input
              className="link"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Link (optional)"
              aria-invalid={editLink === null}
              placeholder="Link (optional)"
              maxLength={2000}
              autoComplete="off"
              value={editing.link}
              onChange={(e) => setEditing({ ...editing, link: e.target.value })}
            />
            {editLink === null && <p className="hint bad">That link does not look like a web address.</p>}
            <div className="foot">
              <button type="button" className="btn small" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn small primary" disabled={busy || !editing.title.trim() || editLink === null}>
                Save
              </button>
            </div>
          </form>
        </li>
      );
    }
    return (
      <li key={i.id} className={i.bought_at ? "isdone" : ""}>
        <button
          className="box square"
          role="checkbox"
          aria-checked={!!i.bought_at}
          aria-label={`${i.title} purchased`}
          title={i.bought_at ? "Purchased. Tap to put it back on the list." : "Mark as purchased"}
          onClick={() => actions.toggle(i)}
        >
          {i.bought_at ? "✓" : ""}
        </button>
        <div className="steptext">
          <span className="title">{i.title}</span>
          {i.link && /^https?:\/\//i.test(i.link) && (
            <a className="itemlink" href={i.link} target="_blank" rel="noopener noreferrer">
              {linkLabel(i.link)} ↗
            </a>
          )}
        </div>
        {who && <span className={`dot ${who.color}`} title={`Added by ${who.display_name}`} />}
        <button
          className="icon"
          aria-label={`Edit ${i.title}`}
          onClick={() => setEditing({ id: i.id, title: i.title, store: i.store ?? "", link: i.link ?? "" })}
        >
          Edit
        </button>
        <button className="icon" aria-label={`Remove ${i.title}`} onClick={() => actions.remove(i)}>
          ✕
        </button>
      </li>
    );
  };

  return (
    <section className="stack narrow">
      <div className="sectionhead">
        <h2>Shopping list</h2>
        <span className="count">{open.length ? `${open.length} to buy` : ""}</span>
      </div>

      <form className="addrow" onSubmit={submit}>
        <input
          aria-label="Item to buy"
          placeholder="Add an item"
          maxLength={90}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="store"
          aria-label="Store (optional)"
          placeholder="Store (optional)"
          maxLength={40}
          autoComplete="off"
          list="storeList"
          value={store}
          onChange={(e) => setStore(e.target.value)}
        />
        <datalist id="storeList">
          {stores.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          className="link"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Link (optional)"
          aria-invalid={cleaned === null}
          placeholder="Link (optional)"
          maxLength={2000}
          autoComplete="off"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !title.trim() || cleaned === null}>
          Add
        </button>
      </form>
      {cleaned === null && <p className="hint bad">That link does not look like a web address.</p>}

      {loaded && open.length === 0 && <p className="empty">Nothing to buy. Add items as you think of them and they show up on both phones.</p>}

      {sections.map((s) => (
        <div className="panel" key={s}>
          {(sections.length > 1 || s !== ANYWHERE) && <span className="label">{s}</span>}
          <ul className="steps">{open.filter((i) => (i.store ?? ANYWHERE) === s).map(row)}</ul>
        </div>
      ))}

      {bought.length > 0 && (
        <div className="panel">
          <div className="sectionhead">
            <span className="label">Purchased ({bought.length})</span>
            <button className="btn small ghost" onClick={actions.clearBought}>
              Clear purchased
            </button>
          </div>
          <ul className="steps">{bought.map(row)}</ul>
        </div>
      )}
    </section>
  );
}
