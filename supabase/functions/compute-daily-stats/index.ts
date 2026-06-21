import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Default to yesterday UTC; allow override via body for manual backfills.
    let targetDate: string | null = null;
    try {
      const body = await req.json();
      targetDate = body?.target_date ?? null;
    } catch {
      // no body — use yesterday
    }

    if (!targetDate) {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      targetDate = yesterday.toISOString().split("T")[0];
    }

    const { data, error } = await supabase.rpc("compute_daily_stats", {
      target_date: targetDate,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// Schedule: 5 0 * * * (00:05 UTC daily)
// Set up in Supabase Dashboard → Edge Functions → compute-daily-stats → Schedule
