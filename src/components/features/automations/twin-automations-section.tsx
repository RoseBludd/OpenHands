import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import PlayIcon from "#/icons/play.svg?react";
import {
  fetchTwinAutomations,
  runTwinAutomation,
  type TwinAutomationItem,
} from "#/api/twins-service/twins-service.api";
import { StatusBadge } from "./status-badge";
import { automationActivityListClassName } from "./automation-view-mode";
import { automationIconActionButtonClassName } from "./automation-action-button-classes";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { formatRelativeTime } from "#/utils/format-relative-time";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";

const TWINS_QUERY_KEY = ["twins-automations"] as const;

const pillClassName =
  "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] leading-4 text-tertiary-light";

function matchesSearch(item: TwinAutomationItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.twinDisplay.toLowerCase().includes(q) ||
    item.twin.toLowerCase().includes(q)
  );
}

/**
 * Twin automations from the agent-twins service (R2 is the source of truth),
 * surfaced on the Automate dashboard below the native automation groups.
 * Read-only plus "run now" — edit/toggle stay in R2 by design.
 */
export function TwinAutomationsSection({
  searchQuery = "",
}: {
  searchQuery?: string;
}) {
  const { t, i18n } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: TWINS_QUERY_KEY,
    queryFn: fetchTwinAutomations,
    staleTime: 30_000,
    retry: 1,
  });

  const runMutation = useMutation({
    mutationFn: (item: TwinAutomationItem) =>
      runTwinAutomation(item.twin, item.slug),
    onSuccess: (result) => {
      displaySuccessToast(
        t(I18nKey.AUTOMATIONS$TWINS$RUN_SUCCESS, {
          name: result.automation,
          twin: result.twin,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: TWINS_QUERY_KEY });
    },
    onError: (error) => {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$TWINS$RUN_ERROR)),
      );
    },
  });

  if (query.isError) {
    return (
      <section aria-labelledby="twin-automations-heading">
        <h2 className="text-base font-semibold text-foreground">
          {t(I18nKey.AUTOMATIONS$TWINS$TITLE)}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$TWINS$UNREACHABLE)}
        </p>
      </section>
    );
  }

  if (query.isLoading) {
    return (
      <section aria-labelledby="twin-automations-heading">
        <div className="flex items-center">
          <h2 className="text-base font-semibold text-foreground">
            {t(I18nKey.AUTOMATIONS$TWINS$TITLE)}
          </h2>
        </div>
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-surface-raised" />
      </section>
    );
  }

  const items = (query.data ?? []).filter((item) =>
    matchesSearch(item, searchQuery),
  );
  if (items.length === 0) return null;

  const runPendingKey =
    runMutation.isPending && runMutation.variables
      ? `${runMutation.variables.twin}/${runMutation.variables.slug}`
      : null;

  return (
    <section aria-labelledby="twin-automations-heading">
      <div className="flex items-center">
        <h2 className="text-base font-semibold text-foreground">
          {t(I18nKey.AUTOMATIONS$TWINS$TITLE)}
        </h2>
        <StatusBadge count={items.length} />
      </div>
      <ul className={cn(automationActivityListClassName, "mt-3")}>
        {items.map((item) => {
          const rowKey = `${item.twin}/${item.slug}`;
          const isRunPending =
            runMutation.isPending && runPendingKey === rowKey;
          return (
            <li
              key={rowKey}
              className="group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-raised"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-sm text-white">
                    {item.name}
                  </span>
                  <span className={pillClassName}>{item.twinDisplay}</span>
                  {!item.enabled && (
                    <span className={pillClassName}>
                      {t(I18nKey.AUTOMATIONS$TWINS$DISABLED)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={pillClassName}>
                    {item.schedule
                      ? `${t(I18nKey.AUTOMATIONS$TWINS$CRON_LABEL)}: ${item.schedule}`
                      : t(I18nKey.AUTOMATIONS$TWINS$GITHUB_TRIGGER)}
                  </span>
                  {item.lastRunAt ? (
                    <span className={pillClassName}>
                      {`${t(I18nKey.AUTOMATIONS$TWINS$NEVER_RUN.replace("NEVER_RUN", "LAST_RUN"))} ${formatRelativeTime(item.lastRunAt, i18n.language, t)}`}
                    </span>
                  ) : (
                    <span className={pillClassName}>
                      {t(I18nKey.AUTOMATIONS$TWINS$NEVER_RUN)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={automationIconActionButtonClassName}
                onClick={() => runMutation.mutate(item)}
                disabled={runMutation.isPending}
                aria-label={t(I18nKey.AUTOMATIONS$TWINS$RUN_ARIA, {
                  name: item.name,
                })}
              >
                {isRunPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <PlayIcon className="size-4 shrink-0" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
