// Supabase Edge Function - Community creation (validation + rate limit)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "../_shared/rateLimit.ts";
import {
  COMMUNITY_NAME_MIN_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
} from "../_shared/validationConstants.ts";

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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use caller's JWT so the existing DB triggers (set_community_university_id,
    // rate_limit_community_create, add_creator_as_member) all receive the correct
    // auth.uid() and run under the caller's RLS context.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limit: 3 communities per hour per user (matches DB trigger limit)
    const allowed = await checkRateLimit(
      `community:create:${user.id}`,
      3,
      3600,
    );
    if (!allowed) {
      return rateLimitExceededResponse(corsHeaders, 3600);
    }

    const body = await req.json().catch(() => ({}));
    const name: string = (body?.name ?? "").trim();
    const description: string = (body?.description ?? "").trim() || "";
    const avatar_url: string | null = body?.avatar_url ?? null;

    // Input validation
    if (name.length < COMMUNITY_NAME_MIN_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Community name must be at least ${COMMUNITY_NAME_MIN_LENGTH} characters.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (name.length > COMMUNITY_NAME_MAX_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Community name must be at most ${COMMUNITY_NAME_MAX_LENGTH} characters.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (description.length > COMMUNITY_DESCRIPTION_MAX_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Description must be at most ${COMMUNITY_DESCRIPTION_MAX_LENGTH} characters.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert via caller's JWT so the BEFORE INSERT triggers run with auth.uid()
    const { data, error: insertError } = await supabase
      .from("communities")
      .insert({
        name,
        description: description || null,
        avatar_url,
        created_by: user.id,
        // university_id is filled by the set_community_university_id trigger
      } as any)
      .select("id, name, description, avatar_url, university_id, created_by, created_at")
      .single();

    if (insertError) {
      if (insertError.message?.includes("duplicate key")) {
        return new Response(
          JSON.stringify({ error: "A community with this name already exists at your university." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (insertError.message?.includes("rate limit")) {
        return new Response(
          JSON.stringify({ error: "You're creating communities too quickly. Please wait before trying again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw insertError;
    }

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-community:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
