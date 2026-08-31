# Genius Twin Bridge (ACP adapter)

Wires the Genius digital twins (archy., devvy., genius., oppi., sec., simmy.) into **Agent Canvas** (this repo's UI) as selectable agents. The bridge is a zero-dependency Node ACP server: it speaks ACP (JSON-RPC 2.0 over NDJSON stdio) to the OpenHands agent-server and forwards prompts to the `agent-twins` service API.

## Architecture

```
Canvas UI → agent-server → spawns `node twin-acp.mjs --twin <name>` (ACP, stdio/NDJSON)
                                   └→ POST {TWINS_URL}/ask/<twin> {prompt, session} → twin output
```

- The twins service (`agent-twins` container, host port 3340) owns CADIS calls, session memory (16-turn server-side history), R2-driven cron automations, and mailbox A2A. The bridge is a thin read-only proxy — it adds no state and no ports.
- Each twin appears in Canvas as an **agent profile** (ACP, `acp_server: custom`). Selecting the profile in the UI routes the conversation through the bridge.

## Deployment (genius-substrates-host VPS, Tailscale 100.86.225.40)

- Adapter: `/srv/agent-canvas/acp/twin-acp.mjs` (mounted read-only into the `agent-canvas` container at `/srv/acp`).
- Container: `agent-canvas` (ghcr.io/openhands/agent-canvas) on `bridge` + `coolify` networks; unified ingress `100.86.225.40:8010` → 8000; public-mode static server on 8003 (`PUBLIC_MODE_PORT`, auth-required, no baked session key) for the Traefik/`agents.geniuzs.com` route.
- Twins API reachable from the container via the docker bridge gateway `http://172.17.0.1:3340`.
- CADIS LLM: settings-level `agent_settings.llm` = `openai/cadis` @ `https://cadis.geniuzs.com/v1` (key persisted via agent-server settings). Twin profiles set `title_llm_profile: "genius."` so autotitling also uses CADIS.

### Agent profile recipe (per twin)

`POST /api/agent-profiles/<name>` with `{"agent_kind":"acp","acp_server":"custom","acp_command":["node","/srv/acp/twin-acp.mjs","--twin","archy","--twins-url","http://172.17.0.1:3340"],"acp_args":[]}` then `POST /api/agent-profiles/<profile_id>/activate`.

## ACP protocol notes (learned the hard way)

- Transport is **newline-delimited JSON-RPC 2.0** (no Content-Length framing).
- `initialize` → `session/new` → `session/prompt` → notifications: `session/update` with `sessionUpdate: "agent_message_chunk"`.
- **`AgentMessageChunk.content` is a SINGLE content block** (`{type:"text",text}`), not an array — sending a list makes the SDK silently drop the chunk.
- The agent-server waits for a `session/update` with `sessionUpdate: "usage_update"` (used/size) within ~2s of `session/prompt` returning; end with `stopReason: "end_turn"`.
- `session/prompt` params: `{sessionId, prompt:[{type:"text",text}]}` — the sessionId is a string UUID, and `params` is the whole params object.

## Verification

Conversations via each twin profile finish with the twin's own reply (e.g. "Hi, I'm Archy, the architecture bot for Genius Substrates") — check `GET /api/conversations/{id}/events/search` or the Canvas UI.
