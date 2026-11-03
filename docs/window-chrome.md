# Window chrome (HuLa-inspired logic)

Pica borrows **window strategy and code layout** from HuLa / talkio-style apps, not the green IM visual design.

## Platform split

| Platform | Decorations | Controls | Notes |
|----------|-------------|----------|-------|
| **macOS** | `true` + `titleBarStyle: Overlay` + `hiddenTitle` | Native traffic lights via **decorum** (`create_overlay_titlebar` + inset) | `Titlebar` is drag/brand chrome only |
| **Windows / Linux** | `set_decorations(false)` in Rust setup | Frontend **`ActionBar`** (min / max / close) | Do **not** call `create_overlay_titlebar` — it would inject decorum buttons that conflict with ActionBar |

Frontend helpers:

- `src/lib/platform.ts` — `isMac` / `isCompatibility` (Win+Linux)
- `src/hooks/useWindow.ts` — minimize / toggleMaximize / close + maximized state
- `src/components/ActionBar.tsx` — Win/Linux controls (Pica tokens)
- `src/components/Titlebar.tsx` — shared three-zone chrome; mounts ActionBar when `isCompatibility`

## Startup anti-flash + login→home

1. `tauri.conf.json` → main window `"visible": false` (+ `"transparent": true`).
2. `tauri-plugin-window-state` restores **SIZE | POSITION | MAXIMIZED | FULLSCREEN**.
3. **DECORATIONS** and **VISIBLE** are intentionally omitted from state flags so a previous decorated session cannot undo the Win/Linux split, and visibility is not restored from disk.
4. Rust setup applies platform chrome (decorum / undecorated) **while main stays hidden** — it does **not** `show()` at boot.
5. Frontend session gate (align HuLa / Lulu login→home): hydrate keyring + cookie jar → `connect` probe → **signed-in** `focusMainWindow()` / else `openLoginWindow()` (main remains hidden).

## Single instance

- Plugin: `tauri-plugin-single-instance` (desktop target; registered **first** in `lib.rs`).
- Second launch focuses visible `main`, else `login`, else shows `main` (`show_main` in `lib.rs`).
- No JS API / capability entries required.

## System tray + close-to-tray

- Cargo: `tauri` feature `tray-icon`; tray built in Rust with `TrayIconBuilder` (icon = `default_window_icon` from `src-tauri/icons`).
- Menu (Chinese): **显示窗口** / **退出**. Left-click tray icon shows/focuses the window; menu opens on right-click (`show_menu_on_left_click(false)`).
- `CloseRequested` on `main` is intercepted: `prevent_close` + `hide()` → app stays in tray. Real exit: tray **退出** (`ALLOW_EXIT` then `app.exit(0)`), or macOS **Cmd+Q** / normal app quit.
- **macOS**: after hide-to-tray, dock click uses `RunEvent::Reopen` to restore when no visible windows (AppKit does not bring back `orderOut`-hidden windows alone). Overlay + decorum traffic lights unchanged.
- **Windows / Linux**: ActionBar close still calls `window.close()`; Rust hides to tray the same way. Undecorated + ActionBar split unchanged.

## OS notifications

See **[notifications.md](./notifications.md)** — Gateway events → OS toast; click opens the bot/thread; foreground same-thread is quiet.

## Sidebar resize

- Desktop left rail width is draggable (handle on the right edge of `Sidebar`).
- Clamp **200–420px** (default **280**); persisted as `pica.sidebarWidth` via `usePrefs`.
- Live drag updates Zustand without hammering disk; `persist: true` on pointerup.
- App sets `--sidebar-w` from the same pref so the Titlebar three-zone gradient stays aligned (mac Overlay / Win ActionBar unchanged).
- Narrow / settings layouts still collapse the titlebar sidebar zone to `0`.

See also local roster cache: [local-cache.md](./local-cache.md).

## Multi-window

Pica keeps a single SPA; child OS windows are extra webviews of the same frontend with query routing in `src/main.tsx`.

| Label | Query | Purpose |
|-------|-------|---------|
| `main` | (none) | Primary app — tray / single-instance / close-to-tray |
| `login` | `?window=login` | Compact HuLa-style Existing login; close while main hidden → exit |
| `settings` | `?window=settings` | Gateway Settings in its own window |
| `screen` | `?window=screen&botId=<id>` | Computer panel pop-out (one screen window; new botId recreates) |

### Entry points

- **Settings**: Sidebar gear (when gateway is already configured) → `openSettingsWindow()` in `src/lib/windows.ts`. First-run / unconfigured still uses **inline** `SettingsView` inside `main` so connect works without a second window. If creating the child window fails, App falls back to inline.
- **Computer**: ScreenPanel **Pop out** → `openScreenWindow(botId)`. The in-main right-rail panel stays available.

### Close behavior

- `CloseRequested` in Rust hides **only** `main` (close-to-tray).
- `settings` / `screen` close **destroy** the window (default close). They are not tray-hidden.

### Child decorations (v1)

- **macOS**: `decorations: true` + `titleBarStyle: Overlay` + `hiddenTitle` — frontend **`ChildDragChrome`** only (traffic-light padding + optional muted title). **Do not** mount main three-zone `Titlebar` (no brand / ConnectionBadge / `--sidebar-w`).
- **Windows / Linux**: **native** decorations (`decorations: true`) — no undecorated + ActionBar on children, so OS controls stay reliable. `ChildDragChrome` renders nothing. Documented trade-off vs main chrome.
- **Settings** child uses `SettingsView` with `standalone` (compact prefs header; Esc / OS close — no nested「关闭」).

### Connection in child webviews

Zustand memory is **not** shared across webviews. Child shells call `hydrateConfig` / keyring on mount. Settings and screen use **HTTP-only** `connectHttpOnly()` (session check + `GatewayClient`) and do **not** open a second Gateway WebSocket. Main keeps the live WS.

### Capabilities

`src-tauri/capabilities/default.json` lists windows `main`, `settings`, `screen` and includes `core:webview:allow-create-webview-window` (plus related create/focus/close permissions).

### Verify

```bash
cd /Users/cj/Documents/personal/project/pica
npm run tauri dev
```

1. Configure gateway in inline Settings (first run) → main UI appears.
2. Click gear → separate Settings window; close it → window gone (process still in tray via main).
3. Open a bot → Computer panel → **Pop out** → larger Computer window with same controls; close destroys it.
4. Close main (traffic light) → still hides to tray; tray **退出** quits.
5. Second app launch still focuses `main` only.

## Follow-ups (not in this pass)

- Optional one-time “close to tray?” preference prompt.
- Optional traffic-light spacing tweak beyond current `(18, 20)` inset.

## Verify on macOS

```bash
cd /Users/cj/Documents/personal/project/pica
npm run tauri dev
```

Expect:

1. Unauthenticated cold start → compact **login** only (main never flashes). After login → main shows, login closes. Restart with valid jar/Bearer → main only.
2. No white flash before the paper UI appears when main is shown.
3. Native traffic lights inset into the 42px titlebar; brand + connection chip to the right.
4. No custom min/max/close buttons (ActionBar is Win/Linux only).
5. Quit and relaunch → window size/position restored.
6. Context menu → Rename opens the in-app dialog (not `window.prompt`).
7. Tray icon present; left-click / **显示窗口** restores the window.
8. Close (red traffic light) hides to tray — process stays alive; tray **退出** fully quits.
9. Launch a second instance while running → focuses the first window (no second process UI).
