import { useQuery } from "@tanstack/react-query";
import { fetchTwinRoster } from "#/api/twins-service/twins-service.api";
import { TWIN_ROSTER_QUERY_KEYS } from "./query-keys";

interface UseTwinRosterOptions {
  enabled?: boolean;
}

/** Sovereign twin roster for agents-mode sidebar thread links. */
export function useTwinRoster(options: UseTwinRosterOptions = {}) {
  return useQuery({
    queryKey: TWIN_ROSTER_QUERY_KEYS.all,
    queryFn: fetchTwinRoster,
    staleTime: 30_000,
    retry: 1,
    enabled: options.enabled ?? true,
    meta: { disableToast: true },
  });
}
