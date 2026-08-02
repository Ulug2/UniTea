// App-level types for the Communities feature.
//
// These alias the generated Supabase types so there's a single source of
// truth. Regenerate with `npm run types` after schema changes.

import type { Database } from "../../types/database.types";

// `updated_at` was added by 20260802120000_avatar_community_updated_at_versioning.sql
// (image cache-versioning for deterministic community avatar paths) but
// isn't in the generated Database types yet — per project convention,
// extend the alias here rather than hand-editing the generated file or
// running `npm run types` (which pulls unrelated live schema drift).
// Optional because most existing queries don't select it — only
// useCommunity/useUpdateCommunity do, for the manage screen's avatar
// cache-busting.
export type Community = Database["public"]["Tables"]["communities"]["Row"] & {
  updated_at?: string | null;
};

export type CommunityInsert =
  Database["public"]["Tables"]["communities"]["Insert"];

export type CommunityMember =
  Database["public"]["Tables"]["community_members"]["Row"];

/** Community row as shown in the university directory, with member count. */
export type CommunityDirectoryEntry = Community & {
  member_count: number;
};
