// Supabase Edge Function - Admin or comment owner can delete a comment
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://unitea.app", "https://www.unitea.app"];

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

    const body = await req.json().catch(() => ({}));
    const comment_id = body?.comment_id;
    if (!comment_id) {
      return new Response(
        JSON.stringify({ error: "comment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for all DB reads so admin/comment lookups bypass RLS entirely.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("delete-comment: SUPABASE_SERVICE_ROLE_KEY not set");
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

    // Loads the caller's own university_id here too — this function uses
    // service-role access throughout, so RLS cannot be the authorization
    // boundary; university scoping must be enforced explicitly below.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, university_id")
      .eq("id", user.id)
      .single();

    const { data: comment } = await supabaseAdmin
      .from("comments")
      .select("user_id, post_id")
      .eq("id", comment_id)
      .single();

    if (!comment) {
      return new Response(
        JSON.stringify({ error: "Comment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isOwner = comment.user_id === user.id;
    const isAdmin = profile?.is_admin === true;
    if (!isOwner && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: only the comment author or an admin can delete this comment" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // University isolation: is_admin === true is necessary but not
    // sufficient for the admin path — an admin may only delete comments
    // whose parent post belongs to their own university. Does not apply to
    // the owner path above. Comments have no university_id of their own,
    // so it's resolved via comment.post_id -> posts.university_id. If the
    // parent post can't be resolved, fail closed (deny) rather than
    // falling back to unrestricted admin access.
    if (!isOwner && isAdmin) {
      const { data: parentPost } = await supabaseAdmin
        .from("posts")
        .select("university_id")
        .eq("id", comment.post_id)
        .single();

      if (
        !profile?.university_id ||
        !parentPost?.university_id ||
        profile.university_id !== parentPost.university_id
      ) {
        return new Response(
          JSON.stringify({ error: "Forbidden: admins can only delete comments from posts in their own university" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("comments")
      .delete()
      .eq("id", comment_id);

    if (deleteError) {
      console.error("delete-comment error:", deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Audit log (only log admin-initiated removals, not owner self-deletes —
    // same convention as delete-post).
    if (isAdmin && !isOwner) {
      const { error: logError } = await supabaseAdmin
        .from("admin_action_logs")
        .insert({
          admin_id: user.id,
          action: "delete_comment",
          target_user_id: comment.user_id,
          target_post_id: comment.post_id,
          metadata: { comment_id },
        });
      if (logError) console.error("delete-comment: failed to insert audit log:", logError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-comment:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
