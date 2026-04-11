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

    // 4. Text Moderation: Context-aware name drops & sexual content
    const textToModerate = content.trim();

    // 4a. Hard safety checks (illegal/severe harm) using OpenAI Moderation API
    const moderation = await openai.moderations.create({ input: textToModerate });
    const modResults = moderation.results?.[0];

    if (modResults) {
      if (
        modResults.categories["sexual/minors"] ||
        modResults.categories["self-harm/intent"] ||
        modResults.categories["self-harm/instructions"] ||
        modResults.categories["violence/graphic"]
      ) {
        throw new Error("Comment violates severe safety guidelines (harm, minors, graphic violence)");
      }
    }

    // 4b. Smart Contextual Moderation using GPT-4o-mini
    const systemPrompt = `You are an AI moderator for an anonymous social app for Nazarbayev University students. 
Analyze the user's text. The text may be in English, Russian, Kazakh, or Latin-transliterated Russian/Kazakh (e.g., "krasavchik", "zhasap", "pizdec").

Evaluate for two violations:
1. private_name: true if the text explicitly names an everyday, private student or individual. 
   - FALSE if it's a public figure, celebrity, athlete, actor (e.g., "Erkebulan Toktar"), influencer, or politician.
   - FALSE for generic titles ("the dean", "my professor", "admin").
   - FALSE if the context implies a public event, media, or internet drama. If unsure, err on the side of allowing (default to false).
2. explicit_sexual: true ONLY if the text is highly graphic, pornographic, erotica, or describes sexual violence/non-consensual acts. 
   - FALSE for normal discussions about relationships, sex, anatomy, or casual sexual slang (e.g., "fingering", "hooking up") used in a conversational, joking, or educational context.

Output JSON ONLY: {"private_name": boolean, "explicit_sexual": boolean}`;

    const contextCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textToModerate.slice(0, 2000) }
      ],
      response_format: { type: "json_object" },
      max_tokens: 50,
    });

    const aiResponseText = contextCheck.choices[0]?.message?.content || "{}";
    let aiResponse: { private_name?: boolean; explicit_sexual?: boolean } = {};

    try {
      aiResponse = JSON.parse(aiResponseText);
    } catch (e) {
      console.error("Failed to parse moderation JSON:", e);
    }

    if (aiResponse.explicit_sexual) {
      throw new Error("Comment contains sexually explicit content");
    }
    if (aiResponse.private_name) {
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
        const { data: notificationRow, error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: postData.user_id,
            type: "comment_reply",
            related_post_id: post_id,
            related_comment_id: data?.id, // Optional, for future use
            message: "Your post received a new comment.",
            is_read: false,
          })
          .select("id")
          .single();

        if (notificationError) {
          console.error("Error creating comment notification:", notificationError);
          // Don't throw; fail gracefully so comment creation isn't prevented
        } else if (notificationRow?.id) {
          try {
            const { error: pushInvokeError } = await supabase.functions.invoke(
              "send-push-notification",
              {
                body: {
                  userId: postData.user_id,
                  title: "New Comment",
                  body: "Someone commented on your post.",
                  data: {
                    type: "comment_reply",
                    relatedPostId: post_id,
                    notificationId: notificationRow.id,
                    route: `/post/${post_id}`,
                  },
                },
              },
            );
            if (pushInvokeError) {
              console.error(
                "send-push-notification invoke failed:",
                pushInvokeError,
              );
            }
          } catch (pushErr) {
            console.error("send-push-notification invoke threw:", pushErr);
          }
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
