/**
 * Dependency-free UUID v4 generator.
 *
 * Used to let the client generate a row's own primary key before insert —
 * e.g. anonymous chat sends (RLS blocks `RETURNING` for those rows, see
 * useChatSendMessage.ts) and post-creation idempotency keys (see
 * useCreatePostMutation.ts).
 *
 * Not cryptographically secure — doesn't need to be, it's a primary key,
 * not a secret. Avoids adding a new package (`expo-crypto`/`uuid`) for a
 * few non-security uses, and works in any Hermes/RN runtime without
 * relying on a Web Crypto polyfill being present.
 */
export function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
