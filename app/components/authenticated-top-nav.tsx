import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function logoutAction() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default function AuthenticatedTopNav() {
  return (
    <header className="border-b border-soft-accent bg-card-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link
            href="/"
            className="rounded-xl px-3 py-2 text-anchor transition hover:bg-soft-accent hover:text-anchor"
          >
            Home
          </Link>
          <Link
            href="/library"
            className="rounded-xl px-3 py-2 text-anchor transition hover:bg-soft-accent hover:text-anchor"
          >
            Library
          </Link>
          <Link
            href="/profiles"
            className="rounded-xl px-3 py-2 text-anchor transition hover:bg-soft-accent hover:text-anchor"
          >
            Profiles
          </Link>
          <Link
            href="/universe"
            className="rounded-xl px-3 py-2 text-anchor transition hover:bg-soft-accent hover:text-anchor"
          >
            Universe
          </Link>
          <Link
            href="/create"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Spark a story ✨
          </Link>
        </nav>

        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
