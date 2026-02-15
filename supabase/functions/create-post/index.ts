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
      image_url,
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

    // 3. Text Moderation (if content exists): OpenAI Moderation + curse-word check (EN/RU/KZ)
    if (content && content.trim()) {
      const moderation = await openai.moderations.create({
        input: content.trim(),
      });

      if (moderation.results[0].flagged) {
        throw new Error("Post violates community guidelines");
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
        throw new Error("Post contains language that is not allowed");
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

        // Use GPT-4o-mini for image moderation (content + visible text/curse words)
        const imageModerationResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Is this image appropriate for a safe community app? Does it contain any visible curse words, offensive text (in any alphabet; include Kazakh/Russian in Latin e.g. Kotakbas, Qotaqbas, or obfuscated like pid@ras), nudity, violence, hate symbols, or inappropriate content in any language? If yes to any, reply only NO. Otherwise reply only YES.",
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
