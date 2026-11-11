"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Factor {
  id: string;
  factor_type: string;
  status: string;
  phone?: string | null;
}

type Setup =
  | { kind: "totp"; factorId: string; qr: string; secret: string }
  | { kind: "phone"; factorId: string; challengeId: string };

/** Account page: add or remove the second sign-in step, and sign out. */
export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ data: user }, { data }] = await Promise.all([supabase.auth.getUser(), supabase.auth.mfa.listFactors()]);
    setEmail(user.user?.email ?? "");
    setFactors((data?.all ?? []) as Factor[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const verified = factors.filter((f) => f.status === "verified");

  // Half-finished setups would block a fresh attempt, so clear them first.
  async function clearUnfinished(type: string) {
    const mfa = createClient().auth.mfa;
    for (const f of factors) {
      if (f.status !== "verified" && f.factor_type === type) await mfa.unenroll({ factorId: f.id });
    }
  }

  async function startTotp() {
    setBusy(true);
    setError("");
    await clearUnfinished("totp");
    const { data, error: enrollError } = await createClient().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${Date.now()}`,
    });
    setBusy(false);
    if (enrollError) return setError(enrollError.message);
    setCode("");
    setSetup({ kind: "totp", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function startPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await clearUnfinished("phone");
    const mfa = createClient().auth.mfa;
    const { data, error: enrollError } = await mfa.enroll({ factorType: "phone", phone: phone.trim() });
    if (enrollError) {
      setBusy(false);
      return setError(`${enrollError.message} Use the full number with country code, like +12065550123.`);
    }
    const { data: challenge, error: challengeError } = await mfa.challenge({ factorId: data.id });
    setBusy(false);
    if (challengeError) return setError(`The text could not be sent. ${challengeError.message}`);
    setCode("");
    setSetup({ kind: "phone", factorId: data.id, challengeId: challenge.id });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError("");
    const mfa = createClient().auth.mfa;
    const { error: verifyError } =
      setup.kind === "phone"
        ? await mfa.verify({ factorId: setup.factorId, challengeId: setup.challengeId, code: code.trim() })
        : await mfa.challengeAndVerify({ factorId: setup.factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) return setError("That code did not work. Try the newest one.");
    setSetup(null);
    setCode("");
    setPhone("");
    await refresh();
    router.refresh();
  }

  async function remove(f: Factor) {
    setError("");
    const { error: removeError } = await createClient().auth.mfa.unenroll({ factorId: f.id });
    if (removeError) setError(removeError.message);
    await refresh();
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
          <h1>Account</h1>
          <p className="note">{email}</p>
        </div>

        <div className="stack">
          <h2>Second sign-in step</h2>
          {verified.length === 0 && <p className="note">Not set up yet. Add an authenticator app or a text message code.</p>}
          <ul className="plain">
            {verified.map((f) => (
              <li key={f.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{f.factor_type === "phone" ? `Text message${f.phone ? ` to ${f.phone}` : ""}` : "Authenticator app"}</span>
                <button className="btn small danger" onClick={() => remove(f)}>Remove</button>
              </li>
            ))}
          </ul>

          {!setup && (
            <>
              <button className="btn" disabled={busy} onClick={startTotp}>Add an authenticator app</button>
              <form className="row" onSubmit={startPhone}>
                <div className="field" style={{ flex: "1 1 180px" }}>
                  <label htmlFor="phone">Or get codes by text</label>
                  <input id="phone" type="tel" autoComplete="tel" placeholder="+12065550123" required value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <button className="btn" disabled={busy} style={{ alignSelf: "flex-end" }}>Send code</button>
              </form>
            </>
          )}

          {setup && (
            <form className="stack" onSubmit={confirm}>
              {setup.kind === "totp" && (
                <>
                  <p className="note">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="qr" src={setup.qr} alt="QR code for your authenticator app" />
                  <p className="note">Can&apos;t scan? Enter this key by hand: <code className="secret">{setup.secret}</code></p>
                </>
              )}
              {setup.kind === "phone" && <p className="note">We sent a code to {phone}.</p>}
              <div className="field">
                <label htmlFor="setupCode">Code</label>
                <input id="setupCode" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn primary" disabled={busy}>Turn on</button>
                <button type="button" className="btn" onClick={() => { setSetup(null); refresh(); }}>Cancel</button>
              </div>
            </form>
          )}
          {error && <p className="err" role="alert">{error}</p>}
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="btn" href="/">Back to the board</Link>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
