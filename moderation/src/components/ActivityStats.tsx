"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";

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
  wau_basic: number;
  wau_engaged: number;
  wau_action: number;
  mau_basic: number;
  mau_engaged: number;
  mau_action: number;
};

type TodayMetrics = {
  dau_basic: number;
  posts_today: number;
  comments_today: number;
  communities_today: number;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

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
      <span
        style={{ fontSize: 13, color: "#555", cursor: "help" }}
        title={title}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: value == null ? "#ccc" : "#111" }}>
        {value == null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

function BarChart({ snapshots }: { snapshots: DailySnapshot[] }) {
  const last14 = [...snapshots].slice(0, 14).reverse();
  const max = Math.max(...last14.map((s) => s.posts_created), 1);

  return (
    <div>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 10, fontWeight: 500 }}>
        Posts per day (last 14 days)
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          height: 64,
        }}
      >
        {last14.map((s) => {
          const heightPct = Math.round((s.posts_created / max) * 100);
          const date = new Date(s.snapshot_date + "T00:00:00Z");
          const label = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });
          return (
            <div
              key={s.snapshot_date}
              title={`${label}: ${s.posts_created} posts`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                cursor: "default",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 32,
                  height: heightPct === 0 ? 2 : `${heightPct}%`,
                  minHeight: 2,
                  background: heightPct > 60 ? "#1565c0" : "#90caf9",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 0.3s",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 4,
        }}
      >
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
                color: "#aaa",
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

export function ActivityStats() {
  const supabase = createClient();

  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const snapshotsFetchedAt = useRef<number>(0);

  const [precise, setPrecise] = useState<PreciseMetrics | null>(null);
  const [preciseLoading, setPreciseLoading] = useState(true);
  const preciseFetchedAt = useRef<number>(0);

  const [today, setToday] = useState<TodayMetrics | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const todayFetchedAt = useRef<number>(0);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [contentPeriod, setContentPeriod] = useState<"1d" | "7d" | "30d">("7d");

  const fetchSnapshots = useCallback(async () => {
    if (Date.now() - snapshotsFetchedAt.current < THIRTY_MIN_MS) return;
    setSnapshotsLoading(true);
    try {
      const { data } = await supabase
        .from("daily_stats_snapshots")
        .select("snapshot_date, dau_basic, dau_engaged, dau_action, posts_created, comments_created, communities_created")
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
      const [wauBasic, wauEngaged, wauAction, mauBasic, mauEngaged, mauAction] =
        await Promise.all([
          supabase.rpc("count_distinct_active_users", { p_event: "session_start", p_days: 7 }),
          supabase.rpc("count_distinct_active_users", { p_event: "engaged_session", p_days: 7 }),
          supabase.rpc("count_distinct_active_users_action", { p_days: 7 }),
          supabase.rpc("count_distinct_active_users", { p_event: "session_start", p_days: 30 }),
          supabase.rpc("count_distinct_active_users", { p_event: "engaged_session", p_days: 30 }),
          supabase.rpc("count_distinct_active_users_action", { p_days: 30 }),
        ]);
      setPrecise({
        wau_basic: wauBasic.data ?? 0,
        wau_engaged: wauEngaged.data ?? 0,
        wau_action: wauAction.data ?? 0,
        mau_basic: mauBasic.data ?? 0,
        mau_engaged: mauEngaged.data ?? 0,
        mau_action: mauAction.data ?? 0,
      });
      preciseFetchedAt.current = Date.now();
    } catch {
      // show dashes on failure — page must not crash
    } finally {
      setPreciseLoading(false);
    }
  }, [supabase]);

  const fetchToday = useCallback(async () => {
    if (Date.now() - todayFetchedAt.current < FIVE_MIN_MS) return;
    setTodayLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const iso = todayStart.toISOString();

      const [dauRes, postsRes, commentsRes, communitiesRes] = await Promise.all([
        supabase.rpc("count_today_dau", { p_since: iso }),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso)
          .neq("is_deleted", true),
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso)
          .neq("is_deleted", true),
        supabase
          .from("communities")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso),
      ]);

      setToday({
        dau_basic: dauRes.data ?? 0,
        posts_today: postsRes.count ?? 0,
        comments_today: commentsRes.count ?? 0,
        communities_today: communitiesRes.count ?? 0,
      });
      todayFetchedAt.current = Date.now();
    } catch {
      // non-fatal
    } finally {
      setTodayLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSnapshots();
    fetchPrecise();
    fetchToday();
  }, [fetchSnapshots, fetchPrecise, fetchToday]);

  // DAU from snapshots (most recent snapshot date)
  const latestSnapshot = snapshots[0] ?? null;

  // Approximate WAU/MAU from snapshots while precise query loads
  const approxWauBasic = snapshots.slice(0, 7).reduce((s, r) => s + r.dau_basic, 0);
  const approxWauEngaged = snapshots.slice(0, 7).reduce((s, r) => s + r.dau_engaged, 0);
  const approxWauAction = snapshots.slice(0, 7).reduce((s, r) => s + r.dau_action, 0);
  const approxMauBasic = snapshots.slice(0, 30).reduce((s, r) => s + r.dau_basic, 0);
  const approxMauEngaged = snapshots.slice(0, 30).reduce((s, r) => s + r.dau_engaged, 0);
  const approxMauAction = snapshots.slice(0, 30).reduce((s, r) => s + r.dau_action, 0);

  // Content totals for the selected period.
  // Snapshots only cover completed days (nightly cron), so today's live counts are
  // always added on top so the numbers stay current throughout the day.
  const todayPosts       = today?.posts_today ?? 0;
  const todayComments    = today?.comments_today ?? 0;
  const todayCommunities = today?.communities_today ?? 0;
  const contentDays = contentPeriod === "7d" ? 7 : 30;
  const contentSlice = snapshots.slice(0, contentDays);
  const contentPosts       = contentPeriod === "1d" ? todayPosts       : contentSlice.reduce((s, r) => s + r.posts_created, 0)       + todayPosts;
  const contentComments    = contentPeriod === "1d" ? todayComments    : contentSlice.reduce((s, r) => s + r.comments_created, 0)    + todayComments;
  const contentCommunities = contentPeriod === "1d" ? todayCommunities : contentSlice.reduce((s, r) => s + r.communities_created, 0) + todayCommunities;

  const wauBasic = precise?.wau_basic ?? (snapshotsLoading ? null : approxWauBasic);
  const wauEngaged = precise?.wau_engaged ?? (snapshotsLoading ? null : approxWauEngaged);
  const wauAction = precise?.wau_action ?? (snapshotsLoading ? null : approxWauAction);
  const mauBasic = precise?.mau_basic ?? (snapshotsLoading ? null : approxMauBasic);
  const mauEngaged = precise?.mau_engaged ?? (snapshotsLoading ? null : approxMauEngaged);
  const mauAction = precise?.mau_action ?? (snapshotsLoading ? null : approxMauAction);

  const refreshAll = () => {
    snapshotsFetchedAt.current = 0;
    preciseFetchedAt.current = 0;
    todayFetchedAt.current = 0;
    fetchSnapshots();
    fetchPrecise();
    fetchToday();
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
        {/* DAU / WAU / MAU cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard
            label="DAU"
            basic={snapshotsLoading ? null : (latestSnapshot?.dau_basic ?? 0)}
            engaged={snapshotsLoading ? null : (latestSnapshot?.dau_engaged ?? 0)}
            action={snapshotsLoading ? null : (latestSnapshot?.dau_action ?? 0)}
            loading={snapshotsLoading}
          />
          <StatCard
            label="WAU"
            basic={wauBasic}
            engaged={wauEngaged}
            action={wauAction}
            loading={preciseLoading && snapshotsLoading}
          />
          <StatCard
            label="MAU"
            basic={mauBasic}
            engaged={mauEngaged}
            action={mauAction}
            loading={preciseLoading && snapshotsLoading}
          />
        </div>

        {/* Bar chart */}
        {!snapshotsLoading && snapshots.length > 0 && (
          <BarChart snapshots={snapshots} />
        )}
        {!snapshotsLoading && snapshots.length === 0 && (
          <p style={{ fontSize: 13, color: "#aaa" }}>
            No snapshot data yet. The daily aggregation job runs at 00:05 ET.
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

        {/* Content created — with period selector */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
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
                  {p === "1d" ? "1 day" : p === "7d" ? "7 days" : "1 month"}
                </button>
              ))}
            </div>
          </div>
          {(contentPeriod === "1d" ? todayLoading : snapshotsLoading || todayLoading) ? (
            <div style={{ display: "flex", gap: 32 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ width: 70, height: 12, background: "#e0e0e0", borderRadius: 4 }} />
                  <div style={{ width: 44, height: 24, background: "#e0e0e0", borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[
                { label: "Posts", value: contentPosts, color: "#1565c0" },
                { label: "Comments", value: contentComments, color: "#2e7d32" },
                { label: "Communities", value: contentCommunities, color: "#e65100" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0, lineHeight: 1 }}>
                    {value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
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
            <div key={tier} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#666", maxWidth: 240 }}>
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

        {/* Today live */}
        <div
          style={{
            borderTop: "1px solid #f0f0f0",
            paddingTop: 16,
            fontSize: 13,
            color: "#555",
          }}
        >
          <strong>Today so far: </strong>
          {todayLoading ? (
            <span style={{ color: "#aaa" }}>loading…</span>
          ) : today ? (
            <>
              DAU {today.dau_basic.toLocaleString()} (basic)
              {" · "}Posts {today.posts_today.toLocaleString()}
              {" · "}Comments {today.comments_today.toLocaleString()}
              {" · "}Communities {today.communities_today.toLocaleString()}
            </>
          ) : (
            <span style={{ color: "#aaa" }}>—</span>
          )}
        </div>
      </div>
    </section>
  );
}
