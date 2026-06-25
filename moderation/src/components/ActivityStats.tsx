"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type DailyCount = {
  day: string;        // ISO date string, e.g. "2026-06-24"
  posts: number;
  comments: number;
  communities: number;
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

// ── Cache TTLs ────────────────────────────────────────────────────────────────

const ONE_HOUR_MS  = 60 * 60 * 1000;
const FIVE_MIN_MS  =  5 * 60 * 1000;

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
          <Row label="Basic"   value={basic}   title="App opened / session started" />
          <Row label="Engaged" value={engaged} title="Spent ≥10 seconds in the app" />
          <Row label="Action"  value={action}  title="Created a post, comment, or community" />
        </>
      )}
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: number | null; title: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: "#555", cursor: "help" }} title={title}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: value == null ? "#ccc" : "#111" }}>
        {value == null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

// Bar chart — 7 days per page, arrows navigate to older weeks.
// `allDays` arrives newest-first from the RPC; offset=0 is the current week.
function BarChart({ allDays, loading }: { allDays: DailyCount[]; loading: boolean }) {
  const [offset, setOffset]   = useState(0);   // weeks back from today
  const [hovered, setHovered] = useState<string | null>(null);

  const PAGE = 7;
  const totalPages = Math.max(1, Math.ceil(allDays.length / PAGE));

  // Slice newest-first, then reverse for left→right display
  const pageDesc  = allDays.slice(offset * PAGE, offset * PAGE + PAGE);
  const pageAsc   = [...pageDesc].reverse();
  const max       = Math.max(...pageDesc.map((d) => d.posts), 1);
  const hoveredDay = pageDesc.find((d) => d.day === hovered) ?? null;

  // Date range label for the current page
  const rangeLabel = (() => {
    if (pageAsc.length === 0) return "";
    const fmt = (iso: string) =>
      new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short", day: "numeric", timeZone: "UTC",
      });
    return `${fmt(pageAsc[0].day)} – ${fmt(pageAsc[pageAsc.length - 1].day)}`;
  })();

  if (loading) {
    return (
      <div
        style={{
          height: 120,
          background: "#f5f5f5",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#aaa" }}>Loading chart…</span>
      </div>
    );
  }

  if (allDays.length === 0) {
    return <p style={{ fontSize: 13, color: "#aaa" }}>No post data yet.</p>;
  }

  const ArrowBtn = ({
    dir,
    disabled,
    onClick,
  }: {
    dir: "prev" | "next";
    disabled: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none",
        border: "1px solid",
        borderColor: disabled ? "#eee" : "#ddd",
        borderRadius: 4,
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#ccc" : "#555",
        fontSize: 13,
        lineHeight: 1,
        padding: 0,
      }}
    >
      {dir === "prev" ? "‹" : "›"}
    </button>
  );

  return (
    <div>
      {/* Header row with nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <p style={{ fontSize: 13, color: "#555", fontWeight: 500, margin: 0 }}>
          Posts per day
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#888" }}>{rangeLabel}</span>
          <ArrowBtn
            dir="prev"
            disabled={offset >= totalPages - 1}
            onClick={() => { setOffset((o) => o + 1); setHovered(null); }}
          />
          <ArrowBtn
            dir="next"
            disabled={offset === 0}
            onClick={() => { setOffset((o) => o - 1); setHovered(null); }}
          />
        </div>
      </div>

      {/* Tooltip panel */}
      <div
        style={{
          minHeight: 52,
          marginBottom: 8,
          padding: "8px 12px",
          background: hoveredDay ? "#1565c0" : "#f5f5f5",
          borderRadius: 6,
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {hoveredDay ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 64 }}>
              {new Date(hoveredDay.day + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short", day: "numeric", timeZone: "UTC",
              })}
            </span>
            {[
              { label: "Posts",       value: hoveredDay.posts       },
              { label: "Comments",    value: hoveredDay.comments    },
              { label: "Communities", value: hoveredDay.communities },
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
          <span style={{ fontSize: 12, color: "#bbb" }}>Hover a bar to see daily breakdown</span>
        )}
      </div>

      {/* Bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
        {pageAsc.map((d) => {
          const pct   = Math.round((d.posts / max) * 100);
          const isHov = hovered === d.day;
          return (
            <div
              key={d.day}
              onMouseEnter={() => setHovered(d.day)}
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
                  transition: "background 0.1s",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {pageAsc.map((d) => {
          const label = new Date(d.day + "T00:00:00Z").toLocaleDateString("en-US", {
            month: "numeric", day: "numeric", timeZone: "UTC",
          });
          return (
            <div
              key={d.day}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 9,
                color: hovered === d.day ? "#1565c0" : "#bbb",
                fontWeight: hovered === d.day ? 700 : 400,
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
  // Stable reference — must not be recreated on every render or useCallback
  // deps change every render, causing fetchContent to loop infinitely.
  const supabase = useMemo(() => createClient(), []);

  // Live daily counts for bar chart (from get_daily_content_counts RPC).
  const [barDays, setBarDays]           = useState<DailyCount[]>([]);
  const [barLoading, setBarLoading]     = useState(true);
  const barFetchedAt                    = useRef<number>(0);

  // Precise DAU/WAU/MAU — COUNT DISTINCT from user_activity_events.
  const [precise, setPrecise]           = useState<PreciseMetrics | null>(null);
  const [preciseLoading, setPreciseLoading] = useState(true);
  const preciseFetchedAt                = useRef<number>(0);

  // Content counts for the selected period — direct COUNT on live tables.
  const [content, setContent]           = useState<ContentMetrics | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentPeriod, setContentPeriod] = useState<"1d" | "7d" | "30d">("7d");

  // Live today content — refreshed every 5 min.
  const [liveToday, setLiveToday]       = useState<ContentMetrics | null>(null);
  const [liveTodayLoading, setLiveTodayLoading] = useState(true);
  const liveTodayFetchedAt              = useRef<number>(0);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Data fetchers ───────────────────────────────────────────────────────────

  const fetchBar = useCallback(async () => {
    if (Date.now() - barFetchedAt.current < FIVE_MIN_MS) return;
    setBarLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_daily_content_counts", { p_days: 90 });
      if (!error && data) {
        setBarDays(data as DailyCount[]);
        barFetchedAt.current = Date.now();
        setLastRefreshed(new Date());
      }
    } finally {
      setBarLoading(false);
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
        supabase.rpc("count_distinct_active_users", { p_event: "session_start",  p_days: 1  }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session",p_days: 1  }),
        supabase.rpc("count_distinct_active_users_action",                      { p_days: 1  }),
        supabase.rpc("count_distinct_active_users", { p_event: "session_start",  p_days: 7  }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session",p_days: 7  }),
        supabase.rpc("count_distinct_active_users_action",                      { p_days: 7  }),
        supabase.rpc("count_distinct_active_users", { p_event: "session_start",  p_days: 30 }),
        supabase.rpc("count_distinct_active_users", { p_event: "engaged_session",p_days: 30 }),
        supabase.rpc("count_distinct_active_users_action",                      { p_days: 30 }),
      ]);
      setPrecise({
        dau_basic:   dauBasic.data  ?? 0,
        dau_engaged: dauEngaged.data ?? 0,
        dau_action:  dauAction.data  ?? 0,
        wau_basic:   wauBasic.data  ?? 0,
        wau_engaged: wauEngaged.data ?? 0,
        wau_action:  wauAction.data  ?? 0,
        mau_basic:   mauBasic.data  ?? 0,
        mau_engaged: mauEngaged.data ?? 0,
        mau_action:  mauAction.data  ?? 0,
      });
      preciseFetchedAt.current = Date.now();
    } catch {
      // non-fatal
    } finally {
      setPreciseLoading(false);
    }
  }, [supabase]);

  // Period windows anchored to UTC midnight:
  //   1d  = today only (since midnight)
  //   7d  = today + prev 6 days
  //   30d = today + prev 29 days
  const fetchContent = useCallback(async (period: "1d" | "7d" | "30d") => {
    setContentLoading(true);
    setContentError(null);
    try {
      const days  = period === "1d" ? 1 : period === "7d" ? 7 : 30;
      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      since.setUTCHours(0, 0, 0, 0);
      const iso = since.toISOString();

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
          posts:       postsRes.count       ?? 0,
          comments:    commentsRes.count    ?? 0,
          communities: communitiesRes.count ?? 0,
        });
      }
    } catch (e: unknown) {
      setContentError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setContentLoading(false);
    }
  }, [supabase]);

  const fetchLiveToday = useCallback(async () => {
    if (Date.now() - liveTodayFetchedAt.current < FIVE_MIN_MS) return;
    setLiveTodayLoading(true);
    try {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const iso = since.toISOString();

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
        posts:       postsRes.count       ?? 0,
        comments:    commentsRes.count    ?? 0,
        communities: communitiesRes.count ?? 0,
      });
      liveTodayFetchedAt.current = Date.now();
      setLastRefreshed(new Date());
    } catch {
      // non-fatal
    } finally {
      setLiveTodayLoading(false);
    }
  }, [supabase]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchBar();
    fetchPrecise();
    fetchLiveToday();
  }, [fetchBar, fetchPrecise, fetchLiveToday]);

  useEffect(() => {
    fetchContent(contentPeriod);
  }, [contentPeriod, fetchContent]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const dauBasic   = precise?.dau_basic   ?? null;
  const dauEngaged = precise?.dau_engaged ?? null;
  const dauAction  = precise?.dau_action  ?? null;
  const wauBasic   = precise?.wau_basic   ?? null;
  const wauEngaged = precise?.wau_engaged ?? null;
  const wauAction  = precise?.wau_action  ?? null;
  const mauBasic   = precise?.mau_basic   ?? null;
  const mauEngaged = precise?.mau_engaged ?? null;
  const mauAction  = precise?.mau_action  ?? null;

  // ── Refresh ─────────────────────────────────────────────────────────────────

  const refreshAll = () => {
    barFetchedAt.current       = 0;
    preciseFetchedAt.current   = 0;
    liveTodayFetchedAt.current = 0;
    fetchBar();
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
        const rem = mins % 60;
        return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
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
            <span style={{ fontSize: 12, color: "#aaa" }}>Last refreshed: {timeAgoLabel}</span>
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
        {/* DAU / WAU / MAU */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="DAU (24h)"  basic={dauBasic}   engaged={dauEngaged} action={dauAction}  loading={preciseLoading} />
          <StatCard label="WAU (7d)"   basic={wauBasic}   engaged={wauEngaged} action={wauAction}  loading={preciseLoading} />
          <StatCard label="MAU (30d)"  basic={mauBasic}   engaged={mauEngaged} action={mauAction}  loading={preciseLoading} />
        </div>

        {/* Bar chart — live from get_daily_content_counts RPC */}
        <BarChart allDays={barDays} loading={barLoading} />

        {/* Content Created */}
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
                    background:  contentPeriod === p ? "#e3f2fd" : "#fff",
                    color:       contentPeriod === p ? "#1565c0" : "#555",
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
                  <div style={{ width: 70, height: 12, background: "#e0e0e0", borderRadius: 4 }} />
                  <div style={{ width: 44, height: 24, background: "#e0e0e0", borderRadius: 4 }} />
                </div>
              ))}
            </div>
          ) : contentError ? (
            <p style={{ fontSize: 13, color: "#c62828", margin: 0 }}>Error: {contentError}</p>
          ) : (
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[
                { label: "Posts",       value: content?.posts       ?? 0, color: "#1565c0" },
                { label: "Comments",    value: content?.comments    ?? 0, color: "#2e7d32" },
                { label: "Communities", value: content?.communities ?? 0, color: "#e65100" },
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
            { tier: "Basic",   dot: "#90caf9", desc: "App opened / session started" },
            { tier: "Engaged", dot: "#42a5f5", desc: "Stayed on the feed for ≥10 seconds" },
            { tier: "Action",  dot: "#1565c0", desc: "Created a post, comment, or community" },
          ].map(({ tier, dot, desc }) => (
            <div
              key={tier}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#666", maxWidth: 240 }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0, marginTop: 2 }}
              />
              <span>
                <strong style={{ color: "#333" }}>{tier}:</strong> {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Today so far */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, fontSize: 13, color: "#555" }}>
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
