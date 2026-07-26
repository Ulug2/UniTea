/**
 * Dependency-free UUID v4 generator.
 *
 * Needed because anonymous chat sends can no longer rely on
 * `INSERT ... RETURNING` to learn the server-generated message id (Phase 1
 * migration — the restrictive policy on `chats` also makes RETURNING
 * unavailable for anonymous chat_messages rows). The client generates the
 * id itself and passes it explicitly on insert, then re-fetches the row by
 * that known id via chat_messages_view.
 *
 * Not cryptographically secure — doesn't need to be, it's a primary key,
 * not a secret. Avoids adding a new package (`expo-crypto`/`uuid`) for a
 * single non-security use, and works in any Hermes/RN runtime without
 * relying on a Web Crypto polyfill being present.
 */
export function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
