export async function deleteStoryById(storyId: string): Promise<void> {
  const response = await fetch(`/api/stories/${storyId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Failed to delete story");
  }
}
