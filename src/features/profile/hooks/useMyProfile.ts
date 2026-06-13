import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] & {
  university?: { name: string; domain: string } | null;
};

export function useMyProfile(userId?: string) {
  return useQuery<Profile | null>({
    queryKey: ["current-user-profile", userId],
    queryFn: async () => {
      let effectiveUserId = userId;

      if (!effectiveUserId) {
        const { data: sessionData } = await supabase.auth.getSession();
        effectiveUserId = sessionData.session?.user.id;
      }

      if (!effectiveUserId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*, university:universities(name, domain)")
        .eq("id", effectiveUserId)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    retry: 2,
  });
}

