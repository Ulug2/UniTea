// Supabase Edge Function - Runs on Deno runtime
// Admin-only: deletes all matchmaking data and resets phase to 'inactive'.
// Use for yearly resets or clearing test data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is authenticated and admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc("get_my_is_admin");
  if (adminError || !isAdmin) {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin only" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Use service role for the actual deletions (bypasses RLS)
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Delete in FK-safe order: windows → matches → profiles, then reset config
    const [windowsRes, matchesRes, profilesRes] = await Promise.all([
      admin.from("launch_event_message_windows").delete().neq("user_id", "00000000-0000-0000-0000-000000000000"),
      admin.from("launch_event_matches").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      admin.from("launch_event_profiles").delete().neq("user_id", "00000000-0000-0000-0000-000000000000"),
    ]);

    if (windowsRes.error) throw new Error(`Windows delete failed: ${windowsRes.error.message}`);
    if (matchesRes.error) throw new Error(`Matches delete failed: ${matchesRes.error.message}`);
    if (profilesRes.error) throw new Error(`Profiles delete failed: ${profilesRes.error.message}`);

    const { error: phaseError } = await admin
      .from("launch_event_config")
      .update({ phase: "inactive" })
      .eq("id", 1);

    if (phaseError) throw new Error(`Phase reset failed: ${phaseError.message}`);

    return new Response(
      JSON.stringify({ ok: true, message: "Matchmaking data cleared and phase reset to inactive." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
