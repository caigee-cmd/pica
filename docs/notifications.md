# OS notifications

Pica shows native OS notifications for meaningful Rakazo / server events when the user is not already focused on that thread (HuLa-style foreground quiet). Clicking a notification focuses the main window and opens the related bot/group thread.

## Plugin

- Rust: `tauri-plugin-notification` (registered in `src-tauri/src/lib.rs`)
- JS: `@tauri-apps/plugin-notification`
- Capability: `notification:default` (+ `core:window:allow-is-focused` / `allow-is-visible` for quiet checks)
- Frontend: `src/lib/notifications.ts` — bound from `App.tsx` via `bindOsNotifications()`

## What fires

| Source | Condition | Title pattern | Extra payload |
|--------|-----------|---------------|---------------|
| WS `message` | `kind === "approval_request"` and pending | `{name} · 待审批` | `threadId`, `botId?`, `kind` |
| WS `message` | `kind === "question"` and open | `{name} · 需要回答` | same |
| WS `message` | `kind === "login_request"` | `{name} · 需要登录` | same |
| WS `message` | `kind === "text"` and `sender !== "user"` | `{name} · 新消息` | same |
| WS `status` | `state === "blocked"` | `{name} · 待审批` | bot DM thread |
| WS `status` | `state === "waiting"` | `{name} · 等待中` | bot DM thread |

`hello` and other message kinds (activity, memory, …) are ignored. Same `kind+threadId` is debounced (~2.8s) to avoid question+waiting doubles.

## Foreground quiet

Skip notify when **all** of:

1. Main window is **visible**
2. Main window is **focused**
3. Current `selection.threadId` equals the event’s thread

Hidden-to-tray / unfocused / other-thread → notify.

## Click behavior

1. Register `onAction` before sending (desktop click reporting needs a live listener; plugin ≥ 2.6).
2. On tap (`actionId === "tap"` or any action): `show` + `unminimize` + `setFocus`, then `openBot(botId)` or `openGroup(threadId)` from `extra`.
3. Payload is stored in notification `extra` (`threadId`, `botId`, `kind`).

## Platform notes

### macOS

- First send / `requestPermission()` may show the system notification permission prompt. Grant under **System Settings → Notifications → Pica** if denied.
- Dock click after close-to-tray still uses `RunEvent::Reopen` (see `window-chrome.md`); notification tap independently focuses + navigates.
- Overlay titlebar / decorum unchanged.

### Windows

- Toasts work best for **installed** builds; `tauri dev` may show under a PowerShell / host name.
- Click is reported while the toast is on screen (not always after it moves to Action Center).

### Linux

- Depends on the desktop notification server. Left-click / action reporting varies by DE.

## Verify

```bash
cd /Users/cj/Documents/personal/project/pica
npm run tauri dev
```

1. Connect to a live Gateway; allow notifications when prompted.
2. Hide Pica to tray (close window).
3. Trigger a pending approval or open question from a bot → OS toast appears.
4. Click the toast → window shows and that bot/thread is selected.
5. Stay focused on the same thread and trigger another event → **no** toast.
6. Tray **退出** / single-instance still work as before.

## Sidebar attention badges

- Store: `src/stores/attention.ts` (`pica.attention.v1` localStorage, keyed by gateway `baseUrl`).
- Marks pending `approval_request` / open `question` / `login_request`, bot `waiting`|`blocked`, and soft unread assistant text — same Gateway signals as OS toasts.
- Clears when the user opens that bot/group thread (`openBot` / `openGroup`) or when the request resolves / status leaves waiting.
- UI: per-row rose (urgent) / sky (unread) / amber (seen-done) pills in `Sidebar`; aggregate count on titlebar `ConnectionBadge` and account footer.
- Tray (desktop): `set_tray_attention` updates macOS tray title + tooltip (`Pica · N 待处理`) without changing the tray menu.

### Verify badges

1. `npm run tauri dev`；连上 Gateway。
2. 切到别的 bot 或把窗口藏到托盘，触发待审批 / 提问 → 侧栏该 bot 出现红色角标，标题栏 Live 旁有合计。
3. 点开该 bot → 角标清除；托盘标题恢复。
4. 重启应用后，未刷新前 localStorage 仍保留角标；hello / loadThread 会与网关对齐。
