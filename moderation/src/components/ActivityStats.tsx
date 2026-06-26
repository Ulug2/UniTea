"use client";

/**
 * ActivityStats — Moderation Analytics Dashboard
 *
 * DATA SOURCES
 * ─────────────────────────────────────────────────────────────────────
 * Activity table (DAU / WAU / MAU)
 *   RPC: get_event_counts_period(p_days)
 *   Source: user_activity_events (live, UTC-midnight anchored)
 *   Returns COUNT(*) per event_type — raw event occurrences, not unique users.
 *   p_days=1  → since today 00:00 UTC          (Today column)
 *   p_days=7  → since 6 days ago 00:00 UTC     (7-day column)
 *   p_days=30 → since 29 days ago 00:00 UTC    (30-day column)
 *
 * Bar chart
 *   RPC: get_daily_content_counts(p_days=90)
 *   Source: posts / comments / communities tables (live, grouped by calendar date UTC)
 *   Newest-first; paginated 7 days per page with ‹ › arrows.
 *
 * Content Created
 *   Direct COUNT queries on posts / comments / communities
 *   UTC-midnight anchored per period (Today / 7 days / 30 days)
 *   Always live — never cached beyond the current render cycle.
 *
 * CACHE TTLs
 * ─────────────────────────────────────────────────────────────────────
 * Today's event counts : auto-refreshes every 30 seconds
 * 7-day event counts   : 5 minutes
 * 30-day event counts  : 15 minutes
 * Bar chart data       : 5 minutes
 * Content Created      : no cache (re-queries on period change or Refresh)
 *
 * EVENT TYPES (user_activity_events.event_type)
 * ─────────────────────────────────────────────────────────────────────
 * session_start      – app cold-start (INITIAL_SESSION) or explicit login (SIGNED_IN).
 *                      TOKEN_REFRESHED is intentionally excluded to prevent inflation.
 * engaged_session    – user stayed on the feed for ≥10 seconds.
 * post_created       – user successfully created a post.
 * comment_created    – user successfully created a comment.
 * community_created  – user successfully created a community.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type EventCounts = {
  session_start:      number;
  engaged_session:    number;
  post_created:       number;
  comment_created:    number;
  community_created:  number;
};

type DailyCount = {
  day:         string; // "YYYY-MM-DD"
  posts:       number;
  comments:    number;
  communities: number;
};

type ContentMetrics = {
  posts:       number;
  comments:    number;
  communities: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_COUNTS: EventCounts = {
  session_start:     0,
  engaged_session:   0,
  post_created:      0,
  comment_created:   0,
  community_created: 0,
};

function parseEventRows(rows: { event_type: string; count: number }[]): EventCounts {
  const out = { ...EMPTY_COUNTS };
  for (const row of rows) {
    if (row.event_type in out) {
      (out as Record<string, number>)[row.event_type] = Number(row.count);
    }
  }
  return out;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const EVENT_ROWS: { key: keyof EventCounts; label: string; description: string }[] = [
  { key: "session_start",     label: "App Opens",           description: "Cold-starts and explicit logins (not background token refreshes)" },
  { key: "engaged_session",   label: "Engaged Sessions",    description: "User stayed on feed ≥10 seconds" },
  { key: "post_created",      label: "Posts Created",       description: "Successful post creations" },
  { key: "comment_created",   label: "Comments Created",    description: "Successful comment creations" },
  { key: "community_created", label: "Communities Created", description: "Successful community creations" },
];

function ActivityTable({
  today,
  week,
  month,
  loading,
}: {
  today:   EventCounts | null;
  week:    EventCounts | null;
  month:   EventCounts | null;
  loading: { today: boolean; week: boolean; month: boolean };
}) {
  const Skeleton = () => (
    <div
      style={{ display: "inline-block", width: 36, height: 14, background: "#e0e0e0", borderRadius: 3 }}
    />
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "6px 12px 10px 0",
                fontWeight: 700,
                fontSize: 11,
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                borderBottom: "1px solid #f0f0f0",
                whiteSpace: "nowrap",
              }}
            >
              Activity
            </th>
            {[
              { label: "Today",   sub: "since midnight UTC", col: "today" as const },
              { label: "7 days",  sub: "today + prev 6",     col: "week"  as const },
              { label: "30 days", sub: "today + prev 29",    col: "month" as const },
            ].map(({ label, sub, col }) => (
              <th
                key={col}
                style={{
                  textAlign: "right",
                  padding: "6px 0 10px 20px",
                  fontWeight: 700,
                  fontSize: 11,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  borderBottom: "1px solid #f0f0f0",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
                <div style={{ fontSize: 9, fontWeight: 400, color: "#bbb", textTransform: "none", letterSpacing: 0 }}>
                  {sub}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EVENT_ROWS.map(({ key, label, description }, i) => (
            <tr
              key={key}
              style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
            >
              <td
                style={{
                  padding: "9px 12px 9px 0",
                  color: "#333",
                  fontWeight: 500,
                  cursor: "help",
                  borderBottom: "1px solid #f5f5f5",
                }}
                title={description}
              >
                {label}
              </td>
              {[
                { data: today, isLoading: loading.today },
                { data: week,  isLoading: loading.week  },
                { data: month, isLoading: loading.month },
              ].map(({ data, isLoading }, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: "right",
                    padding: "9px 0 9px 20px",
                    fontWeight: 600,
                    color: "#111",
                    borderBottom: "1px solid #f5f5f5",
                  }}
                >
                  {isLoading ? <Skeleton /> : (data?.[key] ?? 0).toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#bbb", marginTop: 8, marginBottom: 0 }}>
        Counts are raw event occurrences (not unique users) · sourced from user_activity_events
        · Today auto-refreshes every 30s
      </p>
    </div>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function BarChart({ allDays, loading }: { allDays: DailyCount[]; loading: boolean }) {
  const [offset, setOffset]   = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  const PAGE       = 7;
  const totalPages = Math.max(1, Math.ceil(allDays.length / PAGE));
  const pageDesc   = allDays.slice(offset * PAGE, offset * PAGE + PAGE);
  const pageAsc    = [...pageDesc].reverse();
  const max        = Math.max(...pageDesc.map((d) => d.posts), 1);
  const hoveredDay = pageDesc.find((d) => d.day === hovered) ?? null;

  const fmtDate = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      timeZone: "UTC",
      ...opts,
    });

  const rangeLabel =
    pageAsc.length === 0
      ? ""
      : `${fmtDate(pageAsc[0].day, { month: "short", day: "numeric" })} – ${fmtDate(pageAsc[pageAsc.length - 1].day, { month: "short", day: "numeric" })}`;

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
    return <p style={{ fontSize: 13, color: "#aaa" }}>No data yet.</p>;
  }

  const NavBtn = ({ dir, disabled, onClick }: { dir: "‹" | "›"; disabled: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none",
        border: "1px solid",
        borderColor: disabled ? "#eee" : "#ddd",
        borderRadius: 4,
        width: 24, height: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#ccc" : "#555",
        fontSize: 14, padding: 0,
      }}
    >
      {dir}
    </button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "#555", fontWeight: 500, margin: 0 }}>
          Posts per day
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8, fontWeight: 400 }}>
            (hover for details)
          </span>
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#888" }}>{rangeLabel}</span>
          <NavBtn
            dir="‹"
            disabled={offset >= totalPages - 1}
            onClick={() => { setOffset((o) => o + 1); setHovered(null); }}
          />
          <NavBtn
            dir="›"
            disabled={offset === 0}
            onClick={() => { setOffset((o) => o - 1); setHovered(null); }}
          />
        </div>
      </div>

      {/* Tooltip */}
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
              {fmtDate(hoveredDay.day, { month: "short", day: "numeric" })}
            </span>
            {[
              { label: "Posts",       value: hoveredDay.posts       },
              { label: "Comments",    value: hoveredDay.comments    },
              { label: "Communities", value: hoveredDay.communities },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{value.toLocaleString()}</div>
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
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "default", height: "100%", justifyContent: "flex-end" }}
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

      {/* X-axis */}
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {pageAsc.map((d) => (
          <div
            key={d.day}
            style={{
              flex: 1, textAlign: "center", fontSize: 9,
              color: hovered === d.day ? "#1565c0" : "#bbb",
              fontWeight: hovered === d.day ? 700 : 400,
              overflow: "hidden", whiteSpace: "nowrap",
            }}
          >
            {fmtDate(d.day, { month: "numeric", day: "numeric" })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FIVE_MIN_MS    =  5 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const TODAY_INTERVAL = 30 * 1000; // auto-refresh today's counts every 30s

export function ActivityStats() {
  // Stable reference — must not be recreated on every render (would cause
  // useCallback deps to change → fetchContent useEffect loops infinitely).
  const supabase = useMemo(() => createClient(), []);

  // Activity counts per period
  const [todayCounts, setTodayCounts]   = useState<EventCounts | null>(null);
  const [weekCounts,  setWeekCounts]    = useState<EventCounts | null>(null);
  const [monthCounts, setMonthCounts]   = useState<EventCounts | null>(null);
  const [todayLoading,  setTodayLoading]  = useState(true);
  const [weekLoading,   setWeekLoading]   = useState(true);
  const [monthLoading,  setMonthLoading]  = useState(true);
  const weekFetchedAt  = useRef<number>(0);
  const monthFetchedAt = useRef<number>(0);

  // Bar chart
  const [barDays,    setBarDays]    = useState<DailyCount[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const barFetchedAt = useRef<number>(0);

  // Content Created
  const [content,        setContent]        = useState<ContentMetrics | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError,   setContentError]   = useState<string | null>(null);
  const [contentPeriod,  setContentPeriod]  = useState<"1d" | "7d" | "30d">("7d");

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  // Live today counts — called on mount and every 30s by the interval below.
  const fetchToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_event_counts_period", { p_days: 1 });
      if (!error && data) {
        setTodayCounts(parseEventRows(data as { event_type: string; count: number }[]));
        setLastRefreshed(new Date());
      }
    } catch { /* non-fatal */ }
    finally { setTodayLoading(false); }
  }, [supabase]);

  const fetchWeek = useCallback(async () => {
    if (Date.now() - weekFetchedAt.current < FIVE_MIN_MS) return;
    setWeekLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_event_counts_period", { p_days: 7 });
      if (!error && data) {
        setWeekCounts(parseEventRows(data as { event_type: string; count: number }[]));
        weekFetchedAt.current = Date.now();
      }
    } catch { /* non-fatal */ }
    finally { setWeekLoading(false); }
  }, [supabase]);

  const fetchMonth = useCallback(async () => {
    if (Date.now() - monthFetchedAt.current < FIFTEEN_MIN_MS) return;
    setMonthLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_event_counts_period", { p_days: 30 });
      if (!error && data) {
        setMonthCounts(parseEventRows(data as { event_type: string; count: number }[]));
        monthFetchedAt.current = Date.now();
      }
    } catch { /* non-fatal */ }
    finally { setMonthLoading(false); }
  }, [supabase]);

  const fetchBar = useCallback(async () => {
    if (Date.now() - barFetchedAt.current < FIVE_MIN_MS) return;
    setBarLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_daily_content_counts", { p_days: 90 });
      if (!error && data) {
        setBarDays(data as DailyCount[]);
        barFetchedAt.current = Date.now();
      }
    } catch { /* non-fatal */ }
    finally { setBarLoading(false); }
  }, [supabase]);

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
        supabase.from("posts").select("id", { count: "exact", head: true })
          .gte("created_at", iso).or("is_deleted.is.null,is_deleted.eq.false"),
        supabase.from("comments").select("id", { count: "exact", head: true })
          .gte("created_at", iso).or("is_deleted.is.null,is_deleted.eq.false"),
        supabase.from("communities").select("id", { count: "exact", head: true })
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

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchToday();
    fetchWeek();
    fetchMonth();
    fetchBar();
  }, [fetchToday, fetchWeek, fetchMonth, fetchBar]);

  // Auto-refresh today every 30 seconds so DAU stays live.
  useEffect(() => {
    const id = setInterval(fetchToday, TODAY_INTERVAL);
    return () => clearInterval(id);
  }, [fetchToday]);

  useEffect(() => {
    fetchContent(contentPeriod);
  }, [contentPeriod, fetchContent]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const refreshAll = () => {
    weekFetchedAt.current  = 0;
    monthFetchedAt.current = 0;
    barFetchedAt.current   = 0;
    fetchToday();
    fetchWeek();
    fetchMonth();
    fetchBar();
    fetchContent(contentPeriod);
  };

  const timeAgoLabel = lastRefreshed
    ? (() => {
        const secs = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
      })()
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Activity Statistics</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {timeAgoLabel && (
            <span style={{ fontSize: 12, color: "#aaa" }}>Last refreshed: {timeAgoLabel}</span>
          )}
          <button
            type="button"
            onClick={refreshAll}
            style={{
              background: "none", border: "1px solid #ddd", borderRadius: 6,
              padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#555",
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
          gap: 24,
        }}
      >
        {/* Activity table: DAU / WAU / MAU */}
        <ActivityTable
          today={todayCounts}
          week={weekCounts}
          month={monthCounts}
          loading={{ today: todayLoading, week: weekLoading, month: monthLoading }}
        />

        {/* Bar chart */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
          <BarChart allDays={barDays} loading={barLoading} />
        </div>

        {/* Content Created */}
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
                    padding: "4px 12px", borderRadius: 6, border: "1px solid", fontSize: 12,
                    fontWeight: contentPeriod === p ? 700 : 400, cursor: "pointer",
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
      </div>
    </section>
  );
}
