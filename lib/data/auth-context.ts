import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MembershipRole = "parent" | "grandparent" | "kid";

export type CurrentMembership = {
  id: string;
  universe_id: string;
  role: MembershipRole;
  created_at: string;
};

export type CurrentUniverse = {
  id: string;
  name: string;
};

export type CurrentUniverseContext = {
  user: User | null;
  membership: CurrentMembership | null;
  universe: CurrentUniverse | null;
};

export async function getCurrentUniverseContext(): Promise<CurrentUniverseContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, membership: null, universe: null };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id, universe_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return { user, membership: null, universe: null };
  }

  const { data: universe, error: universeError } = await supabase
    .from("universes")
    .select("id, name")
    .eq("id", membership.universe_id)
    .limit(1)
    .maybeSingle();

  if (universeError || !universe) {
    return { user, membership, universe: null };
  }

  return { user, membership, universe };
}
