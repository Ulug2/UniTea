// Supabase Edge Function - Runs on Deno runtime
// This file is excluded from TypeScript checking (see tsconfig.json)
// All imports and Deno APIs are valid in the Edge Functions runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Auth Check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // 2. Parse request body
    const {
      content,
      post_id,
      parent_comment_id,
      is_anonymous,
    } = await req.json();

    // 3. Validate required fields
    if (!content || !content.trim()) {
      throw new Error("Comment content is required");
    }

    if (!post_id) {
      throw new Error("Post ID is required");
    }

    // 4. Text Moderation: OpenAI Moderation + curse-word check (EN/RU/KZ)
    const moderation = await openai.moderations.create({
      input: content.trim(),
    });

    if (moderation.results[0].flagged) {
      throw new Error("Comment violates community guidelines");
    }

    // Curse-word check: EN/RU/KZ in any alphabet (incl. Latin transliteration) and obfuscated spellings; allow general complaints without names
    const curseCheckPrompt = `Does this text contain curse words, swear words, offensive language, or hate directed at a specifically named person in English, Russian, or Kazakh?

You MUST flag (reply YES):
- Curse words, swear words, obscenities in ANY alphabet (Cyrillic, Latin, mixed), including Kazakh/Russian in Latin (e.g. Kotakbas, Qotaqbas) and obfuscated spellings (e.g. pid@ras, p1daras).
- Hate or harassment directed at a specifically named person (real name).

Do NOT flag (reply NO):
- General complaints, venting, or "spilling tea" when no specific person is named (e.g. complaining about "the professor", "the director", "administration", "our dean" without naming them). Students may complain about situations or roles; only flag if someone is named and attacked.

Reply only YES or NO.

Text: "${content.trim().slice(0, 2000)}"`;
    const curseCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: curseCheckPrompt }],
      max_tokens: 10,
    });
    const curseAnswer = curseCheck.choices[0]?.message?.content?.trim().toUpperCase();
    if (curseAnswer?.includes("YES")) {
      throw new Error("Comment contains language that is not allowed");
    }

    // 5. Prepare comment data for database insertion
    const commentData: any = {
      user_id: user.id,
      post_id: post_id,
      content: content.trim(),
      is_anonymous: is_anonymous ?? false,
      is_deleted: false,
    };

    // Add parent_comment_id if it's a reply
    if (parent_comment_id) {
      commentData.parent_comment_id = parent_comment_id;
    }

    // 5a. Assign post-specific anonymous ID if needed
    if (commentData.is_anonymous) {
      // 1) See if this user already has an anon id for this post
      const { data: existingIds, error: existingError } = await supabase
        .from("comments")
        .select("post_specific_anon_id")
        .eq("post_id", post_id)
        .eq("user_id", user.id)
        .eq("is_anonymous", true)
        .not("post_specific_anon_id", "is", null)
        .limit(1);

      if (existingError) {
        console.error("Error fetching existing anon id:", existingError);
        throw existingError;
      }

      let anonId: number | null = null;

      if (existingIds && existingIds.length > 0) {
        anonId = existingIds[0].post_specific_anon_id as number;
      } else {
        // 2) Otherwise, assign the next available id for this post
        const { data: maxRows, error: maxError } = await supabase
          .from("comments")
          .select("post_specific_anon_id")
          .eq("post_id", post_id)
          .eq("is_anonymous", true)
          .order("post_specific_anon_id", { ascending: false })
          .limit(1);

        if (maxError) {
          console.error("Error fetching max anon id:", maxError);
          throw maxError;
        }

        const currentMax =
          maxRows && maxRows.length > 0 && maxRows[0].post_specific_anon_id
            ? (maxRows[0].post_specific_anon_id as number)
            : 0;

        anonId = currentMax + 1;
      }

      commentData.post_specific_anon_id = anonId;
    }

    // 6. Insert into database
    const { data, error: dbError } = await supabase
      .from("comments")
      .insert(commentData)
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw dbError;
    }

    // 7. Return success response
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error in create-comment function:", error);

    // Return error response
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create comment",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
