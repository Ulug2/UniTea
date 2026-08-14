import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FeedFilter = "hot" | "new" | "top";

// User-specific preference (hiding a post only affects that user's own
// feed), so the storage key is scoped by userId — a global key would let
// one account's hidden-post list leak into another account's feed on the
// same device after a sign-out/sign-in switch (Phase 6 finding, fixed in
// Phase 8). The pre-Phase-8 global key is deliberately left unmigrated: an
// opaque list of post IDs, low severity, not worth the added complexity.
const HIDDEN_POSTS_KEY_PREFIX = "@unitee_hidden_posts:";

const FilterContext = createContext<{
  selectedFilter: FeedFilter;
  setSelectedFilter: (filter: FeedFilter) => void;
  hiddenPostIds: string[];
  hidePost: (postId: string) => void;
}>({
  selectedFilter: "hot",
  setSelectedFilter: () => {},
  hiddenPostIds: [],
  hidePost: () => {},
});

export const useFilterContext = () => useContext(FilterContext);

type FilterProviderProps = {
  children: ReactNode;
  /** Scopes the hidden-posts list to this user. Omit (e.g. signed out) to
   * keep the list empty and skip persistence entirely. */
  userId?: string;
};

export function FilterProvider({ children, userId }: FilterProviderProps) {
  const [selectedFilter, setSelectedFilter] = useState<FeedFilter>("hot");
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);

  // Load persisted hidden posts on mount / whenever the signed-in user
  // changes, so switching accounts on one device can never show the
  // previous account's hidden-post list.
  useEffect(() => {
    if (!userId) {
      setHiddenPostIds([]);
      return;
    }

    let cancelled = false;
    AsyncStorage.getItem(HIDDEN_POSTS_KEY_PREFIX + userId)
      .then((stored) => {
        if (cancelled) return;
        const parsed: string[] = stored ? JSON.parse(stored) : [];
        setHiddenPostIds(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => {
        // Ignore read errors – start with empty list
        if (!cancelled) setHiddenPostIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hidePost = useCallback(
    (postId: string) => {
      if (!userId) return;
      setHiddenPostIds((prev) => {
        if (prev.includes(postId)) return prev;
        const next = [...prev, postId];
        AsyncStorage.setItem(HIDDEN_POSTS_KEY_PREFIX + userId, JSON.stringify(next)).catch(
          () => {},
        );
        return next;
      });
    },
    [userId],
  );

  return (
    <FilterContext.Provider
      value={{ selectedFilter, setSelectedFilter, hiddenPostIds, hidePost }}
    >
      {children}
    </FilterContext.Provider>
  );
}
