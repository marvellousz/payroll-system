"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let email = identifier.trim();

      if (!email.includes("@")) {
        const res = await fetch("/api/auth/resolve-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: email }),
        });
        const data = await res.json();
        if (!res.ok || !data.email) {
          setError("Username not found. Please check and try again.");
          return;
        }
        email = data.email;
      }

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Incorrect email/username or password."
            : authError.message
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "440px" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#111827" }}>
          Payroll
        </h1>
        <p className="text-secondary text-sm font-medium" style={{ marginTop: "0.25rem" }}>
          Sign in to access your dashboard
        </p>
      </div>

      {/* Flat Poster Card */}
      <div className="login-card">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && (
            <div className="alert alert-danger" role="alert">
              <CircleAlert size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="identifier">
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              className="form-input"
              placeholder="e.g. admin or admin@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={loading}
            style={{ justifyContent: "center", marginTop: "0.5rem" }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: "20px", height: "20px" }} />
                Signing in…
              </>
            ) : (
              "Sign In →"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
