"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("That email and password did not match. Check both and try again.");
      setBusy(false);
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    router.replace(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? "/mfa" : "/");
    router.refresh();
  }

  return (
    <main className="authwrap">
      <form className="authcard" onSubmit={signIn}>
        <div>
          <h1>Barrett</h1>
          <p className="note">Sign in to the house board.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </main>
  );
}
