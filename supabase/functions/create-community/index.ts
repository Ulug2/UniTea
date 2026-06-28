// Supabase Edge Function - Community creation with AI content moderation
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";
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

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

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

    // AI content moderation on name + description
    const textToModerate = description
      ? `Community name: ${name}\nDescription: ${description}`
      : `Community name: ${name}`;

    const moderation = await openai.moderations.create({ input: textToModerate });
    const modResults = moderation.results?.[0];
    if (
      modResults?.categories["sexual/minors"] ||
      modResults?.categories["self-harm/intent"] ||
      modResults?.categories["self-harm/instructions"] ||
      modResults?.categories["violence/graphic"] ||
      modResults?.flagged
    ) {
      return new Response(
        JSON.stringify({ error: "Community name or description violates content guidelines." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contextCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AI moderator for a university social app. Evaluate the proposed community name and description.
Reject if:
1. private_name: true — explicitly names a private individual (not a public figure, celebrity, or generic role like "professors")
2. explicit_sexual: true — contains highly graphic or pornographic content
3. impersonation: true — impersonates an official university body (e.g. "NU Administration Official", "Dean's Office")
Output JSON ONLY: {"private_name": boolean, "explicit_sexual": boolean, "impersonation": boolean}`,
        },
        { role: "user", content: textToModerate.slice(0, 500) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 60,
    });

    let aiResponse: { private_name?: boolean; explicit_sexual?: boolean; impersonation?: boolean } = {};
    try {
      aiResponse = JSON.parse(contextCheck.choices[0]?.message?.content ?? "{}");
    } catch {
      // parse failure — allow through; false positive rejection is worse
    }

    if (aiResponse.explicit_sexual) {
      return new Response(
        JSON.stringify({ error: "Community name or description contains sexually explicit content." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResponse.private_name) {
      return new Response(
        JSON.stringify({ error: "Community name mentions a private individual." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResponse.impersonation) {
      return new Response(
        JSON.stringify({ error: "Community name appears to impersonate an official university body." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
