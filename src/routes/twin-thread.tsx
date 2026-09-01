import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { BackLink } from "#/components/features/automations/detail/back-link";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";

interface TwinMessage {
  t: number | null;
  role: string;
  kind?: string;
  body: string;
  seq?: number;
  session?: string | null;
}

interface TranscriptResponse {
  twin: string;
  count: number;
  messages: TwinMessage[];
}
const TWINS_SESSION_PREFIX = "canvas-twin";

function formatTimestamp(t: number | null): string {
  if (!t) return "";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return "";
  }
}

export default function TwinThread() {
  const { t } = useTranslation("openhands");
  const { twinName } = useParams<{ twinName: string }>();

  const [messages, setMessages] = useState<TwinMessage[]>([]);
  const [loading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadTranscript = useCallback(async () => {
    if (!twinName) return;
    try {
      const res = await fetch(
        `/twins/conversations/${encodeURIComponent(twinName)}?limit=500`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TranscriptResponse;
      setMessages(data.messages ?? []);
    } catch {
      displayErrorToast(t(I18nKey.TWIN_THREAD$FAILED_LOAD));
    }
  }, [twinName]);

  useEffect(() => {
    void loadTranscript();
  }, [loadTranscript]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const prompt = draft.trim();
      if (!prompt || !twinName || sending) return;
      setSending(true);
      setDraft("");
      try {
        const res = await fetch(`/twins/ask/${twinName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prompt,
            session: `${TWINS_SESSION_PREFIX}-${twinName}`,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadTranscript();
      } catch {
        displayErrorToast(t(I18nKey.TWIN_THREAD$FAILED_SEND));
      } finally {
        setSending(false);
      }
    },
    [draft, twinName, sending, loadTranscript],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-root-primary">
      <header className="flex items-center gap-2 border-b border-tertiary px-4 py-3">
        <BackLink />
        <h1 className="text-lg font-semibold">{twinName}</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="text-sm text-muted-foreground">
            {t(I18nKey.TWIN_THREAD$LOADING)}
          </p>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((entry, index) => (
            <div
              key={`${entry.seq ?? entry.t ?? index}-${index}`}
              className={cn(
                "flex flex-col gap-1",
                entry.role === "user" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
                  entry.role === "user"
                    ? "bg-primary-3 text-content-primary"
                    : "bg-tertiary text-content-primary",
                )}
              >
                {entry.body}
              </div>
              {entry.t ? (
                <span className="text-[11px] text-neutral-400">
                  {formatTimestamp(entry.t)}
                </span>
              ) : null}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <form
        onSubmit={sendMessage}
        className="flex items-center gap-2 border-t border-tertiary px-4 py-3"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(I18nKey.TWIN_THREAD$MESSAGE_PLACEHOLDER, {
            name: twinName ?? "",
          })}
          className="flex-1 rounded-xl bg-tertiary px-4 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t(I18nKey.TWIN_THREAD$SEND)}
        </button>
      </form>
    </div>
  );
}
