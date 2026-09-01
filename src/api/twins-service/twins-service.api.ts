import axios from "axios";
import { getEffectiveLocalBackend } from "../backend-registry/active-store";
import { NoBackendAvailableError } from "../agent-server-client-options";

/**
 * Client for the agent-twins service (sovereign digital twins). The twins
 * service is NOT the agent-server — it is a sidecar Bun service on the
 * deployment host, reached through the canvas static-server proxy seam
 * (`/twins` prefix). The proxy strips the prefix, so a frontend call to
 * `/twins/<rest>` reaches the twins service at `/<rest>` (e.g. the roster at
 * `/twins/twins` hits the service's own `GET /twins`).
 */
const TWINS_BASE_PATH = "/twins";

const twinsAxios = axios.create();

twinsAxios.interceptors.request.use((config) => {
  // Resolve the local backend on every call so it tracks the currently-active
  // local backend (and any host/key edits), matching the automation client.
  const backend = getEffectiveLocalBackend();
  if (!backend) throw new NoBackendAvailableError();
  // eslint-disable-next-line no-param-reassign
  config.baseURL = backend.host;

  const apiKey = backend.apiKey?.trim();
  if (apiKey) {
    config.headers.set("X-Session-API-Key", apiKey);
  }
  return config;
});

interface TwinAutomationRecord {
  name: string;
  slug: string;
  schedule?: string;
  enabled: boolean;
}

interface TwinRecord {
  name: string;
  display: string;
  seat: string;
  automations: TwinAutomationRecord[];
}

/** A twin automation flattened for the Automate dashboard section. */
export interface TwinAutomationItem {
  /** Twin service name (route key), e.g. "genius". */
  twin: string;
  /** Display name, e.g. "genius.". */
  twinDisplay: string;
  /** Automation slug used by the run endpoint. */
  slug: string;
  /** Human-facing automation name. */
  name: string;
  /** Cron expression; undefined for event/webhook-triggered automations. */
  schedule?: string;
  enabled: boolean;
  /** UTC timestamp of the most recent run (from the briefs feed), or null. */
  lastRunAt: string | null;
}

/** Load every twin's automations, annotated with last-run time from the briefs feed. */
export async function fetchTwinAutomations(): Promise<TwinAutomationItem[]> {
  const [twinsRes, briefsRes] = await Promise.all([
    twinsAxios.get<TwinRecord[]>(TWINS_BASE_PATH),
    twinsAxios
      .get<{
        briefs: Array<{ at: string; twin: string; title: string }>;
      }>(`${TWINS_BASE_PATH}/briefs`)
      .catch(() => ({ data: { briefs: [] } })),
  ]);

  // Briefs arrive newest-first; keep the first (newest) timestamp per twin+title.
  const lastRunAtByKey = new Map<string, string>();
  for (const brief of briefsRes.data.briefs ?? []) {
    const key = `${brief.twin}\u0000${brief.title}`;
    if (!lastRunAtByKey.has(key)) lastRunAtByKey.set(key, brief.at);
  }

  const items: TwinAutomationItem[] = [];
  for (const twin of twinsRes.data ?? []) {
    for (const a of twin.automations ?? []) {
      items.push({
        twin: twin.name,
        twinDisplay: twin.display || twin.name,
        slug: a.slug,
        name: a.name,
        schedule: a.schedule,
        enabled: a.enabled !== false,
        lastRunAt: lastRunAtByKey.get(`${twin.name}\u0000${a.name}`) ?? null,
      });
    }
  }
  return items;
}

export interface TwinRunResult {
  twin: string;
  automation: string;
  output: string;
}

export async function runTwinAutomation(
  twin: string,
  slug: string,
): Promise<TwinRunResult> {
  const res = await twinsAxios.post<TwinRunResult>(
    `${TWINS_BASE_PATH}/run/${encodeURIComponent(twin)}/${encodeURIComponent(slug)}`,
  );
  return res.data;
}
/** A twin from the roster — the twins service's canonical twin list. */
export interface TwinRosterEntry {
  /** Twin service name (route key), e.g. "archy". */
  twin: string;
  /** Display name, e.g. "Archy" or "devvy.". */
  display: string;
  /** Seat label, e.g. "development". Empty when the twin has no seat. */
  seat: string;
}

/** Load the twin roster (the twins service's own `GET /twins`). */
export async function fetchTwinRoster(): Promise<TwinRosterEntry[]> {
  const res = await twinsAxios.get<TwinRecord[]>(`${TWINS_BASE_PATH}/twins`);
  return (res.data ?? []).map((t) => ({
    twin: t.name,
    display: t.display || t.name,
    seat: t.seat ?? "",
  }));
}
