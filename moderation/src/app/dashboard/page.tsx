"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
  is_permanently_banned: boolean | null;
  banned_until: string | null;
  created_at: string | null;
};

type Report = {
  id: string;
  reporter_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  reviewed_by: string | null;
};

type AdminLog = {
  id: string;
  admin_id: string;
  action: "ban" | "unban" | "delete_post";
  target_user_id: string | null;
  target_post_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABELS: Record<AdminLog["action"], string> = {
  ban: "Ban",
  unban: "Unban",
  delete_post: "Delete Post",
};

const ACTION_COLORS: Record<AdminLog["action"], { bg: string; color: string }> =
  {
    ban: { bg: "#ffebee", color: "#c62828" },
    unban: { bg: "#e8f5e9", color: "#2e7d32" },
    delete_post: { bg: "#fff3e0", color: "#e65100" },
  };

const BAN_DURATIONS = [
  { label: "10 Days", value: "10_days" },
  { label: "1 Month", value: "1_month" },
  { label: "1 Year", value: "1_year" },
  { label: "Permanent", value: "permanent" },
] as const;

export default function DashboardPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [banFilter, setBanFilter] = useState<"all" | "banned" | "unbanned">(
    "all",
  );
  const [banModal, setBanModal] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [banDuration, setBanDuration] = useState<string>("10_days");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logFilter, setLogFilter] = useState<"all" | AdminLog["action"]>("all");
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);

  const closeStatusMenu = () => {
    setStatusMenuId(null);
    setStatusMenuAnchor(null);
  };

  const supabase = createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return logs;
    return logs.filter((l) => l.action === logFilter);
  }, [logs, logFilter]);

  const filteredProfiles = useMemo(() => {
    let list = profiles;
    if (banFilter === "banned") list = list.filter((p) => p.is_banned === true);
    if (banFilter === "unbanned") list = list.filter((p) => !p.is_banned);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.username?.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [profiles, banFilter, search]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        setMessage({
          type: "err",
          text: `Could not load your profile: ${profileError.message}. If you see "row-level security" or "policy", run sql/rls_moderation_admin.sql in Supabase SQL Editor so authenticated users can read profiles.`,
        });
        setLoading(false);
        return;
      }

      if (profile?.is_admin !== true) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      const [profRes, repRes, logRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, username, avatar_url, is_admin, is_banned, is_permanently_banned, banned_until, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("reports")
          .select(
            "id, reporter_id, post_id, comment_id, reason, status, created_at, resolved_at, reviewed_by",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("admin_action_logs")
          .select(
            "id, admin_id, action, target_user_id, target_post_id, metadata, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (cancelled) return;
      if (profRes.error) {
        setMessage({ type: "err", text: profRes.error.message });
      } else {
        setProfiles((profRes.data as Profile[]) ?? []);
      }
      if (repRes.error) {
        setMessage({ type: "err", text: repRes.error.message });
      } else {
        setReports((repRes.data as Report[]) ?? []);
      }
      if (!logRes.error) {
        setLogs((logRes.data as AdminLog[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const callEdgeFunction = async (
    name: "ban-user" | "unban-user",
    body: Record<string, unknown>,
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !supabaseUrl) return false;
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? res.statusText);
    return true;
  };

  const refreshLogs = async () => {
    const { data } = await supabase
      .from("admin_action_logs")
      .select(
        "id, admin_id, action, target_user_id, target_post_id, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) setLogs(data as AdminLog[]);
  };

  const handleBan = async () => {
    if (!banModal) return;
    setActionLoading("ban");
    setMessage(null);
    try {
      await callEdgeFunction("ban-user", {
        user_id: banModal.userId,
        duration: banDuration,
      });
      setMessage({ type: "ok", text: "User banned." });
      setBanModal(null);
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar_url, is_admin, is_banned, is_permanently_banned, banned_until, created_at",
        )
        .eq("id", banModal.userId)
        .single();
      if (data) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === data.id ? (data as Profile) : p)),
        );
      }
      await refreshLogs();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Failed to ban",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (userId: string) => {
    setActionLoading(userId);
    setMessage(null);
    try {
      await callEdgeFunction("unban-user", { user_id: userId });
      setMessage({ type: "ok", text: "User unbanned." });
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar_url, is_admin, is_banned, is_permanently_banned, banned_until, created_at",
        )
        .eq("id", userId)
        .single();
      if (data) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === data.id ? (data as Profile) : p)),
        );
      }
      await refreshLogs();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Failed to unban",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const REPORT_STATUSES = [
    { value: "pending", label: "Pending", bg: "#fff8e1", color: "#f57f17" },
    {
      value: "working_on_it",
      label: "Working on it",
      bg: "#e3f2fd",
      color: "#1565c0",
    },
    { value: "resolved", label: "Resolved", bg: "#e8f5e9", color: "#2e7d32" },
    { value: "rejected", label: "Rejected", bg: "#fce4ec", color: "#880e4f" },
  ] as const;

  type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

  const getStatusStyle = (status: string | null) => {
    return (
      REPORT_STATUSES.find((s) => s.value === (status ?? "pending")) ??
      REPORT_STATUSES[0]
    );
  };

  const handleUpdateReportStatus = async (
    reportId: string,
    newStatus: ReportStatus,
  ) => {
    setStatusLoading(reportId);
    closeStatusMenu();
    const { error } = await supabase
      .from("reports")
      .update({
        status: newStatus,
        resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", reportId);
    if (error) {
      setMessage({
        type: "err",
        text: `Failed to update status: ${error.message}`,
      });
    } else {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                status: newStatus,
                resolved_at:
                  newStatus === "resolved" ? new Date().toISOString() : null,
              }
            : r,
        ),
      );
    }
    setStatusLoading(null);
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>Loading…</div>;
  }

  if (forbidden) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p style={{ marginBottom: 16 }}>Access denied. Admin only.</p>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: "10px 16px",
            background: "#333",
            color: "#fff",
            border: "none",
            borderRadius: 6,
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 24 }}>Moderation</h1>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: "8px 16px",
            background: "#666",
            color: "#fff",
            border: "none",
            borderRadius: 6,
          }}
        >
          Sign out
        </button>
      </div>

      {message && (
        <p
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: message.type === "ok" ? "#e8f5e9" : "#ffebee",
            color: message.type === "ok" ? "#2e7d32" : "#c62828",
          }}
        >
          {message.text}
        </p>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>Users</h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "banned", "unbanned"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setBanFilter(value)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: banFilter === value ? "#333" : "#fff",
                  color: banFilter === value ? "#fff" : "#111",
                  fontSize: 14,
                }}
              >
                {value === "all"
                  ? "All"
                  : value === "banned"
                    ? "Banned"
                    : "Unbanned"}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search by username or id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              maxWidth: 320,
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </div>
        <div
          style={{
            overflowX: "auto",
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee", textAlign: "left" }}>
                <th style={{ padding: 12 }}>Username</th>
                <th style={{ padding: 12 }}>ID</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 12 }}>@{p.username ?? "—"}</td>
                  <td style={{ padding: 12, fontSize: 12, color: "#666" }}>
                    {p.id.slice(0, 8)}…
                  </td>
                  <td style={{ padding: 12 }}>
                    {p.is_banned ? (
                      <span style={{ color: "#c00" }}>
                        Banned
                        {p.is_permanently_banned
                          ? " (permanent)"
                          : p.banned_until
                            ? ` until ${new Date(p.banned_until).toLocaleDateString()}`
                            : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#2e7d32" }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: 12 }}>
                    {p.is_banned ? (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() => handleUnban(p.id)}
                        style={{
                          padding: "6px 12px",
                          background: "#2e7d32",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      >
                        {actionLoading === p.id ? "…" : "Unban"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading !== null}
                        onClick={() =>
                          setBanModal({
                            userId: p.id,
                            username: p.username ?? "",
                          })
                        }
                        style={{
                          padding: "6px 12px",
                          background: "#c62828",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      >
                        Ban
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>Reports</h2>
        <div
          style={{
            overflowX: "auto",
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #eee", textAlign: "left" }}>
                <th style={{ padding: 12 }}>Reason</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Post / Comment</th>
                <th style={{ padding: 12 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: 24, color: "#666", textAlign: "center" }}
                  >
                    No reports
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const s = getStatusStyle(r.status);
                  const isOpen = statusMenuId === r.id;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 12 }}>{r.reason}</td>
                      <td style={{ padding: 12 }}>
                        <div style={{ display: "inline-block" }}>
                          <button
                            type="button"
                            disabled={statusLoading === r.id}
                            onClick={(e) => {
                              if (isOpen) {
                                closeStatusMenu();
                              } else {
                                const rect = (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                setStatusMenuAnchor({
                                  top: rect.bottom + 4,
                                  left: rect.left,
                                });
                                setStatusMenuId(r.id);
                              }
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "4px 10px",
                              borderRadius: 12,
                              border: `1px solid ${s.color}33`,
                              background: s.bg,
                              color: s.color,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {statusLoading === r.id ? "…" : s.label}
                            <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
                          </button>
                          {isOpen &&
                            statusMenuAnchor &&
                            createPortal(
                              <>
                                <div
                                  style={{
                                    position: "fixed",
                                    inset: 0,
                                    zIndex: 999,
                                  }}
                                  onClick={closeStatusMenu}
                                />
                                <div
                                  style={{
                                    position: "fixed",
                                    top: statusMenuAnchor.top,
                                    left: statusMenuAnchor.left,
                                    zIndex: 1000,
                                    background: "#fff",
                                    borderRadius: 8,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
                                    overflow: "hidden",
                                    minWidth: 160,
                                    border: "1px solid #eee",
                                  }}
                                >
                                  {REPORT_STATUSES.map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() =>
                                        handleUpdateReportStatus(
                                          r.id,
                                          opt.value,
                                        )
                                      }
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        width: "100%",
                                        padding: "9px 14px",
                                        background:
                                          opt.value === (r.status ?? "pending")
                                            ? opt.bg
                                            : "transparent",
                                        border: "none",
                                        borderBottom: "1px solid #f5f5f5",
                                        textAlign: "left",
                                        fontSize: 13,
                                        fontWeight:
                                          opt.value === (r.status ?? "pending")
                                            ? 600
                                            : 400,
                                        color:
                                          opt.value === (r.status ?? "pending")
                                            ? opt.color
                                            : "#333",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: "50%",
                                          background: opt.color,
                                          flexShrink: 0,
                                        }}
                                      />
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </>,
                              document.body,
                            )}
                        </div>
                      </td>
                      <td style={{ padding: 12, fontSize: 12 }}>
                        {r.post_id
                          ? `Post ${r.post_id.slice(0, 8)}…`
                          : r.comment_id
                            ? `Comment ${r.comment_id.slice(0, 8)}…`
                            : "—"}
                      </td>
                      <td style={{ padding: 12, fontSize: 12 }}>
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Admin Action Logs ── */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2 style={{ fontSize: 18, margin: 0 }}>Admin Action Logs</h2>
          <span style={{ fontSize: 13, color: "#888" }}>
            {filteredLogs.length}{" "}
            {filteredLogs.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {/* Filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {(["all", "ban", "unban", "delete_post"] as const).map((f) => {
            const isActive = logFilter === f;
            const colors =
              f !== "all" ? ACTION_COLORS[f] : { bg: "#333", color: "#fff" };
            return (
              <button
                key={f}
                type="button"
                onClick={() => setLogFilter(f)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 20,
                  border: "1px solid",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderColor: isActive
                    ? f === "all"
                      ? "#333"
                      : colors.color
                    : "#ddd",
                  background: isActive
                    ? f === "all"
                      ? "#333"
                      : colors.bg
                    : "#fff",
                  color: isActive
                    ? f === "all"
                      ? "#fff"
                      : colors.color
                    : "#555",
                  transition: "all 0.15s",
                }}
              >
                {f === "all" ? "All" : ACTION_LABELS[f]}
              </button>
            );
          })}
        </div>

        <div
          style={{
            overflowX: "auto",
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid #f0f0f0",
                  textAlign: "left",
                  background: "#fafafa",
                }}
              >
                <th
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#555",
                    whiteSpace: "nowrap",
                  }}
                >
                  When
                </th>
                <th
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#555",
                  }}
                >
                  Action
                </th>
                <th
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#555",
                  }}
                >
                  Admin
                </th>
                <th
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#555",
                  }}
                >
                  Target User
                </th>
                <th
                  style={{
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#555",
                  }}
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "40px 24px",
                      textAlign: "center",
                      color: "#aaa",
                      fontSize: 14,
                    }}
                  >
                    No action logs yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const adminProfile = profiles.find(
                    (p) => p.id === log.admin_id,
                  );
                  const targetProfile = log.target_user_id
                    ? profiles.find((p) => p.id === log.target_user_id)
                    : null;
                  const { bg, color } = ACTION_COLORS[log.action];

                  // Build a human-readable detail string
                  let detail = "";
                  if (log.action === "ban") {
                    const dur = (log.metadata.duration as string) ?? "";
                    const durLabel =
                      dur === "10_days"
                        ? "10 days"
                        : dur === "1_month"
                          ? "1 month"
                          : dur === "1_year"
                            ? "1 year"
                            : dur === "permanent"
                              ? "permanent"
                              : dur;
                    detail = `Duration: ${durLabel}`;
                  } else if (
                    log.action === "delete_post" &&
                    log.target_post_id
                  ) {
                    detail = `Post ${log.target_post_id.slice(0, 8)}…`;
                  }

                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid #f2f2f2",
                        transition: "background 0.1s",
                      }}
                    >
                      <td
                        style={{
                          padding: "11px 14px",
                          fontSize: 12,
                          color: "#777",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: bg,
                            color,
                          }}
                        >
                          {ACTION_LABELS[log.action]}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 13 }}>
                        {adminProfile ? (
                          <span title={log.admin_id}>
                            @{adminProfile.username}
                          </span>
                        ) : (
                          <span style={{ color: "#aaa", fontSize: 12 }}>
                            {log.admin_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 13 }}>
                        {targetProfile ? (
                          <span title={log.target_user_id ?? undefined}>
                            @{targetProfile.username}
                          </span>
                        ) : log.target_user_id ? (
                          <span style={{ color: "#aaa", fontSize: 12 }}>
                            {log.target_user_id.slice(0, 8)}…
                          </span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "11px 14px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {detail || <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {banModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
          onClick={() => setBanModal(null)}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 8,
              maxWidth: 360,
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 16 }}>Ban @{banModal.username}</h3>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Duration
              </label>
              <select
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              >
                {BAN_DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                onClick={() => setBanModal(null)}
                style={{
                  padding: "8px 16px",
                  background: "#eee",
                  border: "none",
                  borderRadius: 6,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading !== null}
                onClick={handleBan}
                style={{
                  padding: "8px 16px",
                  background: "#c62828",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                }}
              >
                {actionLoading === "ban" ? "…" : "Ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
