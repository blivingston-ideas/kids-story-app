export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { assertParent, isParent } from "@/lib/data/roles";
import { inviteCreateSchema } from "@/lib/validation/profiles";

const idSchema = z.string().uuid("Invalid profile id");

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

async function deleteKidProfile(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  const parsedId = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsedId.success) throw new Error(parsedId.error.issues[0]?.message ?? "Invalid id");

  const { error } = await supabase
    .from("profiles_kid")
    .delete()
    .eq("id", parsedId.data)
    .eq("universe_id", membership.universe_id);

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
}

async function deleteAdultProfile(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  const parsedId = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!parsedId.success) throw new Error(parsedId.error.issues[0]?.message ?? "Invalid id");

  const { error } = await supabase
    .from("profiles_adult")
    .delete()
    .eq("id", parsedId.data)
    .eq("universe_id", membership.universe_id);

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
}

async function createInvite(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  const parsed = inviteCreateSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid invite data");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const token = crypto.randomUUID().replaceAll("-", "");

  const { error } = await supabase.from("invites").insert({
    universe_id: membership.universe_id,
    email: parsed.data.email,
    role: parsed.data.role,
    token,
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
}

export default async function ProfilesPage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding/create");

  const parent = isParent(membership);

  const [{ data: kids, error: kidsError }, { data: adults, error: adultsError }] =
    await Promise.all([
      supabase
        .from("profiles_kid")
        .select(
          "id, display_name, age, themes, character_traits, books_we_like, avatar_url, created_at"
        )
        .eq("universe_id", universe.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles_adult")
        .select("id, display_name, persona_label, avatar_url, created_at")
        .eq("universe_id", universe.id)
        .order("created_at", { ascending: false }),
    ]);

  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const invitesResult = parent
    ? await supabase
        .from("invites")
        .select("id, email, role, token, expires_at, accepted_at")
        .eq("universe_id", universe.id)
        .order("expires_at", { ascending: false })
    : { data: null, error: null };

  if (invitesResult.error) throw new Error(invitesResult.error.message);
  const invites = invitesResult.data ?? [];

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
                {parent ? (
                  <Link
                    href="/profiles/new"
                    className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
                  >
                    Add profile
                  </Link>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                Universe: <span className="font-medium text-neutral-900">{universe.name}</span>
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">Kids</h2>
            {parent ? (
              <Link
                href="/profiles/new?type=kid"
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
              >
                Add
              </Link>
            ) : null}
          </div>
          {kids.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-600">No kid profiles yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kids.map((kid) => (
                <div
                  key={kid.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    {kid.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={kid.avatar_url}
                        alt={`${kid.display_name} avatar`}
                        className="h-12 w-12 rounded-xl border border-neutral-200 bg-white object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl border border-neutral-200 bg-white grid place-items-center text-sm font-semibold text-neutral-700">
                        {initialsFromName(kid.display_name)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-neutral-900">{kid.display_name}</p>
                      <p className="text-xs text-neutral-600">Kid profile</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-neutral-700">
                    <p>
                      <span className="font-medium text-neutral-900">Age:</span> {kid.age ?? "n/a"}
                    </p>
                    <p>
                      <span className="font-medium text-neutral-900">Themes:</span>{" "}
                      {kid.themes?.slice(0, 3).join(", ") || "none"}
                    </p>
                    <p>
                      <span className="font-medium text-neutral-900">Traits:</span>{" "}
                      {kid.character_traits?.slice(0, 3).join(", ") || "none"}
                    </p>
                    <p>
                      <span className="font-medium text-neutral-900">Books:</span>{" "}
                      {kid.books_we_like?.slice(0, 3).join(", ") || "none"}
                    </p>
                  </div>

                  {parent ? (
                    <div className="mt-auto flex items-center gap-2">
                      <Link
                        href={`/profiles/kid/${kid.id}/edit`}
                        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
                      >
                        Edit
                      </Link>
                      <form action={deleteKidProfile}>
                        <input type="hidden" name="id" value={kid.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">Adults</h2>
            {parent ? (
              <Link
                href="/profiles/new?type=adult"
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
              >
                Add
              </Link>
            ) : null}
          </div>
          {adults.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-600">No adult profiles yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {adults.map((adult) => (
                <div
                  key={adult.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    {adult.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={adult.avatar_url}
                        alt={`${adult.display_name} avatar`}
                        className="h-12 w-12 rounded-xl border border-neutral-200 bg-white object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl border border-neutral-200 bg-white grid place-items-center text-sm font-semibold text-neutral-700">
                        {initialsFromName(adult.display_name)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-neutral-900">{adult.display_name}</p>
                      <p className="text-xs text-neutral-600">Adult profile</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-neutral-700">
                    <p>
                      <span className="font-medium text-neutral-900">Role label:</span>{" "}
                      {adult.persona_label || "none"}
                    </p>
                  </div>

                  {parent ? (
                    <div className="mt-auto flex items-center gap-2">
                      <Link
                        href={`/profiles/adult/${adult.id}/edit`}
                        className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
                      >
                        Edit
                      </Link>
                      <form action={deleteAdultProfile}>
                        <input type="hidden" name="id" value={adult.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Invites</h2>
          {parent ? (
            <>
              <form action={createInvite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  name="email"
                  type="email"
                  placeholder="family@example.com"
                  className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
                  required
                />
                <select
                  name="role"
                  className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
                  defaultValue="grandparent"
                >
                  <option value="parent">parent</option>
                  <option value="grandparent">grandparent</option>
                  <option value="kid">kid</option>
                </select>
                <button
                  type="submit"
                  className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
                >
                  Create invite
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {invites.length === 0 ? (
                  <p className="text-sm text-neutral-600">No invites yet.</p>
                ) : (
                  invites.map((invite) => {
                    const sharePath = `/onboarding?invite=${invite.token}`;
                    const accepted = Boolean(invite.accepted_at);
                    const status = accepted ? "accepted" : "pending";

                    return (
                      <div
                        key={invite.id}
                        className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                      >
                        <p className="text-sm font-medium text-neutral-900">
                          {invite.email} | {invite.role}
                        </p>
                        <p className="mt-1 text-xs text-neutral-600">Status: {status}</p>
                        <p className="mt-1 text-xs text-neutral-600">
                          Expires: {new Date(invite.expires_at).toLocaleString()}
                        </p>
                        <p className="mt-2 text-xs text-neutral-700 break-all">{sharePath}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-600">Only parents can manage invites.</p>
          )}
        </section>
      </div>
    </main>
  );
}
