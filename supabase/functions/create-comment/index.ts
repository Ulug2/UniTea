// Supabase Edge Function - Runs on Deno runtime
// This file is excluded from TypeScript checking (see tsconfig.json)
// All imports and Deno APIs are valid in the Edge Functions runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
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

    // 4. Text Moderation
    const moderation = await openai.moderations.create({
      input: content.trim(),
    });

    if (moderation.results[0].flagged) {
      throw new Error("Comment violates community guidelines");
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
