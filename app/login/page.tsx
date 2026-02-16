"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMsg("Account created. Now switch to Sign in.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = "/gate";
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>

      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          style={{ display: "block", width: "100%", margin: "8px 0", padding: 10 }}
        />

        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{ display: "block", width: "100%", margin: "8px 0", padding: 10 }}
        />

        <button type="submit">
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <div style={{ marginTop: 12 }}>
          {mode === "signin" ? (
            <button type="button" onClick={() => setMode("signup")}>
              Need an account? Sign up
            </button>
          ) : (
            <button type="button" onClick={() => setMode("signin")}>
              Already have an account? Sign in
            </button>
          )}
        </div>

        {msg && <p style={{ color: "green" }}>{msg}</p>}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </main>
  );
}
