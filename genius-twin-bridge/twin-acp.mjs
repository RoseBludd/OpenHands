// Genius Twin ACP Bridge — wires a Genius digital twin into Agent Canvas.
// Speaks ACP: JSON-RPC 2.0 over newline-delimited JSON on stdio.
// Proxies prompts to the agent-twins service: POST {TWINS_URL}/ask/<twin>
// {"prompt": "...", "session": "<acp session id>"}.
//
// Usage: node twin-acp.mjs --twin <name> [--twins-url http://172.17.0.1:3340]
// No secrets needed — the twins API is tailnet/host-internal only.

import { randomUUID } from "node:crypto";
import readline from "node:readline";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TWIN = arg("twin", "");
const TWINS_URL = (arg("twins-url", "http://172.17.0.1:3340") || "").replace(/\/$/, "");
const ASK_TIMEOUT_MS = Number(arg("ask-timeout", "600000"));

const twinSessions = new Set();

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

function textFromPrompt(prompt) {
  try { console.error(JSON.stringify({ev:"prompt_raw", prompt})); } catch {}
  const t = _textFromPromptInner(prompt);
  try { console.error(JSON.stringify({ev:"prompt_text", len: (t || "").length})); } catch {}
  return t;
}

function _textFromPromptInner(prompt) {
  if (!Array.isArray(prompt)) return String(prompt ?? "");
  return prompt
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text") return block.text ?? "";
      if (block?.type === "resource_link") return `[resource: ${block.name ?? block.uri ?? ""}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function askTwin(prompt, sessionId) {
  try { console.error(JSON.stringify({ev:"fetch_start", url: TWINS_URL + "/ask/" + TWIN})); } catch {}
  const res = await fetch(`${TWINS_URL}/ask/${encodeURIComponent(TWIN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, session: sessionId }),
    signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
  });
  console.error(JSON.stringify({ev:"twins_reply", status: res.status}));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`twins API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.output ?? data?.reply ?? JSON.stringify(data);
}

async function handlePrompt(params) {
  const sessionId = params?.sessionId;
  const text = textFromPrompt(params?.prompt);
  if (!text) {
    notify("session/update", {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "(empty prompt)" } },
    });
    return { stopReason: "end_turn" };
  }

  let output;
  try {
    const res = await fetch(`${TWINS_URL}/ask/${encodeURIComponent(TWIN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, session: sessionId }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`twins API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    output = data?.output ?? data?.reply ?? JSON.stringify(data);
  } catch (err) {
    output = `Twin bridge error: ${err?.message ?? err}`;
  }

  notify("session/update", {
    sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: output } },
  });
  notify("session/update", {
    sessionId,
    update: {
      sessionUpdate: "usage_update",
      used: Math.max(1, Math.ceil((text.length + output.length) / 4)),
      size: 200000,
    },
  });
  return { stopReason: "end_turn" };
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  const isRequest = typeof id === "number" || typeof id === "string";

  if (!isRequest) {
    if (method === "session/cancel") twinSessions.delete(params?.sessionId);
    return;
  }

  try {
    let result;
    switch (method) {
      case "initialize": {
        twinSessions.clear();
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? 1,
            agentCapabilities: { loadSession: false, promptCapabilities: {} },
            authMethods: [],
          },
        });
        return;
      }
      case "session/new": {
        const sessionId = randomUUID();
        twinSessions.add(sessionId);
        send({ jsonrpc: "2.0", id, result: { sessionId } });
        return;
      }
      case "session/prompt": {
        const result = await handlePrompt(params);
        send({ jsonrpc: "2.0", id, result });
        return;
      }
      case "session/cancel": {
        twinSessions.delete(params?.sessionId);
        send({ jsonrpc: "2.0", id, result: {} });
        return;
      }
      case "authenticate": {
        send({ jsonrpc: "2.0", id, result: {} });
        return;
      }
      default: {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not supported: ${method}` } });
      }
    }
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: String(err?.message ?? err) },
    });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.method && typeof msg.id === "number") {
    void dispatch(msg);
  } else if (msg.method && msg.id === undefined) {
    void dispatch(msg);
  }
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
