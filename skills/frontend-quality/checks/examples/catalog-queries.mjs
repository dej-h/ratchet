import { queryOptions } from "@tanstack/react-query";

// The API object is supplied by the application; the factory owns request identity.
export function catalogQueries(api) {
  return {
    catalog: (workspaceId) => queryOptions({
      queryKey: ["catalog", workspaceId, { limit: 30 }],
      queryFn: ({ signal }) => api.catalog(workspaceId, { limit: 30, signal }),
      staleTime: 60_000,
    }),
    activity: (workspaceId) => queryOptions({
      queryKey: ["activity", workspaceId],
      queryFn: ({ signal }) => api.activity(workspaceId, { signal }),
      staleTime: 60_000,
    }),
  };
}
