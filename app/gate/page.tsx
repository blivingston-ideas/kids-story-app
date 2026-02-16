import { redirect } from "next/navigation";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";

export default async function GatePage() {
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding");

  redirect("/library");
}

