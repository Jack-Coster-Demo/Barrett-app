import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BarrettApp from "@/components/BarrettApp";
import type { Profile } from "@/lib/types";

export default function Home() {
  return (
    <Suspense fallback={<main className="authwrap"><p className="note">Loading the board</p></main>}>
      <Household />
    </Suspense>
  );
}

// Reads the signed-in user, so it renders per request inside the Suspense boundary.
async function Household() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("profiles").select("id, display_name, color").order("display_name");
  const profiles = (data ?? []) as Profile[];
  const me = profiles.find((p) => p.id === user.id);

  if (!me) {
    return (
      <main className="authwrap">
        <div className="authcard">
          <h1>Almost there</h1>
          <p>
            You are signed in as {user.email}, but this account has not been added to the household yet. Add a row for it
            in the profiles table (step 4 in the README), then reload.
          </p>
        </div>
      </main>
    );
  }

  return <BarrettApp me={me} profiles={profiles} />;
}
