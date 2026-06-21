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
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError("Access denied. Check your credentials and try again.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle grid background */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }} />

      {/* Glow orbs */}
      <div style={{
        position: "absolute",
        top: "20%",
        left: "15%",
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "20%",
        right: "15%",
        width: 300,
        height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        margin: "0 24px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "44px 40px 40px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.5)",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 20,
          padding: "4px 12px",
          marginBottom: 28,
        }}>
          <span style={{ fontSize: 8, color: "#3b82f6", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>
            ● Restricted Access
          </span>
        </div>

        {/* Logo mark */}
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.5px",
            background: "linear-gradient(135deg, #fff 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            UniTee
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#3b82f6",
            marginLeft: 8,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}>
            Moderation
          </span>
        </div>

        <p style={{ fontSize: 13, color: "#475569", marginBottom: 32, lineHeight: 1.6 }}>
          This portal is restricted to authorised administrators only.
          Unauthorised access attempts are logged.
        </p>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div>
            <label htmlFor="email" style={{
              display: "block",
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              Admin Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              required
              placeholder="you@university.edu"
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${focused === "email" ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 8,
                color: "#f1f5f9",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.15s",
                boxShadow: focused === "email" ? "0 0 0 3px rgba(59,130,246,0.08)" : "none",
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" style={{
              display: "block",
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              required
              placeholder="••••••••••••"
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${focused === "password" ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 8,
                color: "#f1f5f9",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.15s",
                boxShadow: focused === "password" ? "0 0 0 3px rgba(59,130,246,0.08)" : "none",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8,
              padding: "10px 14px",
            }}>
              <span style={{ fontSize: 13, color: "#f87171" }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "12px 16px",
              background: loading
                ? "rgba(59,130,246,0.3)"
                : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#fff",
              border: "1px solid rgba(59,130,246,0.3)",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: "0.02em",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            {loading ? "Authenticating…" : "Access Dashboard →"}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          marginTop: 28,
          fontSize: 11,
          color: "#1e293b",
          textAlign: "center",
          letterSpacing: "0.05em",
        }}>
          UNITEE ADMIN PORTAL · FOR AUTHORISED PERSONNEL ONLY
        </p>
      </div>
    </div>
  );
}
