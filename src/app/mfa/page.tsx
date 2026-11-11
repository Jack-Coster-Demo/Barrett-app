"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Factor {
  id: string;
  factor_type: string;
  friendly_name?: string | null;
}

/** Second step at sign-in: a code from the authenticator app or a text message. */
export default function MfaPage() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        const list: Factor[] = [...(data?.totp ?? []), ...(data?.phone ?? [])];
        setFactors(list);
        if (list.length === 1 && list[0].factor_type === "totp") setFactor(list[0]);
      });
  }, []);

  async function choose(f: Factor) {
    setError("");
    setCode("");
    setChallengeId("");
    setFactor(f);
    if (f.factor_type === "phone") {
      const { data, error: challengeError } = await createClient().auth.mfa.challenge({ factorId: f.id });
      if (challengeError) setError(`The text could not be sent. ${challengeError.message}`);
      else setChallengeId(data.id);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factor) return;
    setBusy(true);
    setError("");
    const mfa = createClient().auth.mfa;
    const { error: verifyError } =
      factor.factor_type === "phone"
        ? await mfa.verify({ factorId: factor.id, challengeId, code: code.trim() })
        : await mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (verifyError) {
      setError("That code did not work. Codes expire quickly, so try the newest one.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="authwrap">
      <div className="authcard">
        <div>
          <h1>One more step</h1>
          <p className="note">Confirm it is you with a code.</p>
        </div>
        {factors.length > 1 && (
          <div className="row">
            {factors.map((f) => (
              <button key={f.id} className="btn small" aria-pressed={factor?.id === f.id} onClick={() => choose(f)}>
                {f.factor_type === "phone" ? "Text me a code" : "Authenticator app"}
              </button>
            ))}
          </div>
        )}
        {factors.length === 1 && factors[0].factor_type === "phone" && !factor && (
          <button className="btn" onClick={() => choose(factors[0])}>Text me a code</button>
        )}
        {factor && (
          <form className="stack" onSubmit={verify}>
            <div className="field">
              <label htmlFor="code">
                {factor.factor_type === "phone" ? "Code from the text message" : "Code from your authenticator app"}
              </label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <button className="btn primary" disabled={busy || (factor.factor_type === "phone" && !challengeId)}>
              {busy ? "Checking" : "Continue"}
            </button>
          </form>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn small ghost" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
