// Supabase Edge Function - Admin or post owner can delete a post
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const post_id = body?.post_id;
    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    const { data: post } = await supabase
      .from("posts")
      .select("user_id")
      .eq("id", post_id)
      .single();

    if (!post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isOwner = post.user_id === user.id;
    const isAdmin = profile?.is_admin === true;
    if (!isOwner && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only the post author or an admin can delete this post" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS (we already verified owner or admin above)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("delete-post: SUPABASE_SERVICE_ROLE_KEY not set");
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

    const { error: deleteError } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", post_id);

    if (deleteError) {
      console.error("delete-post error:", deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log (only log admin-initiated removals, not owner self-deletes)
    if (isAdmin) {
      const { error: logError } = await supabaseAdmin
        .from("admin_action_logs")
        .insert({
          admin_id: user.id,
          action: "delete_post",
          target_user_id: post.user_id,
          target_post_id: post_id,
          metadata: { deleted_by_owner: isOwner },
        });
      if (logError) console.error("delete-post: failed to insert audit log:", logError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-post:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
