# Pica BoardUI polish — Rounds 1–12

中英对照摘要 / bilingual summary for the BoardUI Multi Agent Chat alignment pass.

## How to run · 如何运行

```bash
cd /path/to/pica
npm install
npm run tauri dev
```

First launch → **Settings / Gateway**：

- **Gateway address** 占位示例 / placeholder: `https://rakazo.caiaiu.com`（自托管 origin）
- **Token** 占位 / placeholder: gateway 启动时打印的 token（`/auth?token=…`）— 勿提交到 git

Rakazo origin tip: use HTTPS public URL or loopback `:45173`, never `:3100`.

## What changed · 改了什么

### Round 1 — Shell
- BoardUI-ish tokens（paper / surface / line / accent）、composer 浮层、气泡、AgentEditor 右栏骨架。

### Round 2 — Motion life
- Avatar 呼吸/游走、发送弧线进 thinking 行、typewriter 流式队列；尊重 `prefers-reduced-motion`。

### Round 3 — Editor + composer density
- Emotion / color / shape 字段、composer + / permissions / model 菜单、header 密度。

### Round 4 — Marketplace + narrow
- Marketplace 对话框、窄屏抽屉、账号/外观、header 文案与 kebab。

### Round 5 — Shape + Screen + approvals
- Avatar shape morph、ScreenPanel 电脑卡、Approval / question 卡片。

### Round 6 — Micro-interactions
- 搜索展开、消息 hover 操作、右键/⋯ 菜单、轻量 Support。

### Round 7 — Empty + group picker
- 空态文案（1:1 / 群 / 无 bot）、群组胶囊多选 + 头像簇、`Start chat · N agents`（后接 `groups.create`）。
- Motion timing 收紧（`MOTION_ROUND = 7`）。

### Round 8 — Visual QA（本轮）
- 间距/字重统一；暗色气泡走 charcoal token（非洗白描边）；focus-visible、Esc、禁用发送对比度、toast 抬到 composer 上方；kebab「Start group」接真实 picker；`MOTION_ROUND = 8`；本文档。

## P0 Rakazo wire-up（本轮）

- Composer：`artifacts.create` + `threads.send` `artifactIds` / `mentions`；`models.list` + `models.role(main)` 默认模型。
- AgentEditor：`bots.update`（name / description / color）；emotion / shape / label 仍本机。
- Settings：`approvalRules.list|remove` + `autoReview.get|set` UI。
- Sidebar Sign out → 真实 `signOut` + HuLa login 窗；GroupPicker 去掉 local stub 文案（`groups.create` 已通）。


### Round 9 — Routines / Screen embed / devices / approvalRules.set

- Routines：`createRoutine` / `patchRoutine` + RoutinePanel 新建/编辑表单（对照 CreateRoutineInput / update）。
- Screen：`computer.screenUrl` iframe；Rust `gateway_inject_session_cookies` 把 jar 会话写入当前 webview。
- Devices：Settings pair + list + forget；Rust `device_connect` / `device_disconnect`（请求一律 error frame）。
- Settings：`approvalRules.set` 新建 UI（effect always_allow|deny · matchKind tool|connector|site）。



### Round 10 — Rakazo web chat chrome

- Theme: align `index.css` to Rakazo `@rakazo/ui-tokens` light/dark (background / muted / chat-user / scrollbar / status).
- Bubbles: `rounded-[20px] px-[18px] py-3`, fill-only (user `chat-user`, bot `muted`), no outline; system font / body1.
- Scroll: `.pica-scroll` = Rakazo `.rk-scroll` (6px thumb).
- Loading: delayed spinner (PageLoading-style 500ms fade-in) instead of “Loading thread…”.
- Time separator: plain “Today” text (not pill).
- Reply: map `replyToMessageId` / `replyQuote` / `replyPreview`; ReplyLine; hover Reply; Composer preview; `threads.send` reply fields.
- Thinking row moved below messages; StatusDot uses token colors; `MOTION_ROUND = 10` (enter y:6 / 220ms).

### Round 11 — Chat GSAP polish (BoardUI multi-agent feel)

- Messages: `enterMessageRow` side-biased entrance (user from right / agent from left).
- Composer: focus lift + accent ring; send tap squash/spring; bar send pulse; send-ready pop; attachment/reply chip enter; chrome icon tap.
- Sidebar: rail row select pop + press tap; stronger active inset highlight.
- Thread switch: soft body cross-fade; jump-to-reply `flashHighlight`; loading label under delayed spinner.
- `MOTION_ROUND = 11`; Button `forwardRef` for send animation target.


### Round 12 — Composer pill + message enter (BoardUI agent-chat)

- Composer: BoardUI free `AgentComposer` proportions — **52px** pill (`min-h-[52px] rounded-full`), **p-2** / **gap-2.5**, chrome + send **size-9 (36px)** with ~18–20px glyphs, arrow-up send, expanded shell `rounded-[1.75rem]` when reply/attach/narrow; textarea 14/20 + auto-grow; caret accent.
- Motion: `MOTION_ROUND = 12`; `enterMessageRow` soft **blur(5px)+y:4** (BoardUI line enter) with side bias; quieter composer focus scale.
- Thread: message stack `gap-3`, bubble actions `size-7` rounded-md, thinking/empty CTA air; EmptyState / AgentEditor field radius; rail rows `rounded-2xl`.


## Known gaps · 已知缺口

| Gap | Note |
|-----|------|
| Bot emotion / shape | 无服务端字段；color 仅 hex（未用 `#hex::shape_N`） |
| Model pick persist | Composer 下拉仅本机会话提示，未写 prefs / 服务端 |
| Plugin install / billing | Marketplace 本地收藏级 |
| Live screen session | iframe + `gateway_inject_session_cookies`（密封 URL / jar 桥） |
| Voice / teach | 未做 |
| Server thumbs | 本地标记 |
| Host computer runner | pair/connect deny-all only；无 provision/execute |
| approvalRules.set UI | Settings 新建表单已接；category / require_approval 仅列表可见 |

## Key paths · 关键路径

- `src/App.tsx` — shell, toast, dialogs
- `src/modules/bots/Sidebar.tsx` — rail, Create menu, empty CTAs
- `src/modules/chat/ThreadView.tsx` / `Composer.tsx` — thread + bubbles + composer
- `src/modules/group/GroupPickerDialog.tsx` / `src/components/EmptyState.tsx`
- `src/lib/motion.ts` — `MOTION_ROUND` / `MOTION_TIMING`
- `docs/boardui-gap.md` — gap matrix

Polish arc complete for UI. Next gains need Rakazo RPC/feature alignment.

## After polish — desktop chrome

- **侧栏可拖拽调宽** / resizable left sidebar（200–420px，`pica.sidebarWidth`），Titlebar `--sidebar-w` 同步。

- **侧栏注意力角标** / unread·approval badges（`pica.attention.v1`，与 OS 通知同源事件；开帖清除；托盘 title 提示）。

- **Gateway token → OS keyring**（`pica.gateway` 仅留 baseUrl；首次启动迁移并擦除明文 token）。

## Session persistence + login gate (2026-11-03)

- Rust **persistent** cookie jar at `{app_data}/cookie-jar.json` (Better Auth); still optional keyring Bearer via `set-auth-token`.
- Startup: main stays **hidden** until session probe; unauthenticated → login window only (HuLa/Lulu-style).
