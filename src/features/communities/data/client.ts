// Named, typed access helpers for the communities tables.
//
// The generated `database.types.ts` includes `communities` and
// `community_members`, so these are fully typed against the live schema.

import { supabase } from "../../../lib/supabase";

/** Typed handle to the `communities` table. */
export const communitiesTable = () => supabase.from("communities");

/** Typed handle to the `community_members` table. */
export const communityMembersTable = () => supabase.from("community_members");
