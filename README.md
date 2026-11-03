# Pica

自研桌面客户端（Tauri），对接自托管 [Rakazo](https://github.com/elie222/rakazo)。
Pica 只做 UI：机器人、浏览器、记忆、例程跑在 Rakazo 服务端。

目标 origin：`https://rakazo.caiaiu.com`（或本机 `http://127.0.0.1:45173`）。不要直连 `:3100`，也不要再用已删除的 OpenGrokBot Gateway `:4747`。

## Stack

Tauri 2, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand.
Chat is a small local composer and thread, not a third-party chat runtime.

## Layout

```
src/
  types/gateway.ts          wire types (bots, messages, events) — migrating to Rakazo RPC
  lib/config.ts             saved server origin (+ auth)
  lib/gateway.ts            HTTP client (was Gateway REST; moving to /rpc + /api/auth)
  lib/stream.ts             live events (was /ws)
  stores/connection.ts      connect, reconnect, error
  stores/workspace.ts       roster, threads, live events
  modules/settings/         server address and auth
  modules/bots/             sidebar
  modules/chat/             thread, composer, message cards
  modules/approvals/        Approve / Discard
  modules/screen/           bot computer preview
  modules/routines/         pause, run, delete
src-tauri/                  Tauri shell (no agent logic)
```

## Run

```bash
npm install
npm run tauri dev
```

On first launch, set the Rakazo origin (Existing self-host). Auth uses Better Auth session on that origin (`/api/auth/*`); business calls are `POST /rpc/<procedure>` with cookie/session.

Probe before save:

```http
POST {origin}/rpc/health
Content-Type: application/json

{"json":{}}
```

Expect `{"json":{"ok":true,"version":"…"}}`.

## Docs

See `docs/rakazo-api.md` for the Pica↔Rakazo minimal map. Also `docs/` for chrome, cache, notifications, composer. Deploy API notes: `/workspace/rakazo/CLIENT-API.md`.
