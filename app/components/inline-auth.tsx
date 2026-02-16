"use client";

import { FormEvent, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function InlineAuth() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setSubmitting(true);

    try {
      const supabase = supabaseBrowser();

      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) setError(signUpError.message);
        else setMsg("Account created. Switch to Sign in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) setError(signInError.message);
      else window.location.href = "/gate";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 flex w-full max-w-md flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="inline-flex items-center justify-center rounded-2xl bg-amber-900 px-8 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-900/30"
      >
        {isOpen ? "Hide Login" : "Log In"}
      </button>
      <p className="text-sm text-amber-900/75">
        Invite-only access for parents, grandparents, and kids.
      </p>

      {isOpen ? (
        <form
          onSubmit={onSubmit}
          className="mt-2 w-full space-y-3 rounded-2xl border border-amber-200 bg-white/95 p-4 text-left shadow-sm"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                mode === "signin"
                  ? "bg-amber-900 text-white"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                mode === "signup"
                  ? "bg-amber-900 text-white"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              Create account
            </button>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-amber-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@email.com"
            className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-950 outline-none focus:ring-2 focus:ring-amber-500/40"
          />

          <label className="block text-xs font-semibold uppercase tracking-wide text-amber-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
            className="w-full rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-950 outline-none focus:ring-2 focus:ring-amber-500/40"
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>

          {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
