export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import UniverseDetailsClient from "@/app/universe/universe-details-client";

export default async function UniversePage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding");

  const { data: details, error: detailsError } = await supabase
    .from("universes")
    .select("id, name, created_by, created_at")
    .eq("id", universe.id)
    .maybeSingle();
  if (detailsError) throw new Error(detailsError.message);
  if (!details) redirect("/onboarding");

  const canEdit = details.created_by === user.id;

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <section className="card-surface p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-anchor">Universe</h1>
          <p className="mt-2 text-sm text-anchor/75">
            View and manage your Story Universe details.
          </p>
        </section>

        <section className="card-surface p-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-anchor">Universe details</h2>
            <UniverseDetailsClient
              universeId={details.id}
              universeName={details.name}
              canEdit={canEdit}
            />
          </div>
          <div className="rounded-2xl bg-soft-accent p-4 text-sm text-anchor space-y-2">
            <p>
              <span className="font-medium">Name:</span> {details.name}
            </p>
            <p>
              <span className="font-medium">Universe ID:</span> {details.id}
            </p>
            <p>
              <span className="font-medium">Created:</span>{" "}
              {new Date(details.created_at).toLocaleString()}
            </p>
          </div>
          {!canEdit ? (
            <p className="text-sm text-anchor/75">Only the universe creator can edit these details.</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
