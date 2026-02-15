# Content Moderation (Curse Words & Images)

Moderation blocks curse words and inappropriate content in **English, Russian, and Kazakh** on **posts** and **comments**. Images on posts are checked for inappropriate content and for **visible curse words or offensive text** in the image. Chat messages are **not** moderated.

## Where moderation runs

| Content      | Where                    | Text moderation              | Image moderation                    |
|--------------|--------------------------|-----------------------------|-------------------------------------|
| **Posts**    | `create-post` Edge Function | Yes (OpenAI + curse EN/RU/KZ) | Yes (GPT-4o-mini, incl. text in image) |
| **Comments** | `create-comment` Edge Function | Yes (OpenAI + curse EN/RU/KZ) | N/A (comments are text-only)        |

## How it works

1. **OpenAI Moderation API**  
   Catches harmful content (hate, violence, sexual, etc.). Multilingual.

2. **Curse-word check (EN / RU / KZ)**  
   A second check with GPT-4o-mini that **must** flag:
   - **Kazakh and Russian curse words in Latin** (transliteration), including spelling variants (e.g. Kotakbas, Qotaqbas and similar; different letters for same sound like k/q, o/a).
   - Curse words in **any alphabet**: Cyrillic, Latin, or mixed.
   - **Hate or harassment directed at a specifically named person** (real name).
   - **Obfuscated spellings**: character substitutions (e.g. @ for a, 0 for o, 1 for i/l, $ for s, 3 for e) such as “pid@ras” or “p1daras”. These are treated as curse words.  
   Do **not** flag: general complaints, venting, or "spilling tea" when no specific person is named (e.g. "the professor", "the director", "administration"). Students may complain about situations or roles; only flag when someone is named and attacked.  
   If the model answers YES, the content is rejected.

3. **Image moderation**  
   For post images, GPT-4o-mini vision is asked whether the image:
   - Is appropriate for a safe community app
   - Contains **visible curse words or offensive text** in any language (e.g. EN, RU, KZ)
   - Contains nudity, violence, hate symbols, or other inappropriate content  

   If any of these are true, the image is rejected.

## User-facing errors

- **Posts**: `"Post violates community guidelines"` / `"Post contains language that is not allowed"` / `"Image violates community guidelines"`
- **Comments**: `"Comment violates community guidelines"` / `"Comment contains language that is not allowed"`

## Deploying

1. **OpenAI API key**  
   Set in Supabase: Project Settings → Edge Functions → Secrets → `OPENAI_API_KEY`.

2. **Deploy moderated functions**  
   ```bash
   supabase functions deploy create-post
   supabase functions deploy create-comment
   ```

## Cost (approximate)

- OpenAI Moderation API: ~$0.0001 per 1K characters
- GPT-4o-mini (curse check + image): ~$0.0001 per request/image  
So each moderated post or comment is a few hundredths of a cent.
