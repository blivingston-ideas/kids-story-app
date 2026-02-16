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
    <header className="border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link
            href="/library"
            className="rounded-xl px-3 py-2 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            Library
          </Link>
          <Link
            href="/profiles"
            className="rounded-xl px-3 py-2 text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            Profiles
          </Link>
        </nav>

        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
