"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type AnalyticsSummary = {
  dau_app_opens:    number;
  dau_posts:        number;
  dau_comments:     number;
  dau_communities:  number;
  wau_app_opens:    number;
  wau_posts:        number;
  wau_comments:     number;
  wau_communities:  number;
  mau_app_opens:    number;
  mau_posts:        number;
  mau_comments:     number;
  mau_communities:  number;
};

type ChartDay = {
  et_date:     string; // "YYYY-MM-DD" Eastern Time calendar date
  dau:         number;
  posts:       number;
  comments:    number;
  communities: number;
};

// ── Table config ──────────────────────────────────────────────────────────────

const TABLE_ROWS: {
  label: string;
  keys: [keyof AnalyticsSummary, keyof AnalyticsSummary, keyof AnalyticsSummary];
}[] = [
  { label: "App Opens",           keys: ["dau_app_opens",   "wau_app_opens",   "mau_app_opens"]   },
  { label: "Posts Created",       keys: ["dau_posts",       "wau_posts",       "mau_posts"]       },
  { label: "Comments Created",    keys: ["dau_comments",    "wau_comments",    "mau_comments"]    },
  { label: "Communities Created", keys: ["dau_communities", "wau_communities", "mau_communities"] },
];

const TABLE_COLS = [
  { label: "DAU (Today)",        sub: "since midnight ET"          },
  { label: "WAU (Prev 7 Days)",  sub: "prev 7 completed days, ET"  },
  { label: "MAU (Prev 30 Days)", sub: "prev 30 completed days, ET" },
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: "inline-block", width: 36, height: 14, background: "#e0e0e0", borderRadius: 3 }} />
  );
}

function AnalyticsTable({ summary, loading }: { summary: AnalyticsSummary | null; loading: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{
              textAlign: "left", padding: "6px 12px 10px 0",
              fontWeight: 700, fontSize: 11, color: "#888",
              textTransform: "uppercase", letterSpacing: 0.8,
              borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap",
            }}>
              Activity
            </th>
            {TABLE_COLS.map(({ label, sub }) => (
              <th key={label} style={{
                textAlign: "right", padding: "6px 0 10px 20px",
                fontWeight: 700, fontSize: 11, color: "#888",
                textTransform: "uppercase", letterSpacing: 0.8,
                borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap",
              }}>
                {label}
                <div style={{ fontSize: 9, fontWeight: 400, color: "#bbb", textTransform: "none", letterSpacing: 0 }}>
                  {sub}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_ROWS.map(({ label, keys }, i) => (
            <tr key={label} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={{
                padding: "9px 12px 9px 0", color: "#333",
                fontWeight: 500, borderBottom: "1px solid #f5f5f5",
              }}>
                {label}
              </td>
              {keys.map((field, ci) => (
                <td key={ci} style={{
                  textAlign: "right", padding: "9px 0 9px 20px",
                  fontWeight: 600, color: "#111", borderBottom: "1px solid #f5f5f5",
                }}>
                  {loading ? <Skeleton /> : (summary?.[field] ?? 0).toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#bbb", marginTop: 8, marginBottom: 0 }}>
        App Opens = unique users · other rows = total events · all Eastern Time · today auto-refreshes every 30s
      </p>
    </div>
  );
}

function BarChart({ allDays, loading }: { allDays: ChartDay[]; loading: boolean }) {
  const [offset, setOffset]   = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  const PAGE       = 7;
  const totalPages = Math.max(1, Math.ceil(allDays.length / PAGE));
  const pageDesc   = allDays.slice(offset * PAGE, offset * PAGE + PAGE);
  const pageAsc    = [...pageDesc].reverse();
  const max        = Math.max(...pageAsc.map((d) => d.dau), 1);
  const hoveredDay = pageDesc.find((d) => d.et_date === hovered) ?? null;

  // et_date is already the correct ET calendar date ("YYYY-MM-DD").
  // Appending T12:00:00Z (noon UTC) prevents JS Date from shifting the date
  // due to local timezone when we format it.
  const fmtDate = (etDate: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(etDate + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

  const rangeLabel =
    pageAsc.length === 0
      ? ""
      : `${fmtDate(pageAsc[0].et_date, { month: "short", day: "numeric" })} – ${fmtDate(pageAsc[pageAsc.length - 1].et_date, { month: "short", day: "numeric" })}`;

  if (loading) {
    return (
      <div style={{
        height: 120, background: "#f5f5f5", borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 13, color: "#aaa" }}>Loading chart…</span>
      </div>
    );
  }

  if (allDays.length === 0) {
    return <p style={{ fontSize: 13, color: "#aaa" }}>No data yet.</p>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "#555", fontWeight: 500, margin: 0 }}>
          Daily Active Users
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8, fontWeight: 400 }}>(hover for details)</span>
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
      <div style={{
        minHeight: 52, marginBottom: 8, padding: "8px 12px",
        background: hoveredDay ? "#1565c0" : "#f5f5f5",
        borderRadius: 6, transition: "background 0.15s",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        {hoveredDay ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 64 }}>
              {fmtDate(hoveredDay.et_date, { month: "short", day: "numeric" })}
            </span>
            {([
              { label: "DAU",         value: hoveredDay.dau         },
              { label: "Posts",       value: hoveredDay.posts       },
              { label: "Comments",    value: hoveredDay.comments    },
              { label: "Communities", value: hoveredDay.communities },
            ] as const).map(({ label, value }) => (
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
          const pct   = Math.round((d.dau / max) * 100);
          const isHov = hovered === d.et_date;
          return (
            <div
              key={d.et_date}
              onMouseEnter={() => setHovered(d.et_date)}
              onMouseLeave={() => setHovered(null)}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", cursor: "default",
                height: "100%", justifyContent: "flex-end",
              }}
            >
              <div style={{
                width: "100%",
                height: pct === 0 ? 3 : `${Math.max(pct, 4)}%`,
                background: isHov ? "#1565c0" : pct > 60 ? "#42a5f5" : "#90caf9",
                borderRadius: "3px 3px 0 0",
                transition: "background 0.1s",
              }} />
            </div>
          );
        })}
      </div>

      {/* X-axis */}
      <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {pageAsc.map((d) => (
          <div key={d.et_date} style={{
            flex: 1, textAlign: "center", fontSize: 9,
            color: hovered === d.et_date ? "#1565c0" : "#bbb",
            fontWeight: hovered === d.et_date ? 700 : 400,
            overflow: "hidden", whiteSpace: "nowrap",
          }}>
            {fmtDate(d.et_date, { month: "numeric", day: "numeric" })}
          </div>
        ))}
      </div>
    </div>
  );
}

function NavBtn({ dir, disabled, onClick }: { dir: "‹" | "›"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none", border: "1px solid",
        borderColor: disabled ? "#eee" : "#ddd",
        borderRadius: 4, width: 24, height: 24,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#ccc" : "#555",
        fontSize: 14, padding: 0,
      }}
    >
      {dir}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FIVE_MIN_MS      = 5 * 60 * 1000;
const SUMMARY_INTERVAL = 30 * 1000;

export function ActivityStats() {
  // Stable reference — recreating the client on every render would break
  // useCallback deps and cause infinite fetch loops.
  const supabase = useMemo(() => createClient(), []);

  const [summary,        setSummary]        = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // Tracks whether we've received at least one successful response.
  // Subsequent auto-refreshes update data silently without re-showing the skeleton.
  const summaryHasData = useRef(false);

  const [chartDays,    setChartDays]    = useState<ChartDay[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const chartFetchedAt = useRef<number>(0);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    if (!summaryHasData.current) setSummaryLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_analytics_summary");
      if (!error && Array.isArray(data) && data.length > 0) {
        const r = data[0];
        setSummary({
          dau_app_opens:    Number(r.dau_app_opens    ?? 0),
          dau_posts:        Number(r.dau_posts        ?? 0),
          dau_comments:     Number(r.dau_comments     ?? 0),
          dau_communities:  Number(r.dau_communities  ?? 0),
          wau_app_opens:    Number(r.wau_app_opens    ?? 0),
          wau_posts:        Number(r.wau_posts        ?? 0),
          wau_comments:     Number(r.wau_comments     ?? 0),
          wau_communities:  Number(r.wau_communities  ?? 0),
          mau_app_opens:    Number(r.mau_app_opens    ?? 0),
          mau_posts:        Number(r.mau_posts        ?? 0),
          mau_comments:     Number(r.mau_comments     ?? 0),
          mau_communities:  Number(r.mau_communities  ?? 0),
        });
        summaryHasData.current = true;
        setLastRefreshed(new Date());
      }
    } catch { /* non-fatal */ }
    finally { setSummaryLoading(false); }
  }, [supabase]);

  const fetchChart = useCallback(async () => {
    if (Date.now() - chartFetchedAt.current < FIVE_MIN_MS) return;
    setChartLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("get_daily_stats_chart", { p_days: 90 });
      if (!error && data) {
        setChartDays(data as ChartDay[]);
        chartFetchedAt.current = Date.now();
      }
    } catch { /* non-fatal */ }
    finally { setChartLoading(false); }
  }, [supabase]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSummary();
    fetchChart();
  }, [fetchSummary, fetchChart]);

  // Auto-refresh the summary every 30s so DAU stays live throughout the day.
  useEffect(() => {
    const id = setInterval(fetchSummary, SUMMARY_INTERVAL);
    return () => clearInterval(id);
  }, [fetchSummary]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const refreshAll = () => {
    chartFetchedAt.current = 0;
    fetchSummary();
    fetchChart();
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

      <div style={{
        background: "#fff", borderRadius: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        padding: 20, display: "flex", flexDirection: "column", gap: 24,
      }}>
        <AnalyticsTable summary={summary} loading={summaryLoading} />

        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
          <BarChart allDays={chartDays} loading={chartLoading} />
        </div>
      </div>
    </section>
  );
}
