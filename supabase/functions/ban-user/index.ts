// Supabase Edge Function - Admins can ban users (10 days, 1 month, 1 year, permanent)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app", "http://localhost:3000", "https://moderation-unitee.vercel.app"];

const DURATIONS = {
  "10_days": 10 * 24 * 60 * 60 * 1000,
  "1_month": 30 * 24 * 60 * 60 * 1000,
  "1_year": 365 * 24 * 60 * 60 * 1000,
} as const;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use caller JWT only for identity verification; all DB reads use service role
    // so the admin check cannot be influenced by RLS policies on profiles.
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("ban-user: SUPABASE_SERVICE_ROLE_KEY not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Admin check via service role — bypasses RLS so the result is always
    // the true DB value regardless of any RLS policy on profiles. Also
    // loads the caller's own university_id here — this function uses
    // service-role access throughout, so RLS cannot be the authorization
    // boundary; university scoping must be enforced explicitly below.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, university_id")
      .eq("id", user.id)
      .single();

    if (profile?.is_admin !== true) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only admins can ban users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const target_user_id = body?.user_id;
    const duration = body?.duration; // "10_days" | "1_month" | "1_year" | "permanent"

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (target_user_id === user.id) {
      return new Response(
        JSON.stringify({ error: "You cannot ban yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validDurations = ["10_days", "1_month", "1_year", "permanent"];
    if (!validDurations.includes(duration)) {
      return new Response(
        JSON.stringify({ error: "duration must be one of: 10_days, 1_month, 1_year, permanent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, university_id")
      .eq("id", target_user_id)
      .single();

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent admin lock-out: no admin may ban another admin account.
    if (targetProfile.is_admin === true) {
      return new Response(
        JSON.stringify({ error: "Cannot ban another admin account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // University isolation: is_admin === true is necessary but not
    // sufficient — an admin may only ban users belonging to their own
    // university. Never trust a client-supplied university; both sides
    // of this comparison come from the caller's and target's own DB
    // profile rows, loaded above via service role.
    if (
      !profile.university_id ||
      !targetProfile.university_id ||
      profile.university_id !== targetProfile.university_id
    ) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admins can only ban users from their own university" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isPermanent = duration === "permanent";
    let banned_until: string | null = null;
    if (!isPermanent && DURATIONS[duration as keyof typeof DURATIONS]) {
      const ms = DURATIONS[duration as keyof typeof DURATIONS];
      const d = new Date(Date.now() + ms);
      banned_until = d.toISOString();
    }

    const update: Record<string, unknown> = {
      is_banned: true,
      is_permanently_banned: isPermanent,
      banned_until: isPermanent ? null : banned_until,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", target_user_id);

    if (updateError) {
      console.error("ban-user update error:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log
    const { error: logError } = await supabaseAdmin
      .from("admin_action_logs")
      .insert({
        admin_id: user.id,
        action: "ban",
        target_user_id,
        metadata: {
          duration,
          banned_until: update.banned_until ?? null,
          is_permanently_banned: isPermanent,
        },
      });
    if (logError) console.error("ban-user: failed to insert audit log:", logError);

    return new Response(
      JSON.stringify({
        success: true,
        banned_until: update.banned_until ?? null,
        is_permanently_banned: isPermanent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ban-user:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
