"use client";

import { useState, useRef, ReactNode } from "react";

type CollapsibleSectionProps<T> = {
  title: string;
  items: T[];
  defaultCount?: number;
  /**
   * For simple card-style lists: renders each item in a div container.
   * Either renderItem OR renderList must be provided (not both).
   */
  renderItem?: (item: T, index: number) => ReactNode;
  /**
   * For tables or custom containers: receives the sliced visible items and
   * returns the full container (e.g. <table><thead/><tbody>{items}</tbody></table>).
   * Either renderItem OR renderList must be provided (not both).
   */
  renderList?: (visibleItems: T[]) => ReactNode;
  /** Optional controls (filters, search) rendered above the list. */
  controls?: ReactNode;
  emptyMessage?: string;
};

export function CollapsibleSection<T>({
  title,
  items,
  defaultCount = 5,
  renderItem,
  renderList,
  controls,
  emptyMessage = "No items.",
}: CollapsibleSectionProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const visible = expanded ? items : items.slice(0, defaultCount);
  const hasMore = items.length > defaultCount;

  const handleCollapse = () => {
    setExpanded(false);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const listContent =
    items.length === 0 ? (
      <p style={{ padding: 16, color: "#888", fontSize: 14 }}>{emptyMessage}</p>
    ) : renderList ? (
      renderList(visible)
    ) : (
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        {visible.map((item, i) => renderItem!(item, i))}
      </div>
    );

  return (
    <section style={{ marginBottom: 32 }} ref={sectionRef}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: hasMore || controls ? 12 : 16,
        }}
      >
        <h2 style={{ fontSize: 18 }}>{title}</h2>
        {hasMore && (
          <span style={{ fontSize: 12, color: "#888" }}>
            {expanded
              ? `Showing all ${items.length}`
              : `Showing ${Math.min(defaultCount, items.length)} of ${items.length}`}
          </span>
        )}
      </div>

      {controls && <div style={{ marginBottom: 12 }}>{controls}</div>}

      {listContent}

      {hasMore && (
        <div style={{ marginTop: 8, paddingLeft: 4 }}>
          {expanded ? (
            <button
              type="button"
              onClick={handleCollapse}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Show less
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: "none",
                border: "none",
                color: "#1565c0",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                fontWeight: 500,
              }}
            >
              Show all {items.length}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
