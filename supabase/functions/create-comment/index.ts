// Supabase Edge Function - Runs on Deno runtime
// This file is excluded from TypeScript checking (see tsconfig.json)
// All imports and Deno APIs are valid in the Edge Functions runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const SEXUAL_TEXT_BLOCK_THRESHOLD = 0.65;

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

    // 4. Text Moderation: sexual content + likely NU student name-drop checks
    const moderation = await openai.moderations.create({
      input: content.trim(),
    });

    const sexualScore = Number(moderation.results?.[0]?.category_scores?.sexual ?? 0);
    if (sexualScore >= SEXUAL_TEXT_BLOCK_THRESHOLD) {
      throw new Error("Comment contains sexually explicit content");
    }

    const studentNameCheckPrompt = `You are a moderation AI for an anonymous social app for students at Nazarbayev University.

Your ONLY job is to detect if a specific, everyday student is being namedropped.

DO NOT FLAG curse words, swear words, hate speech, offensive language, or general complaints (e.g., "the dean", "my professor", "admin"). These are explicitly ALLOWED.

DO NOT FLAG the names of famous people, celebrities, politicians, or global public figures.

ONLY flag (reply YES) if the text mentions the specific first and/or last name of what appears to be a regular university student.

Otherwise, reply NO.

Reply ONLY with YES or NO.

Text: "${content.trim().slice(0, 2000)}"`;
    const studentNameCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: studentNameCheckPrompt }],
      max_tokens: 10,
    });
    const studentNameAnswer = studentNameCheck.choices[0]?.message?.content
      ?.trim()
      .toUpperCase();
    if (studentNameAnswer?.includes("YES")) {
      throw new Error("Comment mentions a likely private student name");
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

    // 6a. Create notification for post author (gracefully fail if notification insert fails)
    try {
      // Query the posts table to get the post author's user_id
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", post_id)
        .maybeSingle();

      if (postError) {
        console.error("Error fetching post author:", postError);
        // Don't throw; fail gracefully so comment creation isn't prevented
      } else if (postData && postData.user_id !== user.id) {
        // Only notify if comment author is NOT the post author
        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: postData.user_id,
            type: "comment_reply",
            related_post_id: post_id,
            related_comment_id: data?.id, // Optional, for future use
            message: "Your post received a new comment.",
            is_read: false,
          });

        if (notificationError) {
          console.error("Error creating comment notification:", notificationError);
          // Don't throw; fail gracefully so comment creation isn't prevented
        }
      }
    } catch (notificationError: any) {
      // Catch all errors from notification logic and log but don't break comment creation
      console.error("Unexpected error in notification logic:", notificationError);
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
