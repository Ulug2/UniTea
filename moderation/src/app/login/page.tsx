"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
      background: "linear-gradient(160deg, #0D1B2A 0%, #0F1F30 45%, #0a1520 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Teal glow — top left */}
      <div style={{
        position: "absolute",
        top: "-80px",
        left: "-80px",
        width: 480,
        height: 480,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(47,201,193,0.12) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
      {/* Midnight blue glow — bottom right */}
      <div style={{
        position: "absolute",
        bottom: "-100px",
        right: "-60px",
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(24,49,83,0.6) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      {/* Subtle dot grid */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(rgba(47,201,193,0.06) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 440,
        margin: "0 24px",
        background: "rgba(24,49,83,0.45)",
        border: "1px solid rgba(47,201,193,0.15)",
        borderRadius: 20,
        padding: "44px 40px 40px",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 0 1px rgba(47,201,193,0.06), 0 40px 80px rgba(0,0,0,0.5), 0 0 60px rgba(47,201,193,0.04)",
      }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(47,201,193,0.25)",
            flexShrink: 0,
            boxShadow: "0 0 16px rgba(47,201,193,0.15)",
          }}>
            <Image
              src="/unitee-logo.jpg"
              alt="UniTee"
              width={52}
              height={52}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.3px",
              color: "#f1f5f9",
              lineHeight: 1.1,
            }}>
              UniTee
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#2FC9C1",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginTop: 2,
            }}>
              Moderation Portal
            </div>
          </div>
          {/* Restricted badge pushed to right */}
          <div style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(47,201,193,0.08)",
            border: "1px solid rgba(47,201,193,0.2)",
            borderRadius: 20,
            padding: "4px 10px",
          }}>
            <span style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#2FC9C1",
              boxShadow: "0 0 6px #2FC9C1",
            }} />
            <span style={{ fontSize: 9, color: "#2FC9C1", letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
              Admin Only
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "linear-gradient(90deg, rgba(47,201,193,0.2), rgba(47,201,193,0.05) 60%, transparent)", marginBottom: 28 }} />

        {/* Heading */}
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 6, letterSpacing: "-0.2px" }}>
          Administrator Sign In
        </h1>
        <p style={{ fontSize: 13, color: "#4a6580", marginBottom: 28, lineHeight: 1.6 }}>
          This portal is restricted to authorised administrators.
          Unauthorised access attempts are logged.
        </p>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div>
            <label htmlFor="email" style={{
              display: "block",
              marginBottom: 7,
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              letterSpacing: "0.1em",
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
              autoComplete="email"
              placeholder="you@university.edu"
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "rgba(13,27,42,0.6)",
                border: `1px solid ${focused === "email" ? "rgba(47,201,193,0.5)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 10,
                color: "#f1f5f9",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: focused === "email" ? "0 0 0 3px rgba(47,201,193,0.1)" : "none",
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" style={{
              display: "block",
              marginBottom: 7,
              fontSize: 11,
              fontWeight: 600,
              color: "#64748b",
              letterSpacing: "0.1em",
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
              autoComplete="current-password"
              placeholder="••••••••••••"
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "rgba(13,27,42,0.6)",
                border: `1px solid ${focused === "password" ? "rgba(47,201,193,0.5)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 10,
                color: "#f1f5f9",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: focused === "password" ? "0 0 0 3px rgba(47,201,193,0.1)" : "none",
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
              padding: "13px 16px",
              background: loading
                ? "rgba(47,201,193,0.2)"
                : "linear-gradient(135deg, #2FC9C1 0%, #28B3AC 100%)",
              color: loading ? "rgba(47,201,193,0.5)" : "#0D1B2A",
              border: "1px solid rgba(47,201,193,0.3)",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.02em",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s, box-shadow 0.15s",
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "0 4px 20px rgba(47,201,193,0.25)",
            }}
          >
            {loading ? "Authenticating…" : "Access Dashboard →"}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: 10, color: "#1e3a52", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            UniTee Admin Portal
          </span>
          <span style={{ color: "#1e3a52", fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, color: "#1e3a52", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            Authorised Personnel Only
          </span>
        </div>
      </div>
    </div>
  );
}
