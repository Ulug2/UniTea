import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function useProfileById(userId: string | null | undefined) {
  return useQuery<Profile | null>({
    queryKey: ["profile-by-id", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 2,
  });
}

