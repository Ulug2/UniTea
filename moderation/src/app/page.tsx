"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  // Stable reference — recreating the client on every render spins up a new
  // GoTrueClient competing for the same localStorage-backed auth lock.
  // Mirrors dashboard/page.tsx's useMemo'd client for the same reason.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    });
  }, [router, supabase]);

  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      Loading…
    </div>
  );
}
