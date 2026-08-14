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

  // University isolation: this function uses service-role access throughout,
  // so RLS cannot be the authorization boundary — the caller's own
  // university must be resolved server-side and every delete scoped to it.
  // Never trust a client-supplied university. Fail closed if unresolvable.
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("university_id")
    .eq("id", user.id)
    .single();

  const callerUniversityId = callerProfile?.university_id;
  if (!callerUniversityId) {
    return new Response(
      JSON.stringify({ error: "Forbidden: caller has no resolvable university" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // launch_event_message_windows has no university_id of its own, so its
    // rows are resolved through the profiles that belong to this university.
    const { data: universityProfiles, error: universityProfilesError } = await admin
      .from("launch_event_profiles")
      .select("user_id")
      .eq("university_id", callerUniversityId);

    if (universityProfilesError) {
      throw new Error(`Profile lookup failed: ${universityProfilesError.message}`);
    }

    const universityUserIds = (universityProfiles ?? []).map((p) => p.user_id);

    // Delete in FK-safe order: windows → matches → profiles, then reset config
    if (universityUserIds.length > 0) {
      const { error: windowsError } = await admin
        .from("launch_event_message_windows")
        .delete()
        .in("user_id", universityUserIds);
      if (windowsError) throw new Error(`Windows delete failed: ${windowsError.message}`);
    }

    const { error: matchesError } = await admin
      .from("launch_event_matches")
      .delete()
      .eq("university_id", callerUniversityId);
    if (matchesError) throw new Error(`Matches delete failed: ${matchesError.message}`);

    const { error: profilesError } = await admin
      .from("launch_event_profiles")
      .delete()
      .eq("university_id", callerUniversityId);
    if (profilesError) throw new Error(`Profiles delete failed: ${profilesError.message}`);

    const { error: phaseError } = await admin
      .from("launch_event_config")
      .update({ phase: "inactive" })
      .eq("university_id", callerUniversityId);

    if (phaseError) throw new Error(`Phase reset failed: ${phaseError.message}`);

    // Audit log
    const { error: logError } = await admin
      .from("admin_action_logs")
      .insert({
        admin_id: user.id,
        action: "reset_matchmaking",
        metadata: { university_id: callerUniversityId },
      });
    if (logError) console.error("reset-matchmaking: failed to insert audit log:", logError);

    return new Response(
      JSON.stringify({ ok: true, message: "Matchmaking data cleared and phase reset to inactive for your university." }),
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
