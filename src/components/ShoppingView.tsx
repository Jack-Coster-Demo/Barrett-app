"use client";

import { useState } from "react";
import type { Profile, ShoppingItem } from "@/lib/types";

export interface ShoppingActions {
  add(title: string, store: string): Promise<boolean>;
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

export function ShoppingView({ items, people, loaded, actions }: Props) {
  const [title, setTitle] = useState("");
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await actions.add(title.trim(), store.trim());
    setBusy(false);
    if (ok) setTitle(""); // the store stays, so several items for one shop go in quickly
  }

  const row = (i: ShoppingItem) => {
    const who = i.added_by ? people.get(i.added_by) : undefined;
    return (
      <li key={i.id} className={i.bought_at ? "isdone" : ""}>
        <button
          className="box"
          aria-pressed={!!i.bought_at}
          aria-label={i.bought_at ? `Put ${i.title} back on the list` : `Mark ${i.title} as bought`}
          onClick={() => actions.toggle(i)}
        >
          {i.bought_at ? "✓" : ""}
        </button>
        <div className="steptext">
          <span className="title">{i.title}</span>
        </div>
        {who && <span className={`dot ${who.color}`} title={`Added by ${who.display_name}`} />}
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
        <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>

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
            <span className="label">Bought ({bought.length})</span>
            <button className="btn small ghost" onClick={actions.clearBought}>
              Clear bought
            </button>
          </div>
          <ul className="steps">{bought.map(row)}</ul>
        </div>
      )}
    </section>
  );
}
