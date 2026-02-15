"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h1 style={{ marginBottom: 24, fontSize: 24 }}>Moderation login</h1>
      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label htmlFor="email" style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
        </div>
        {error && <p style={{ color: "#c00", fontSize: 14 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "12px 16px", background: "#333", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
