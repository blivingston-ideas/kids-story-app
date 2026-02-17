"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/components/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);

    const supabase = supabaseBrowser();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) setError(signUpError.message);
      else setMsg("Account created. Now switch to Sign in.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    else window.location.href = "/gate";
  }

  return (
    <main className="min-h-screen bg-app-bg px-6 py-10 text-anchor">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md items-center">
        <div className="card-surface w-full p-8">
          <p className="inline-flex rounded-full bg-soft-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-anchor">
            Story Universe
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-anchor">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-2 text-sm text-anchor/75">Continue your family adventures.</p>

          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant={mode === "signin" ? "primary" : "ghost"}
              onClick={() => setMode("signin")}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={mode === "signup" ? "secondary" : "ghost"}
              onClick={() => setMode("signup")}
            >
              Create account
            </Button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-anchor">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="pw" className="text-sm font-medium text-anchor">
                Password
              </label>
              <input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
                required
              />
            </div>

            <Button type="submit" variant="primary" className="w-full py-3">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            {mode === "signin" ? (
              <p className="text-sm text-anchor/75">
                Need an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-medium text-secondary hover:text-secondary-hover"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-sm text-anchor/75">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="font-medium text-secondary hover:text-secondary-hover"
                >
                  Sign in
                </button>
              </p>
            )}

            {msg ? <p className="text-sm text-secondary">{msg}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </form>
        </div>
      </div>
    </main>
  );
}
