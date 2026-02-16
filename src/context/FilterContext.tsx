import { createContext, useContext, useState, ReactNode } from "react";

export type FeedFilter = "hot" | "new" | "top";

const FilterContext = createContext<{
  selectedFilter: FeedFilter;
  setSelectedFilter: (filter: FeedFilter) => void;
}>({
  selectedFilter: "hot",
  setSelectedFilter: () => {},
});

export const useFilterContext = () => useContext(FilterContext);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedFilter, setSelectedFilter] = useState<FeedFilter>("hot");
  return (
    <FilterContext.Provider value={{ selectedFilter, setSelectedFilter }}>
      {children}
    </FilterContext.Provider>
  );
}
