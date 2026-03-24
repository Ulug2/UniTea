// Supabase Edge Function - Runs on Deno runtime
// This file is excluded from TypeScript checking (see tsconfig.json)
// All imports and Deno APIs are valid in the Edge Functions runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const MAX_POLL_OPTIONS = 11;
const MAX_POST_IMAGES = 5;
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
      title,
      image_url,
      image_urls,
      post_type,
      is_anonymous,
      location,
      category,
      reposted_from_post_id,
      // Optional poll fields (feed posts only)
      poll_options,
      poll_expires_at,
      poll_allow_multiple,
    } = await req.json();

    // 3. Text Moderation (if content exists): sexual content + likely NU student name-drop checks
    // Combine title + content for a single moderation pass when both are present
    const textToModerate = [title?.trim(), content?.trim()].filter(Boolean).join(" ");
    if (textToModerate) {
      const moderation = await openai.moderations.create({
        input: textToModerate,
      });

      const sexualScore = Number(moderation.results?.[0]?.category_scores?.sexual ?? 0);
      if (sexualScore >= SEXUAL_TEXT_BLOCK_THRESHOLD) {
        throw new Error("Post contains sexually explicit content");
      }

      const studentNameCheckPrompt = `You are a moderation AI for an anonymous social app for students at Nazarbayev University.

Your ONLY job is to detect if a specific, everyday student is being namedropped.

DO NOT FLAG curse words, swear words, hate speech, offensive language, or general complaints (e.g., "the dean", "my professor", "admin"). These are explicitly ALLOWED.

DO NOT FLAG the names of famous people, celebrities, politicians, or global public figures.

ONLY flag (reply YES) if the text mentions the specific first and/or last name of what appears to be a regular university student.

Otherwise, reply NO.

Reply ONLY with YES or NO.

Text: "${textToModerate.slice(0, 2000)}"`;
      const studentNameCheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: studentNameCheckPrompt }],
        max_tokens: 10,
      });
      const studentNameAnswer = studentNameCheck.choices[0]?.message?.content
        ?.trim()
        .toUpperCase();
      if (studentNameAnswer?.includes("YES")) {
        throw new Error("Post mentions a likely private student name");
      }
    }

    const normalizedImageUrls = Array.from(
      new Set(
        [
          ...(Array.isArray(image_urls) ? image_urls : []),
          ...(image_url ? [image_url] : []),
        ]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    ).slice(0, MAX_POST_IMAGES);

    if (
      Array.isArray(image_urls) &&
      image_urls.filter((value) => typeof value === "string" && value.trim().length > 0).length >
        MAX_POST_IMAGES
    ) {
      throw new Error(`You can upload up to ${MAX_POST_IMAGES} images per post`);
    }

    // 4. Image Moderation (if image_urls are present)
    if (normalizedImageUrls.length > 0) {
      try {
        for (const currentImageUrl of normalizedImageUrls) {
          // Generate a signed URL for OpenAI to access the image
          // Valid for 5 minutes (enough time for OpenAI to process)
          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage.from("post-images").createSignedUrl(currentImageUrl, 300);

          if (signedUrlError || !signedUrlData?.signedUrl) {
            console.error("Error creating signed URL:", signedUrlError);
            throw new Error("Failed to process image");
          }

          // Use GPT-4o-mini for image moderation (sexual content only)
          const imageModerationResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      "Does this image contain pornographic or sexually explicit visual content (including explicit nudity or sexual acts)? Ignore any visible text, profanity, offensive language, violence, hate symbols, or general edginess. Reply only NO if it is pornographic/sexually explicit. Otherwise reply only YES.",
                  },
                  {
                    type: "image_url",
                    image_url: { url: signedUrlData.signedUrl },
                  },
                ],
              },
            ],
            max_tokens: 10,
          });

          const answer = imageModerationResponse.choices[0]?.message?.content
            ?.trim()
            .toUpperCase();

          if (!answer || answer.includes("NO")) {
            throw new Error("Image violates community guidelines");
          }
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
      image_url: normalizedImageUrls[0] || null,
      image_urls: normalizedImageUrls.length > 0 ? normalizedImageUrls : null,
      is_anonymous: is_anonymous ?? false,
    };

    // Add optional fields if they exist
    if (title) {
      postData.title = title.trim();
    }
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

    // 7. If this is a feed post with poll options, create poll + options
    if (
      postData.post_type === "feed" &&
      Array.isArray(poll_options) &&
      poll_options.length >= 2
    ) {
      // Filter and normalize options (trim, drop empties, de-duplicate)
      const normalizedOptions = Array.from(
        new Set(
          poll_options
            .map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
            .filter((o) => o.length > 0)
        )
      );

      if (normalizedOptions.length > MAX_POLL_OPTIONS) {
        throw new Error(`You can add up to ${MAX_POLL_OPTIONS} poll options`);
      }

      if (normalizedOptions.length >= 2) {
        // Create poll row
        const { data: poll, error: pollError } = await supabase
          .from("polls")
          .insert({
            post_id: data.id,
            expires_at: poll_expires_at ?? null,
            allow_multiple: poll_allow_multiple ?? false,
          })
          .select()
          .single();

        if (pollError) {
          console.error("Poll create error:", pollError);
          // Do not fail the whole post creation; just log.
        } else {
          // Create poll options
          const pollOptionsPayload = normalizedOptions.map((optionText, idx) => ({
            poll_id: poll.id,
            option_text: optionText,
            position: idx,
          }));

          const { error: optionsError } = await supabase
            .from("poll_options")
            .insert(pollOptionsPayload);

          if (optionsError) {
            console.error("Poll options create error:", optionsError);
            // Again, do not fail the post; worst case the poll is incomplete.
          }
        }
      }
    }

    // 8. Return success response
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
