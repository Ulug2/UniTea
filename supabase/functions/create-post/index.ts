// Supabase Edge Function - Runs on Deno runtime
// This file is excluded from TypeScript checking (see tsconfig.json)
// All imports and Deno APIs are valid in the Edge Functions runtime

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";
import {
  POST_BODY_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "../_shared/validationConstants.ts";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "../_shared/rateLimit.ts";

// 5 posts per 10 minutes per user
const POST_RATE_LIMIT_MAX = 5;
const POST_RATE_LIMIT_WINDOW_SECONDS = 600;

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const MAX_POLL_OPTIONS = 11;
const MAX_POST_IMAGES = 5;

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
      id: clientPostId,
      content,
      title,
      image_url,
      image_urls,
      image_aspect_ratio,
      post_type,
      is_anonymous,
      location,
      category,
      community_id,
      reposted_from_post_id,
      // Optional poll fields (feed posts only)
      poll_options,
      poll_expires_at,
      poll_allow_multiple,
    } = await req.json();

    // Idempotency key (optional, backward-compatible). The client may
    // generate this post's id itself and resend the same value if a prior
    // attempt's response was lost (network drop, timeout, app backgrounded)
    // without knowing whether the server actually created the post. Older
    // clients that omit it fall back to the DB's default id generation,
    // exactly as before.
    let idempotentPostId: string | undefined;
    if (clientPostId !== undefined && clientPostId !== null) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof clientPostId !== "string" || !UUID_RE.test(clientPostId)) {
        return new Response(
          JSON.stringify({ error: "Invalid post id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      idempotentPostId = clientPostId;

      // If a post with this id already exists, this is a retry of an
      // earlier attempt that actually succeeded server-side — return it
      // as-is instead of re-running moderation/rate-limit/insert. Scoped
      // to `user_id` too (on top of RLS) so a colliding id can never
      // return someone else's post.
      const { data: existingPost, error: existingPostError } = await supabase
        .from("posts")
        .select()
        .eq("id", idempotentPostId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingPostError) {
        console.error("Idempotency lookup error:", existingPostError);
      } else if (existingPost) {
        return new Response(JSON.stringify(existingPost), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Rate limit check (before any expensive OpenAI calls). Placed after
    // the idempotency short-circuit above so resubmitting an
    // already-created post never costs part of the user's post quota.
    const allowed = await checkRateLimit(
      `post:${user.id}`,
      POST_RATE_LIMIT_MAX,
      POST_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!allowed) {
      return rateLimitExceededResponse(corsHeaders, POST_RATE_LIMIT_WINDOW_SECONDS);
    }

    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const trimmedContent = typeof content === "string" ? content.trim() : "";

    if (trimmedTitle.length > POST_TITLE_MAX_LENGTH) {
      throw new Error(
        `Title must be at most ${POST_TITLE_MAX_LENGTH} characters.`,
      );
    }
    if (trimmedContent.length > POST_BODY_MAX_LENGTH) {
      throw new Error(
        `Post content must be at most ${POST_BODY_MAX_LENGTH} characters.`,
      );
    }

    // 3. Text Moderation: Context-aware name drops & sexual content
    const textToModerate = [trimmedTitle, trimmedContent].filter(Boolean).join(" ");

    if (textToModerate) {
      // 3a. Hard safety checks (illegal/severe harm) using OpenAI Moderation API
      const moderation = await openai.moderations.create({ input: textToModerate });
      const modResults = moderation.results?.[0];

      if (modResults) {
        if (
          modResults.categories["sexual/minors"] ||
          modResults.categories["self-harm/intent"] ||
          modResults.categories["self-harm/instructions"] ||
          modResults.categories["violence/graphic"]
        ) {
          throw new Error("Post violates severe safety guidelines (harm, minors, graphic violence)");
        }
      }

      // 3b. Smart Contextual Moderation using GPT-4o-mini
      const systemPrompt = `You are an AI moderator for an anonymous social app for university students. 
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
        throw new Error("Post contains sexually explicit content");
      }
      if (aiResponse.private_name) {
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
          if (!currentImageUrl.startsWith(`${user.id}/`)) {
            return new Response(
              JSON.stringify({ error: "Invalid image path" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage.from("post-images").createSignedUrl(currentImageUrl, 300);

          if (signedUrlError || !signedUrlData?.signedUrl) {
            console.error("Error creating signed URL:", signedUrlError);
            throw new Error("Failed to process image");
          }

          const imageModerationResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `You are an AI moderator for an anonymous university social app. Analyze this image carefully. Pay close attention to BOTH the visual imagery AND any text, memes, or screenshots of chats embedded in the image. Text may be in English, Russian, Kazakh, or Latin-transliterated slang.

Evaluate for three violations:
1. visual_explicit: true if the image contains explicit nudity or visual pornography.
2. private_name: true if any text or chat screenshot in the image explicitly exposes the name of an everyday, private student or individual. FALSE for public figures, celebrities, or generic titles.
3. explicit_sexual_text: true ONLY if text in the image describes highly graphic/pornographic sexual acts. FALSE for casual relationship slang or memes.

Output JSON ONLY: {"visual_explicit": boolean, "private_name": boolean, "explicit_sexual_text": boolean}`
                  },
                  {
                    type: "image_url",
                    image_url: { url: signedUrlData.signedUrl },
                  },
                ],
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: 50,
          });

          const aiResponseText = imageModerationResponse.choices[0]?.message?.content || "{}";
          let imgMod: { visual_explicit?: boolean; private_name?: boolean; explicit_sexual_text?: boolean } = {};

          try {
            imgMod = JSON.parse(aiResponseText);
          } catch (e) {
            console.error("Failed to parse image moderation JSON:", e);
          }

          if (imgMod.visual_explicit) {
            throw new Error("Image violates community guidelines (explicit visual content)");
          }
          if (imgMod.explicit_sexual_text) {
            throw new Error("Image contains highly explicit sexual text");
          }
          if (imgMod.private_name) {
            throw new Error("Image exposes a likely private student name");
          }
        }
      } catch (error: any) {
        if (
          error.message?.includes("violates community guidelines") ||
          error.message?.includes("explicit sexual text") ||
          error.message?.includes("private student name")
        ) {
          throw error;
        }
        console.error("Image moderation error:", error);
        throw new Error("Failed to verify image. Please try again.");
      }
    }

    // 5. Prepare post data for database insertion
    const postData: any = {
      user_id: user.id,
      content: trimmedContent,
      post_type: post_type || "feed",
      image_url: normalizedImageUrls[0] || null,
      image_urls: normalizedImageUrls.length > 0 ? normalizedImageUrls : null,
      image_aspect_ratio:
        typeof image_aspect_ratio === "number" && isFinite(image_aspect_ratio)
          ? image_aspect_ratio
          : null,
      is_anonymous: is_anonymous ?? false,
    };
    if (idempotentPostId) {
      postData.id = idempotentPostId;
    }

    // Add optional fields if they exist
    if (trimmedTitle) {
      postData.title = trimmedTitle;
    }
    if (location) {
      postData.location = location.trim();
    }
    if (category) {
      postData.category = category;
    }
    if (community_id) {
      // Membership/university is enforced by the posts INSERT RLS policy.
      postData.community_id = community_id;
    }
    if (reposted_from_post_id) {
      postData.reposted_from_post_id = reposted_from_post_id;
    }

    // 6. Insert into database
    let { data, error: dbError } = await supabase
      .from("posts")
      .insert(postData)
      .select()
      .single();

    if (dbError) {
      // A duplicate-key error on the id we supplied means another request
      // for this same idempotency key already committed the row between
      // the lookup above and this insert (e.g. two retries in flight at
      // once). Treat it the same as that lookup: fetch and return the row
      // that won instead of failing the request.
      if (dbError.code === "23505" && idempotentPostId) {
        const { data: racedPost, error: racedPostError } = await supabase
          .from("posts")
          .select()
          .eq("id", idempotentPostId)
          .single();

        if (!racedPostError && racedPost) {
          return new Response(JSON.stringify(racedPost), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }

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
        // Create poll row. `polls.post_id` is unique (migration
        // 20260801120000), so a retry that already created this post's
        // poll hits a conflict here instead of creating a second poll —
        // fetch the existing one instead of failing.
        let { data: poll, error: pollError } = await supabase
          .from("polls")
          .insert({
            post_id: data.id,
            expires_at: poll_expires_at ?? null,
            allow_multiple: poll_allow_multiple ?? false,
          })
          .select()
          .single();

        if (pollError?.code === "23505") {
          const { data: existingPoll, error: existingPollError } = await supabase
            .from("polls")
            .select()
            .eq("post_id", data.id)
            .single();
          poll = existingPoll;
          pollError = existingPollError;
        }

        if (pollError || !poll) {
          console.error("Poll create error:", pollError);
          // Do not fail the whole post creation; just log.
        } else {
          // Only insert options if this poll doesn't have any yet — covers
          // both a genuinely new poll and a retry where the poll row was
          // created on a prior attempt but the options insert never ran
          // (e.g. that attempt's response was lost right after this step).
          const { count: existingOptionsCount } = await supabase
            .from("poll_options")
            .select("*", { count: "exact", head: true })
            .eq("poll_id", poll.id);

          if (!existingOptionsCount) {
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
