// app/onboarding/create/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Role = "parent" | "kid" | "grandparent";

async function createUniverse(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Universe name is required");

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  // 1) Create universe.
  // Avoid insert().select() here: select RLS on universes requires membership,
  // and membership is created in step 2.
  const universeId = crypto.randomUUID();
  const { error: uErr } = await supabase
    .from("universes")
    .insert({ id: universeId, name, created_by: user.id });

  if (uErr) throw new Error(uErr.message);

  // 2) Add creator as member
  const { error: mErr } = await supabase.from("memberships").insert({
    universe_id: universeId,
    user_id: user.id,
    role: "parent" satisfies Role,
  });

  if (mErr) throw new Error(mErr.message);

  // Ensure /onboarding fetches fresh membership data
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

export default async function CreateUniversePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#fff8dc,_#ffe4b5_35%,_#ffd39a_65%,_#f4ab68)]">
      <div className="pointer-events-none absolute -left-10 top-16 h-40 w-40 rounded-full bg-white/45 blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-amber-100/65 blur-3xl" />

      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-12">
        <div className="relative w-full max-w-2xl pt-10">
          <div className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl border border-amber-200 bg-white px-5 py-3 text-center shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Step 1 of 2
            </p>
            <p className="mt-1 text-xs text-amber-900/80">One more step after this</p>
          </div>

          <div className="w-full rounded-[2rem] border border-amber-100/90 bg-white/92 shadow-[0_25px_70px_-35px_rgba(120,70,30,0.6)] backdrop-blur-sm">
            <div className="border-b border-amber-100 p-8">
              <h1 className="text-2xl font-semibold tracking-tight text-amber-950">
                Create your family universe
              </h1>
              <p className="mt-2 text-sm leading-7 text-amber-900/80">
                This is your private space for stories, characters, and a
                permanent family library.
              </p>
            </div>

            <div className="p-8">
              <form action={createUniverse} className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-amber-950"
                  >
                    Universe name
                  </label>
                  <input
                    id="name"
                    name="name"
                    placeholder="e.g. The Livingston Storyverse"
                    className="w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm text-amber-950 outline-none transition focus:border-amber-900 focus:ring-4 focus:ring-amber-900/10"
                    required
                    maxLength={60}
                    autoFocus
                  />
                  <p className="text-xs text-amber-900/70">
                    Tip: Use your family name, or something fun like &quot;Bedtime Adventures&quot;.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-amber-900 px-4 py-3 text-sm font-semibold text-amber-50 shadow-sm transition hover:bg-amber-800 focus:outline-none focus:ring-4 focus:ring-amber-900/20"
                >
                  Create universe
                </button>

                <div className="flex items-center justify-between pt-2 text-sm">
                  <Link
                    href="/logout"
                    className="text-amber-900/75 hover:text-amber-950 hover:underline"
                  >
                    Sign out
                  </Link>
                  <Link
                    href="/onboarding"
                    className="text-amber-900/75 hover:text-amber-950 hover:underline"
                  >
                    Back
                  </Link>
                </div>
              </form>
            </div>

            <div className="border-t border-amber-100 p-6">
              <p className="text-xs text-amber-900/70">
                Your universe is invite-only. You will be able to add kids and
                grandparents next.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

