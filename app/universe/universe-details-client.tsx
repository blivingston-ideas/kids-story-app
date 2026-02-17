"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/button";

type Props = {
  universeId: string;
  universeName: string;
  canEdit: boolean;
};

export default function UniverseDetailsClient({ universeId, universeName, canEdit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(universeName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/universe/${universeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Could not save universe name.");
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save universe name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {canEdit ? (
        <Button type="button" variant="secondary" className="py-2" onClick={() => setOpen(true)}>
          Edit
        </Button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-anchor/40 p-4">
          <div className="card-surface w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-anchor">Edit universe name</h3>
            <p className="mt-1 text-sm text-anchor/75">Enter a new name for your Story Universe.</p>

            <form onSubmit={onSave} className="mt-4 space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
                minLength={2}
                maxLength={60}
                required
                autoFocus
              />

              {error ? <p className="text-sm text-rose-700">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-soft-accent"
                  onClick={() => {
                    setOpen(false);
                    setName(universeName);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
