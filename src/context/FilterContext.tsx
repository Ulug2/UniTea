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

const HIDDEN_POSTS_KEY = "@unitee_hidden_posts";

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

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedFilter, setSelectedFilter] = useState<FeedFilter>("hot");
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);

  // Load persisted hidden posts on mount
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_POSTS_KEY)
      .then((stored) => {
        if (stored) {
          const parsed: string[] = JSON.parse(stored);
          setHiddenPostIds(Array.isArray(parsed) ? parsed : []);
        }
      })
      .catch(() => {
        // Ignore read errors – start with empty list
      });
  }, []);

  const hidePost = useCallback((postId: string) => {
    setHiddenPostIds((prev) => {
      if (prev.includes(postId)) return prev;
      const next = [...prev, postId];
      AsyncStorage.setItem(HIDDEN_POSTS_KEY, JSON.stringify(next)).catch(
        () => {},
      );
      return next;
    });
  }, []);

  return (
    <FilterContext.Provider
      value={{ selectedFilter, setSelectedFilter, hiddenPostIds, hidePost }}
    >
      {children}
    </FilterContext.Provider>
  );
}
