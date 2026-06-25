"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type DailySnapshot = {
  snapshot_date: string;
  dau_basic: number;
  dau_engaged: number;
  dau_action: number;
  posts_created: number;
  comments_created: number;
  communities_created: number;
};

type PreciseMetrics = {
  dau_basic: number;
  dau_engaged: number;
  dau_action: number;
  wau_basic: number;
  wau_engaged: number;
  wau_action: number;
  mau_basic: number;
  mau_engaged: number;
  mau_action: number;
};

type ContentMetrics = {
  posts: number;
  comments: number;
  communities: number;
};

type LiveTodayMetrics = {
  posts: number;
  comments: number;
  communities: number;
};

// ── Cache TTLs ────────────────────────────────────────────────────────────────

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  basic,
  engaged,
  action,
  loading,
}: {
  label: string;
  basic: number | null;
  engaged: number | null;
  action: number | null;
  loading: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 160,
        background: "#f9f9f9",
        borderRadius: 8,
        padding: "16px 20px",
        border: "1px solid #eee",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        {label}
      </p>
      {loading ? (
        <>
          {["Basic", "Engaged", "Action"].map((tier) => (
            <div key={tier} style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#aaa" }}>{tier}</span>
              <div
                style={{
                  display: "inline-block",
                  marginLeft: 8,
                  width: 40,
                  height: 14,
                  background: "#e0e0e0",
                  borderRadius: 4,
                  verticalAlign: "middle",
                }}
              />
            </div>
          ))}
        </>
      ) : (
        <>
          <Row label="Basic" value={basic} title="App opened / session started" />
          <Row label="Engaged" value={engaged} title="Spent ≥10 seconds in the app" />
          <Row label="Action" value={action} title="Created a post, comment, or community" />
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  title,
}: {
  label: string;
  value: number | null;
  title: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: "#555", cursor: "help" }} title={title}>
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: value == null ? "#ccc" : "#111",
        }}
      >
        {value == null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

function BarChart({ snapshots }: { snapshots: DailySnapshot[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const last14 = [...snapshots].slice(0, 14).reverse();
  const max = Math.max(...last14.map((s) => s.posts_created), 1);

  const hoveredSnap = last14.find((s) => s.snapshot_date === hovered) ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "#555", fontWeight: 500, margin: 0 }}>
          Posts per day — last 14 days
        </p>
        <span style={{ fontSize: 11, color: "#aaa" }}>(hover a bar for details)</span>
      </div>

      {/* Tooltip */}
      <div
        style={{
          minHeight: 52,
          marginBottom: 8,
          padding: "8px 12px",
          background: hoveredSnap ? "#1565c0" : "#f5f5f5",
          borderRadius: 6,
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {hoveredSnap ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 64 }}>
              {new Date(hoveredSnap.snapshot_date + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
            {[
              { label: "Posts", value: hoveredSnap.posts_created },
              { label: "Comments", value: hoveredSnap.comments_created },
              { label: "Communities", value: hoveredSnap.communities_created },
              { label: "DAU basic", value: hoveredSnap.dau_basic },
              { label: "DAU engaged", value: hoveredSnap.dau_engaged },
              { label: "DAU action", value: hoveredSnap.dau_action },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  {value.toLocaleString()}
                </div>
              </div>
            ))}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "#bbb" }}>Hover a bar to see daily stats</span>
        )}
      </div>

      {/* Bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
        {last14.map((s) => {
          const pct = Math.round((s.posts_created / max) * 100);
          const isHov = hovered === s.snapshot_date;
          return (
            <div
              key={s.snapshot_date}
              onMouseEnter={() => setHovered(s.snapshot_date)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "default",
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: pct === 0 ? 3 : `${Math.max(pct, 4)}%`,
                  background: isHov ? "#1565c0" : pct > 60 ? "#42a5f5" : "#90caf9",
                  borderRadius: "3px 3px 0 0",
                  transition: "background 0.1s, height 0.2s",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {last14.map((s) => {
          const date = new Date(s.snapshot_date + "T00:00:00Z");
          const label = date.toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            timeZone: "UTC",
          });
          return (
            <div
              key={s.snapshot_date}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 9,
                color: hovered === s.snapshot_date ? "#1565c0" : "#bbb",
                fontWeight: hovered === s.snapshot_date ? 700 : 400,
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ActivityStats() {
  // Stable client reference — createClient() must NOT be called on every render
  // or useCallback([supabase]) creates a new function each render, which triggers
  // the fetchContent useEffect every render, causing an infinite loading loop.
  const supabase = useMemo(() => createClient(), []);

  // Snapshot data — used only for bar chart and yesterday's DAU.
  // Source: daily_stats_snapshots (nightly cron at 05:05 UTC).
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const snapshotsFetchedAt = useRef<number>(0);

  // Precise WAU / MAU — COUNT DISTINCT from user_activity_events over N days.
  // Source: count_distinct_active_users / count_distinct_active_users_action RPCs.
  const [precise, setPrecise] = useState<PreciseMetrics | null>(null);
  const [preciseLoading, setPreciseLoading] = useState(true);
  const preciseFetchedAt = useRef<number>(0);

  // Live "today so far" — refreshed every 5 min.
  // Source: count_today_dau RPC + direct COUNT on posts/comments/communities.
  const [liveToday, setLiveToday] = useState<LiveTodayMetrics | null>(null);
  const [liveTodayLoading, setLiveTodayLoading] = useState(true);
  const liveTodayFetchedAt = useRef<number>(0);

  // Content counts for the selected period.
  // Source: direct COUNT queries on posts/comments/communities — always current,
  // no dependency on snapshot schedule or cron timing.
  // Formula: COUNT WHERE created_at >= (period start midnight UTC) AND not deleted.
  // 1d = today (since UTC midnight); 7d = today + previous 6 days; 30d = today + previous 29 days.
  const [content, setContent] = useState<ContentMetrics | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentPeriod, setContentPeriod] = useState<"1d" | "7d" | "30d">("7d");

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Data fetchers ───────────────────────────────────────────────────────────

  const fetchSnapshots = useCallback(async () => {
    if (Date.now() - snapshotsFetchedAt.current < THIRTY_MIN_MS) return;
    setSnapshotsLoading(true);
    try {
      const { data } = await supabase
        .from("daily_stats_snapshots")
        .select(
          "snapshot_date, dau_basic, dau_engaged, dau_action, posts_created, comments_created, communities_created",
        )
        .is("university_id", null)
        .order("snapshot_date", { ascending: false })
        .limit(30);
      if (data) {
        setSnapshots(data as DailySnapshot[]);
        snapshotsFetchedAt.current = Date.now();
        setLastRefreshed(new Date());
      }
    } finally {
      setSnapshotsLoading(false);
    }
  }, [supabase]);

  const fetchPrecise = useCallback(async () => {
    if (Date.now() - preciseFetchedAt.current < ONE_HOUR_MS) return;
    setPreciseLoading(true);
    try {
      const [
        dauBasic, dauEngaged, dauAction,
        wauBasic, wauEngaged, wauAction,
        mauBasic, mauEngaged, mauAction,
      ] = await Promise.all([
        supabase.rpc("count_distinct_active_users", { p_event: "session_start", p_days: 1 }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session", p_days: 1 }),
        supabase.rpc("count_distinct_active_users_action", { p_days: 1 }),
        supabase.rpc("count_distinct_active_users", { p_event: "session_start", p_days: 7 }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session", p_days: 7 }),
        supabase.rpc("count_distinct_active_users_action", { p_days: 7 }),
        supabase.rpc("count_distinct_active_users", { p_event: "session_start", p_days: 30 }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session", p_days: 30 }),
        supabase.rpc("count_distinct_active_users_action", { p_days: 30 }),
      ]);
      setPrecise({
        dau_basic: dauBasic.data ?? 0,
        dau_engaged: dauEngaged.data ?? 0,
        dau_action: dauAction.data ?? 0,
        wau_basic: wauBasic.data ?? 0,
        wau_engaged: wauEngaged.data ?? 0,
        wau_action: wauAction.data ?? 0,
        mau_basic: mauBasic.data ?? 0,
        mau_engaged: mauEngaged.data ?? 0,
        mau_action: mauAction.data ?? 0,
      });
      preciseFetchedAt.current = Date.now();
    } catch {
      // Non-fatal: falls back to snapshot approximation.
    } finally {
      setPreciseLoading(false);
    }
  }, [supabase]);

  const fetchLiveToday = useCallback(async () => {
    if (Date.now() - liveTodayFetchedAt.current < FIVE_MIN_MS) return;
    setLiveTodayLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const iso = todayStart.toISOString();

      const [postsRes, commentsRes, communitiesRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso)
          .or("is_deleted.is.null,is_deleted.eq.false"),
        supabase
          .from("communities")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso),
      ]);

      setLiveToday({
        posts: postsRes.count ?? 0,
        comments: commentsRes.count ?? 0,
        communities: communitiesRes.count ?? 0,
      });
      liveTodayFetchedAt.current = Date.now();
      setLastRefreshed(new Date());
    } catch {
      // Non-fatal.
    } finally {
      setLiveTodayLoading(false);
    }
  }, [supabase]);

  // Content for selected period — direct queries, no dependency on snapshots.
  //
  // Period windows (all anchored to UTC midnight):
  //   1d  → since today's midnight           (today only)
  //   7d  → since 6 days ago midnight        (today + 6 previous days = 7 days)
  //   30d → since 29 days ago midnight       (today + 29 previous days = 30 days)
  const fetchContent = useCallback(
    async (period: "1d" | "7d" | "30d") => {
      setContentLoading(true);
      try {
        const days = period === "1d" ? 1 : period === "7d" ? 7 : 30;
        const since = new Date();
        since.setDate(since.getDate() - (days - 1));
        since.setUTCHours(0, 0, 0, 0);
        const iso = since.toISOString();

        setContentError(null);
        const [postsRes, commentsRes, communitiesRes] = await Promise.all([
          supabase
            .from("posts")
            .select("id", { count: "exact", head: true })
            .gte("created_at", iso)
            .or("is_deleted.is.null,is_deleted.eq.false"),
          supabase
            .from("comments")
            .select("id", { count: "exact", head: true })
            .gte("created_at", iso)
            .or("is_deleted.is.null,is_deleted.eq.false"),
          supabase
            .from("communities")
            .select("id", { count: "exact", head: true })
            .gte("created_at", iso),
        ]);

        const firstErr = postsRes.error ?? commentsRes.error ?? communitiesRes.error;
        if (firstErr) {
          setContentError(firstErr.message);
        } else {
          setContent({
            posts: postsRes.count ?? 0,
            comments: commentsRes.count ?? 0,
            communities: communitiesRes.count ?? 0,
          });
        }
      } catch (e: unknown) {
        setContentError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setContentLoading(false);
      }
    },
    [supabase],
  );

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSnapshots();
    fetchPrecise();
    fetchLiveToday();
  }, [fetchSnapshots, fetchPrecise, fetchLiveToday]);

  // Re-query content whenever the period selector changes.
  useEffect(() => {
    fetchContent(contentPeriod);
  }, [contentPeriod, fetchContent]);

  // ── Derived values ──────────────────────────────────────────────────────────

  // All DAU/WAU/MAU values come from the precise live RPCs.
  // p_days:1 = last 24 hours (DAU), p_days:7 = WAU, p_days:30 = MAU.
  const dauBasic = precise?.dau_basic ?? null;
  const dauEngaged = precise?.dau_engaged ?? null;
  const dauAction = precise?.dau_action ?? null;
  const wauBasic = precise?.wau_basic ?? null;
  const wauEngaged = precise?.wau_engaged ?? null;
  const wauAction = precise?.wau_action ?? null;
  const mauBasic = precise?.mau_basic ?? null;
  const mauEngaged = precise?.mau_engaged ?? null;
  const mauAction = precise?.mau_action ?? null;

  // ── Refresh ─────────────────────────────────────────────────────────────────

  const refreshAll = () => {
    snapshotsFetchedAt.current = 0;
    preciseFetchedAt.current = 0;
    liveTodayFetchedAt.current = 0;
    fetchSnapshots();
    fetchPrecise();
    fetchLiveToday();
    fetchContent(contentPeriod);
  };

  const timeAgoLabel = lastRefreshed
    ? (() => {
        const secs = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
      })()
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 18 }}>Activity Statistics</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {timeAgoLabel != null && (
            <span style={{ fontSize: 12, color: "#aaa" }}>
              Last refreshed: {timeAgoLabel}
            </span>
          )}
          <button
            type="button"
            onClick={refreshAll}
            style={{
              background: "none",
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
              color: "#555",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* DAU / WAU / MAU cards — all from live COUNT DISTINCT RPCs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard
            label="DAU (24h)"
            basic={dauBasic}
            engaged={dauEngaged}
            action={dauAction}
            loading={preciseLoading}
          />
          <StatCard
            label="WAU (7d)"
            basic={wauBasic}
            engaged={wauEngaged}
            action={wauAction}
            loading={preciseLoading}
          />
          <StatCard
            label="MAU (30d)"
            basic={mauBasic}
            engaged={mauEngaged}
            action={mauAction}
            loading={preciseLoading}
          />
        </div>

        {/* Bar chart (snapshot-based historical trend) */}
        {!snapshotsLoading && snapshots.length > 0 && (
          <BarChart snapshots={snapshots} />
        )}
        {!snapshotsLoading && snapshots.length === 0 && (
          <p style={{ fontSize: 13, color: "#aaa" }}>
            No snapshot data yet. The daily aggregation job runs at 05:05 UTC.
          </p>
        )}
        {snapshotsLoading && (
          <div
            style={{
              height: 80,
              background: "#f5f5f5",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "#aaa" }}>Loading chart…</span>
          </div>
        )}

        {/* Content Created — direct COUNT from source tables, period-filtered */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: 1,
                margin: 0,
              }}
            >
              Content Created
            </p>
            <div style={{ display: "flex", gap: 4 }}>
              {(["1d", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setContentPeriod(p)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid",
                    fontSize: 12,
                    fontWeight: contentPeriod === p ? 700 : 400,
                    cursor: "pointer",
                    borderColor: contentPeriod === p ? "#1565c0" : "#ddd",
                    background: contentPeriod === p ? "#e3f2fd" : "#fff",
                    color: contentPeriod === p ? "#1565c0" : "#555",
                  }}
                >
                  {p === "1d" ? "Today" : p === "7d" ? "7 days" : "30 days"}
                </button>
              ))}
            </div>
          </div>
          {contentLoading ? (
            <div style={{ display: "flex", gap: 32 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{ width: 70, height: 12, background: "#e0e0e0", borderRadius: 4 }}
                  />
                  <div
                    style={{ width: 44, height: 24, background: "#e0e0e0", borderRadius: 4 }}
                  />
                </div>
              ))}
            </div>
          ) : contentError ? (
            <p style={{ fontSize: 13, color: "#c62828", margin: 0 }}>
              Error: {contentError}
            </p>
          ) : (
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[
                { label: "Posts", value: content?.posts ?? 0, color: "#1565c0" },
                { label: "Comments", value: content?.comments ?? 0, color: "#2e7d32" },
                { label: "Communities", value: content?.communities ?? 0, color: "#e65100" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</p>
                  <p
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color,
                      margin: 0,
                      lineHeight: 1,
                    }}
                  >
                    {value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: "#bbb", marginTop: 10, marginBottom: 0 }}>
            {contentPeriod === "1d"
              ? "Since today's UTC midnight"
              : contentPeriod === "7d"
                ? "Last 7 days (today + previous 6)"
                : "Last 30 days (today + previous 29)"}
            {" · "}non-deleted content · live from source tables
          </p>
        </div>

        {/* Tier legend */}
        <div
          style={{
            borderTop: "1px solid #f0f0f0",
            paddingTop: 16,
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              tier: "Basic",
              dot: "#90caf9",
              desc: "Opened the app / session created (SIGNED_IN or TOKEN_REFRESHED)",
            },
            {
              tier: "Engaged",
              dot: "#42a5f5",
              desc: "Stayed on the feed for ≥ 10 seconds",
            },
            {
              tier: "Action",
              dot: "#1565c0",
              desc: "Created a post, comment, or community",
            },
          ].map(({ tier, dot, desc }) => (
            <div
              key={tier}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                color: "#666",
                maxWidth: 240,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <span>
                <strong style={{ color: "#333" }}>{tier}:</strong> {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Today live content row */}
        <div
          style={{
            borderTop: "1px solid #f0f0f0",
            paddingTop: 16,
            fontSize: 13,
            color: "#555",
          }}
        >
          <strong>Today so far: </strong>
          {liveTodayLoading ? (
            <span style={{ color: "#aaa" }}>loading…</span>
          ) : liveToday ? (
            <>
              Posts {liveToday.posts.toLocaleString()}
              {" · "}Comments {liveToday.comments.toLocaleString()}
              {" · "}Communities {liveToday.communities.toLocaleString()}
            </>
          ) : (
            <span style={{ color: "#aaa" }}>—</span>
          )}
        </div>
      </div>
    </section>
  );
}
