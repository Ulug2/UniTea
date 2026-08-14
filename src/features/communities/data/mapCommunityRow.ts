import type { Community, CommunityDirectoryEntry } from "../types";

/** A community row selected with the `community_members(count)` embed. */
export type CommunityQueryRow = Community & {
  community_members: { count: number }[];
};

/** Shared shaping for any query selecting `community_members(count)` alongside a community row. */
export function mapCommunityRow(row: CommunityQueryRow): CommunityDirectoryEntry {
  const { community_members, ...community } = row;
  return {
    ...community,
    member_count: community_members?.[0]?.count ?? 0,
  };
}
