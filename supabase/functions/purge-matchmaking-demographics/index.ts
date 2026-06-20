// Supabase Edge Function - Runs on Deno runtime
// Admin-only: erases display_name and major from launch_event_profiles post-event.
// Answers and match pairings are preserved for analytics.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Auth — must be an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("get_my_is_admin");
    if (adminCheckError || !isAdmin) throw new Error("Admin access required");

    // 2. Confirm the event is in 'revealed' phase before purging
    const { data: config, error: configError } = await callerClient
      .from("launch_event_config")
      .select("phase")
      .single();

    if (configError) throw configError;
    if (config.phase !== "revealed") {
      throw new Error(
        `Purge is only allowed when phase is 'revealed'. Current phase: ${config.phase}`,
      );
    }

    // 3. Purge using service role (bypasses RLS UPDATE restriction for regular users)
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: purged, error: purgeError } = await adminClient
      .from("launch_event_profiles")
      .update({
        display_name: "[removed]",
        major: "[removed]",
        demographics_purged_at: new Date().toISOString(),
      })
      .is("demographics_purged_at", null) // only rows not already purged
      .select("id");

    if (purgeError) throw purgeError;

    const count = purged?.length ?? 0;

    return new Response(
      JSON.stringify({ purged: count, message: `${count} profile(s) purged.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("purge-matchmaking-demographics error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
