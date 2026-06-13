// App-level types for the Communities feature.
//
// These alias the generated Supabase types so there's a single source of
// truth. Regenerate with `npm run types` after schema changes.

import type { Database } from "../../types/database.types";

export type Community = Database["public"]["Tables"]["communities"]["Row"];

export type CommunityInsert =
  Database["public"]["Tables"]["communities"]["Insert"];

export type CommunityMember =
  Database["public"]["Tables"]["community_members"]["Row"];

/** Community row as shown in the university directory, with member count. */
export type CommunityDirectoryEntry = Community & {
  member_count: number;
};
