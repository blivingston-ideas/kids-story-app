// app/onboarding/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { isParent } from "@/lib/data/roles";

const inviteTokenSchema = z
  .string()
  .trim()
  .min(12, "Invalid invite token")
  .max(128, "Invalid invite token");

async function acceptInvite(formData: FormData) {
  "use server";

  const tokenResult = inviteTokenSchema.safeParse(String(formData.get("invite_token") ?? ""));
  if (!tokenResult.success) throw new Error(tokenResult.error.issues[0]?.message ?? "Invalid invite");

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (membership) redirect("/library");

  const { error } = await supabase.rpc("accept_invite_token", {
    invite_token: tokenResult.data,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/onboarding");
  revalidatePath("/gate");
  redirect("/onboarding");
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const inviteToken = invite ? String(invite) : null;
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");

  if (!membership || !universe) {
    if (!inviteToken) redirect("/onboarding/create");

    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-10">
          <div className="w-full rounded-3xl border border-neutral-200 bg-white shadow-sm p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Accept invite</h1>
            <p className="mt-2 text-sm text-neutral-600">
              You&apos;ve been invited to join a family universe. Accept to continue.
            </p>

            <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs text-neutral-500">Invite token</p>
              <p className="mt-1 break-all text-sm text-neutral-800">{inviteToken}</p>
            </div>

            <form action={acceptInvite} className="mt-6">
              <input type="hidden" name="invite_token" value={inviteToken} />
              <button
                type="submit"
                className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-900/20"
              >
                Accept invite
              </button>
            </form>

            <p className="mt-4 text-xs text-neutral-500">
              If this token is expired or already used, ask the parent to create a new invite.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const parent = isParent(membership);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-10">
        <div className="w-full rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">You&apos;re in!</h1>
                <p className="mt-2 text-sm text-neutral-600">
                  Your universe is ready. Next we&apos;ll set up profiles for kids
                  and adults.
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white">
                Step 2 of 2
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="text-xs font-medium text-neutral-500">Current universe</div>
              <div className="mt-1 text-lg font-semibold text-neutral-900">{universe.name}</div>
              <div className="mt-2 text-sm text-neutral-600">
                Signed in as <span className="font-medium text-neutral-900">{user.email}</span>{" "}
                • Role <span className="font-medium text-neutral-900">{membership.role}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {parent ? (
                <Link
                  href="/profiles/new"
                  className="rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-900/20"
                >
                  Add profiles
                </Link>
              ) : (
                <Link
                  href="/profiles"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-900/10"
                >
                  View profiles
                </Link>
              )}

              <Link
                href="/library"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-neutral-900/10"
              >
                Go to library
              </Link>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="text-sm font-semibold text-neutral-900">What&apos;s next (V1)</div>
              <ul className="mt-2 space-y-2 text-sm text-neutral-600">
                <li>• Create kid + adult profiles (avatars later).</li>
                <li>• Generate stories via the Create Story wizard.</li>
                <li>• Save to a permanent library and share read-only links.</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-neutral-200 p-6">
            <div className="flex items-center justify-between text-sm">
              <Link
                href="/logout"
                className="text-neutral-600 hover:text-neutral-900 hover:underline"
              >
                Sign out
              </Link>
              <Link
                href="/onboarding/create"
                className="text-neutral-600 hover:text-neutral-900 hover:underline"
              >
                Create another universe
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
