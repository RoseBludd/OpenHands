import type { TwinRosterEntry } from "#/api/twins-service/twins-service.api";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useBackendScopedPath } from "#/hooks/use-backend-scoped-path";
import { cn } from "#/utils/utils";

interface TwinThreadListProps {
  twins: TwinRosterEntry[];
  activeTwinName?: string | null;
  onNavigate?: () => void;
}

export function TwinThreadList({
  twins,
  activeTwinName,
  onNavigate,
}: TwinThreadListProps) {
  const backendScopedPath = useBackendScopedPath();

  return (
    <div className="space-y-0.5">
      {twins.map((entry) => {
        const label = entry.display || entry.twin;
        const initial = label.charAt(0);

        return (
          <NavigationLink
            key={entry.twin}
            to={backendScopedPath(`/twins/${entry.twin}`)}
            onClick={onNavigate}
            data-testid={`twin-thread-row-${entry.twin}`}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                "flex h-8 w-full min-w-0 items-center gap-2 rounded-md pl-2 pr-1 text-sm font-normal transition-colors",
                isActive || activeTwinName === entry.twin
                  ? "bg-[var(--oh-surface-raised)] text-white"
                  : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface-raised)] hover:text-white",
              )
            }
          >
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--oh-surface-raised)] text-[11px] font-medium uppercase text-white"
            >
              {initial}
            </span>
            <span className="min-w-0 truncate">{label}</span>
          </NavigationLink>
        );
      })}
    </div>
  );
}
