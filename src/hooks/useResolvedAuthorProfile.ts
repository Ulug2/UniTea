import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useMyProfile } from "../features/profile/hooks/useMyProfile";
import { resolveUniversityDomain } from "../utils/universityDomain";
import type { Database } from "../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] & {
  university?: { name: string; domain: string } | null;
};

/**
 * Resolves the current user's profile synchronously from React Query cache or
 * AuthContext AsyncStorage cache, then falls back to the live query result.
 * University domain is also derived from the session email when needed so
 * bundled avatars can render on the first paint.
 */
export function useResolvedAuthorProfile(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { cachedProfile, session } = useAuth();
  const { data: fetchedProfile } = useMyProfile(userId);

  return useMemo(() => {
    const cachedQueryProfile = userId
      ? queryClient.getQueryData<Profile | null>([
          "current-user-profile",
          userId,
        ])
      : null;

    const profile =
      fetchedProfile ??
      cachedQueryProfile ??
      (cachedProfile
        ? ({
            username: cachedProfile.username,
            avatar_url: cachedProfile.avatar_url,
            university: cachedProfile.university_domain
              ? {
                  domain: cachedProfile.university_domain,
                  name: cachedProfile.university_name ?? "",
                }
              : null,
          } as Profile)
        : null);

    const universityDomain = resolveUniversityDomain({
      profileUniversityDomain: profile?.university?.domain,
      cachedUniversityDomain: cachedProfile?.university_domain,
      userEmail: session?.user?.email,
    });

    return { profile, universityDomain };
  }, [
    userId,
    fetchedProfile,
    cachedProfile,
    session?.user?.email,
    queryClient,
  ]);
}
