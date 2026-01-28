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
      image_url,
      post_type,
      is_anonymous,
      location,
      category,
      reposted_from_post_id,
    } = await req.json();

    // 3. Text Moderation (if content exists)
    if (content && content.trim()) {
      const moderation = await openai.moderations.create({
        input: content.trim(),
      });

      if (moderation.results[0].flagged) {
        throw new Error("Post violates community guidelines");
      }
    }

    // 4. Image Moderation (if image_url is present)
    if (image_url) {
      try {
        // Generate a signed URL for OpenAI to access the image
        // Valid for 5 minutes (enough time for OpenAI to process)
        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage.from("post-images").createSignedUrl(image_url, 300);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error("Error creating signed URL:", signedUrlError);
          throw new Error("Failed to process image");
        }

        // Use GPT-4o-mini for image moderation
        const imageModerationResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Is this image appropriate for a safe community app? If it contains nudity, violence, hate symbols, or any inappropriate content, reply only NO. Otherwise reply only YES.",
                },
                {
                  type: "image_url",
                  image_url: { url: signedUrlData.signedUrl },
                },
              ],
            },
          ],
          max_tokens: 10, // Limit response to YES/NO
        });

        const answer = imageModerationResponse.choices[0]?.message?.content
          ?.trim()
          .toUpperCase();

        if (!answer || answer.includes("NO")) {
          throw new Error("Image violates community guidelines");
        }
      } catch (error: any) {
        // If it's already our custom error, re-throw it
        if (error.message?.includes("violates community guidelines")) {
          throw error;
        }
        // Otherwise, log and throw a generic error
        console.error("Image moderation error:", error);
        throw new Error("Failed to verify image. Please try again.");
      }
    }

    // 5. Prepare post data for database insertion
    const postData: any = {
      user_id: user.id,
      content: content?.trim() || "",
      post_type: post_type || "feed",
      image_url: image_url || null,
      is_anonymous: is_anonymous ?? false,
    };

    // Add optional fields if they exist
    if (location) {
      postData.location = location.trim();
    }
    if (category) {
      postData.category = category;
    }
    if (reposted_from_post_id) {
      postData.reposted_from_post_id = reposted_from_post_id;
    }

    // 6. Insert into database
    const { data, error: dbError } = await supabase
      .from("posts")
      .insert(postData)
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
    console.error("Error in create-post function:", error);

    // Return error response
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create post",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
