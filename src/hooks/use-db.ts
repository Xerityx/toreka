import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/db/client";

/** App-wide database handle (opens once, cached forever). */
export function useDb() {
  return useQuery({
    queryKey: ["db"],
    queryFn: getDb,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
