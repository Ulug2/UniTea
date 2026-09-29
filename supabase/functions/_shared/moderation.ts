// Shared AI moderation rules for user-generated text (posts, comments,
// communities) and text inside post images. One definition so every surface
// enforces the same policy.
//
// Names of private people are ALLOWED unless the content targets them:
// insults/harassment, threats, sexual comments, rumors or accusations, or
// exposing their personal information. Unclear cases are allowed; reports
// and admin removal handle the misses.

import type OpenAI from "https://esm.sh/openai@4";

export const MODERATION_MODEL = "gpt-4o-mini";
/** Deterministic verdicts: the same text should always get the same decision. */
export const MODERATION_TEMPERATURE = 0;

export const LANGUAGE_NOTE =
  `Text may be in English, Russian, Kazakh, or Latin-transliterated Russian/Kazakh (e.g., "krasavchik", "zhasap", "pizdec").`;

export const TARGETS_PRIVATE_PERSON_RULE = `targets_private_person: true ONLY if the text names or clearly identifies an everyday, private individual (e.g. a student or classmate) AND does at least one of:
   - insults, mocks, humiliates, or harasses them (including their looks, body, ethnicity, religion, gender, or sexuality)
   - threatens them or encourages others to harass, avoid, or harm them
   - makes sexual comments or claims about them
   - spreads rumors or accusations about them, even in a neutral tone (e.g. "X cheated on the midterm", "X is dating Y", "X has an STD")
   - exposes their personal information (phone number, address, dorm/room number, social media handle, schedule/whereabouts)
   - FALSE when a private person is merely mentioned in a neutral or positive way: thanks, shoutouts, congratulations, questions, lost & found ("Arman, your charger is at the library desk"), study groups, events, clubs.
   - FALSE for public figures, celebrities, actors (e.g. "Erkebulan Toktar"), athletes, influencers, politicians, and generic roles ("the dean", "my professor", "admin").
   - FALSE for opinions or criticism of someone's public work or role (a performance, film, song, match, a speech) that don't include any of the harms above — e.g. "X is overrated", "X's new song is bad".
   - If it is unclear whether the mention is harmful, answer false.`;

export const EXPLICIT_SEXUAL_RULE = `explicit_sexual: true ONLY if the text is highly graphic, pornographic, erotica, or describes sexual violence/non-consensual acts.
   - FALSE for normal discussions about relationships, sex, anatomy, or casual sexual slang (e.g., "fingering", "hooking up") used in a conversational, joking, or educational context.`;

export const TEXT_MODERATION_SYSTEM_PROMPT = `You are an AI moderator for an anonymous social app for university students.
Analyze the user's text. ${LANGUAGE_NOTE}

Evaluate for two violations:
1. ${TARGETS_PRIVATE_PERSON_RULE}
2. ${EXPLICIT_SEXUAL_RULE}

Output JSON ONLY: {"targets_private_person": boolean, "explicit_sexual": boolean}`;

export const IMAGE_MODERATION_PROMPT = `You are an AI moderator for an anonymous university social app. Analyze this image carefully. Pay close attention to BOTH the visual imagery AND any text, memes, or screenshots of chats embedded in the image. ${LANGUAGE_NOTE}

Evaluate for three violations:
1. visual_explicit: true if the image contains explicit nudity or visual pornography.
2. ${TARGETS_PRIVATE_PERSON_RULE}
   Apply this to text and chat screenshots in the image. Screenshots that expose a private person's messages, contact details, or profile are also true.
3. explicit_sexual_text: true ONLY if text in the image describes highly graphic/pornographic sexual acts. FALSE for casual relationship slang or memes.

Output JSON ONLY: {"visual_explicit": boolean, "targets_private_person": boolean, "explicit_sexual_text": boolean}`;

/** User-facing rejection reason for content that targets a private person. */
export function targetsPrivatePersonMessage(subject: string): string {
  return `${subject} targets a specific person. Insults, threats, rumors, sexual comments, or sharing someone's personal info aren't allowed.`;
}

/** Parses a moderation model's JSON reply; unparseable replies allow the content through. */
export function parseModerationJson<T extends object>(text: string | null | undefined): Partial<T> {
  try {
    return JSON.parse(text || "{}") as Partial<T>;
  } catch (e) {
    console.error("Failed to parse moderation JSON:", e);
    return {};
  }
}

/**
 * Hard safety checks (OpenAI Moderation API) + contextual checks (targeting
 * private people, explicit sexual content), run in parallel. Throws an Error
 * with a user-facing message on the first violation, checked in order:
 * severe harm, explicit sexual content, targeting a private person.
 */
export async function moderateText(
  openai: OpenAI,
  text: string,
  subject: "Post" | "Comment",
): Promise<void> {
  const [moderation, contextCheck] = await Promise.all([
    openai.moderations.create({ input: text }),
    openai.chat.completions.create({
      model: MODERATION_MODEL,
      messages: [
        { role: "system", content: TEXT_MODERATION_SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 2000) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 50,
      temperature: MODERATION_TEMPERATURE,
    }),
  ]);

  const categories = moderation.results?.[0]?.categories;
  if (
    categories &&
    (categories["sexual/minors"] ||
      categories["self-harm/intent"] ||
      categories["self-harm/instructions"] ||
      categories["violence/graphic"])
  ) {
    throw new Error(`${subject} violates severe safety guidelines (harm, minors, graphic violence)`);
  }

  const verdict = parseModerationJson<{ targets_private_person: boolean; explicit_sexual: boolean }>(
    contextCheck.choices[0]?.message?.content,
  );
  if (verdict.explicit_sexual) {
    throw new Error(`${subject} contains sexually explicit content`);
  }
  if (verdict.targets_private_person) {
    throw new Error(targetsPrivatePersonMessage(subject));
  }
}
