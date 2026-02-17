import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import HomeStoryCarousel from "@/app/components/home-story-carousel";
import Button from "@/components/button";

type StoryRow = {
  id: string;
  title: string;
  tone: string;
  length_minutes: number;
  created_at: string;
};

type KidRow = {
  id: string;
  display_name: string;
  age: number | null;
  created_at: string;
};

type AdultRow = {
  id: string;
  display_name: string;
  persona_label: string | null;
  created_at: string;
};

type RecentProfile = {
  id: string;
  kind: "kid" | "adult";
  name: string;
  detail: string;
  created_at: string;
};

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding");

  const [{ data: stories, error: storiesError }, { data: kids, error: kidsError }, { data: adults, error: adultsError }] =
    await Promise.all([
      supabase
        .from("stories")
        .select("id, title, tone, length_minutes, created_at")
        .eq("universe_id", universe.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("profiles_kid")
        .select("id, display_name, age, created_at")
        .eq("universe_id", universe.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("profiles_adult")
        .select("id, display_name, persona_label, created_at")
        .eq("universe_id", universe.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (storiesError) throw new Error(storiesError.message);
  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const recentProfiles: RecentProfile[] = [
    ...((kids ?? []) as KidRow[]).map((kid) => ({
      id: kid.id,
      kind: "kid" as const,
      name: kid.display_name,
      detail: `Age ${kid.age ?? "n/a"}`,
      created_at: kid.created_at,
    })),
    ...((adults ?? []) as AdultRow[]).map((adult) => ({
      id: adult.id,
      kind: "adult" as const,
      name: adult.display_name,
      detail: adult.persona_label || "Family member",
      created_at: adult.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <section className="card-surface p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-anchor/70">Home</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-anchor">
            Welcome back to {universe.name}
          </h1>
          <p className="mt-2 text-sm text-anchor/75">
            Jump back into stories or update your family profiles.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/create">
              <Button variant="primary" className="py-3">Create story</Button>
            </Link>
            <Link href="/library">
              <Button variant="secondary" className="py-3">Open library</Button>
            </Link>
            <Link href="/profiles">
              <Button variant="ghost" className="border border-soft-accent py-3">Manage profiles</Button>
            </Link>
          </div>
        </section>

        <section className="card-surface p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-anchor">Library</h2>
            <Link href="/library">
              <Button variant="ghost" className="border border-soft-accent px-3 py-2 text-xs">View all</Button>
            </Link>
          </div>
          <HomeStoryCarousel stories={(stories ?? []) as StoryRow[]} />
        </section>

        <section className="card-surface p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-anchor">Recently used profiles</h2>
            <Link href="/profiles">
              <Button variant="ghost" className="border border-soft-accent px-3 py-2 text-xs">View all</Button>
            </Link>
          </div>

          {recentProfiles.length === 0 ? (
            <div className="rounded-2xl bg-soft-accent p-4 text-sm text-anchor/80">
              No profiles yet. Add one to personalize your stories.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentProfiles.map((profile) => (
                <div key={`${profile.kind}:${profile.id}`} className="rounded-2xl border border-soft-accent bg-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-soft-accent text-sm font-semibold text-anchor">
                      {initialsFromName(profile.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-anchor">{profile.name}</p>
                      <p className="text-xs text-anchor/70">{profile.detail}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link href={`/profiles/${profile.kind}/${profile.id}/edit`}>
                      <Button variant="secondary" className="w-full py-2">Edit profile</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
