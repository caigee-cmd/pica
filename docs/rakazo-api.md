# Pica ↔ Rakazo API mapping

Pica is a self-built Tauri client for **self-hosted Rakazo**. There is **no** OpenGrok / conversations REST compatibility layer.

Authoritative notes (box): `/workspace/rakazo/CLIENT-API.md`, `/workspace/rakazo/PICA-RPC-ANSWERS.md`. Contracts: `@rakazo/contracts` `appContract`.

## Origin

| Use | URL |
|-----|-----|
| Public Existing instance | `https://rakazo.caiaiu.com` |
| Local web (this deploy) | `http://127.0.0.1:45173` |
| **Do not use** | `http://127.0.0.1:3100` (API-only loopback) |

Settings stores **origin only** (no path). Auth is Better Auth cookie (preferred) or optional Bearer.

## Transport

- All HTTP via Tauri `gateway_request` (reqwest + cookie jar + optional Bearer).
- `rpc(procedure, json)` → `POST {origin}/rpc/<ns>/<method>` body `{"json":…}`, return envelope `.json`.
- Live chat: Tauri `gateway_subscribe` / `gateway_unsubscribe` on `POST /rpc/threads/subscribe` (SSE). Events: `rpc-subscribe-event`, `rpc-subscribe-status`.

## Auth (`/api/auth`)

| Path | Role |
|------|------|
| `POST /api/auth/sign-in/email` | `{ email, password, rememberMe? }` |
| `POST /api/auth/sign-up/email` | `{ email, password, name }` |
| `POST /api/auth/sign-out` | clear session |
| Cookie `better-auth.session_token` | Preferred |
| Response `set-auth-token` | Optional native Bearer → keyring |

Connect probe: `health` → `me` (fallback `bots.list`).

## RPC used by Pica

| Need | Procedure | Client |
|------|-----------|--------|
| Health | `health` | `checkHealth` |
| Me | `me` | `fetchMe` |
| Bootstrap | `bootstrap` | `bootstrap` — preferred roster refresh (`refreshRoster`) |
| Bots | `bots.list` / `get` / `create` / `update` / `archive` / `remove` | `fetchBots` / `getBot` / create / `updateBot` / `archiveBot` / `removeBot` |
| Groups | `groups.list` / `get` / `create` / `update` / `archive` / `remove` | `fetchGroups` / `getGroup` / `createGroup` / `updateGroup` / `archiveGroup` / `removeGroup` |
| Head | `threads.head` | `threadHead(target)` |
| Snapshot | `threads.get` | `getThread(target)` |
| History | `threads.messages` | `fetchMessages(target)` → UI `Message[]` + cursor |
| Read state | `threads.markRead` / `markUnread` | open thread → `markRead`; kebab → `markUnread` |
| Clear / react | `threads.clear` / `threads.react` | kebab clear; bubble 👍/👎 → `react` |
| Search | `search.query` | Sidebar search → `searchQuery` |
| Send / stop | `threads.send` / `threads.stop` | `sendMessage` (`text?` `artifactIds?` `mentions?` `clientNonce?`) / `stopThread` |
| Live | `threads.subscribe` + cursor | `subscribeThread` → **`ProductEvent`** |
| Answer | `threads.answer` `{botId|groupId, runId, messageId, answer}` | `answerThread` / `resolveApproval` / `answerQuestion` — answer is `allow`/`deny`/`always`/choice id/text; ask block exposes `approvalEffectId` (not numeric approvalId) |
| Computer | `computer.status` / `screenUrl` / `terminalUrl` / `boot` / `stop` / `recover` / `reset` / `update` / `updates` / `releaseInterrupted` / `dismissUpdate` / `takeover` / `release` / `input` / `files` / `readFile` / `downloadFile` / `uploadFile` / `commands` / `heartbeat` | `fetchComputer` + deep helpers; ScreenPanel takeover/files |
| Routines+ | `routines.listForMentions` / `history` (+ existing list/create/update/remove/testRun) | RoutinePanel History; `listRoutinesForMentions` |
| Memory | `memory.list` / `budget` / `update` / `remove` / `exportMarkdown` / `providerConfig` / `connectProvider` / `setDefaultScope` / `disconnectProvider` | Settings P1 |
| Boards/Tickets | `boards.list` / `get` / `rename` · `tickets.list` / `get` / `create` / `update` / `move` / `comment` / `comments` | Settings P1 |
| Skills | `skills.*` (taught) · **`agentSkills.*`** (sibling) | Settings P1 |
| MCP / Connections / Caps | `mcp.servers.*` / `assignments.*` / `oauth.*` · `connections.*` · `capabilities.*` | Settings P1 |
| Artifacts+ | `artifacts.list` / `listSpace` / `listVersions` / `get` / `getById` / `remove` (+ create) | Settings P1 + send path |
| Runs | `runs.list` `{ filter: active\|recent }` only | Settings P1 |
| Preferences | `preferences.update` / `adoptTimezone`（无 get） | Settings P1 |
| Approvals rules | `approvalRules.list` / `set` / `remove` | `listApprovalRules` / `createApprovalRule` / `revokeRule` — Settings 新建表单 |
| Auto review | `autoReview.get` / `set` | `getAutoReview` / `setAutoReview` — same Settings section |
| Models | `models.list` / `role` / `credentials` / `connect` / `setDefault` / `setRole` | Settings models section; Composer still uses `models.role({role:"main"})` |
| Bot edit | `bots.update` | AgentEditor: name / description(+instructions) / hex color; emotion+shape local |

`ThreadTarget` = exactly one of `{ botId }` | `{ groupId }`.

## UI mapping

- Roster: prefer `bootstrap` then `bots` + `groups` (localCache `RosterEntry.groups`).
- Selection: `{ kind:"dm", botId, threadId }` | `{ kind:"group", groupId, threadId }`.
- Live: `messageFromProductEvent` / `statusFromProductEvent` → workspace + attention + OS notifications.
- **Removed:** `Conversation`, `GatewayEvent`, `/api/conversations*`, global `/ws` helper, OpenGrok paths.
- Ask cards: ProductEvent / message `ask.approvalEffectId` → UI; answer via `threads.answer` with runId+messageId.

## Realtime

Open thread → `threads.head` + `threads.messages` → `threads.subscribe` with `{ botId|groupId, cursor }`. Device computer WS is separate from the chat bus.

## Desktop login / session (vs web & Electron)

| Surface | Window / shell | Origin save | Session persistence |
|---------|----------------|-------------|---------------------|
| Rakazo web | Browser tab | Same origin | Better Auth cookie in browser |
| Electron Existing | Setup → main; `persist:rakazo-<sha256>` partition | User-entered origin | Cookie jar in persistent partition + optional Bearer |
| **Pica Tauri** | HuLa-like **`login`** OS window → **`main`**; settings/screen children | `localStorage` `pica.gateway.baseUrl` (origin only) | Rust reqwest **persistent cookie jar** (`{app_data}/cookie-jar.json`) + optional `set-auth-token` → OS **keyring** Bearer |

Differences to remember:

- Cookie jar survives process restart (file-backed, Electron `persist:` analogue). Sign-out calls `gateway_clear_cookies` (clears memory + file). Keyring Bearer still kept as optional fallback when the server returns `set-auth-token`.
- Login success emits `pica-session` so the separate `main` webview re-hydrates (Zustand is not shared across webviews).
- Closing `login` while `main` is hidden exits the app (HuLa-like). Unauthenticated launch opens `login`; **main stays invisible** until a session probe succeeds (no startup flash of the home shell).
- `normalizeBaseUrl`: missing scheme → `https` for public hosts, `http` for loopback / LAN / explicit port.


### Devices / host computer

- `POST /api/devices/pair` → `{ deviceId, token }`（token 一次；钥匙串 `device-token`）
- `GET /api/devices` · `DELETE /api/devices/:deviceId`
- WS `/api/devices/connect` Bearer device token + consent `device_set_allowed`
- Host runner methods: `environment`, `execute`/`run`/`shell`, `listFiles`/`readdir`, `readFile`, `writeFile`, soft lifecycle (`isRunning`/`stop`/`destroy`/`cancelRunWork`); unknown → structured error
- Screen embed: `computer.screenUrl` iframe + jar→webview cookie sync

### P1 inventory

Authoritative procedure table: box `/workspace/rakazo/PICA-RPC-P1.md` (`@rakazo/contracts` `appContract`). Naming: `agentSkills` sibling of `skills`; no `preferences.get`; `runs` only `list`.


### P2 inventory

Authoritative procedure table: box `/workspace/rakazo/PICA-RPC-P2.md` (`@rakazo/contracts` `appContract`).

| Family | Procedures | Notes |
|--------|------------|-------|
| voice | catalog / status / credentials / connect / disconnect / setVoice / setSpeechModel / voices / prepare | Settings P2 |
| messaging | installations.* · status · link.start · identities.* · channels.* · connections.* | ≠ top-level `connections.*` (Composio) |
| spaces | list / create / rename / remove | |
| onboarding | signupSurvey / start / promptFocus / choose / dismissFocus / appConnected | |
| scratchpad | list / create / update / remove | |
| notifications | registerPush / unregisterPush only | |
| export | bot / accountToken | |
| usage | list / summary | |
| billing | contract present | **this instance `billing:false` → UI hidden** |
| security / audit | events | |
| deployment | get / update | updater.* not wired |
| vault / botSecrets / agentSecrets | list/put/reveal/remove (vault); list/put/remove (botSecrets, agentSecrets) | no bare `secrets` |

UI IA (vs Rakazo web, t91u): `+` → New bot / New group chat; GroupPicker title New group; sidebar Archived + Restore; search hit → open + scroll message; AgentEditor Workspace entries Computer/Routines/Memory/Skills.
