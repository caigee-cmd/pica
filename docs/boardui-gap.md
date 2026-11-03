# BoardUI Multi Agent Chat ↔ Pica gap

Reference: https://www.boardui.com/zh-hans/components/multi-agent-chat

## Round status

| Round | Focus | Status |
|-------|-------|--------|
| 1 | Shell / tokens / composer / bubbles / AgentEditor | Done |
| 2 | Avatar life + send arc + typewriter queue | Done |
| 3 | AgentEditor emotion/color/fields · Composer menus · header density | Done |
| 4 | Marketplace · narrow layout · account/appearance · header copy/kebab | Done |
| 5 | Shape-morph avatar · ScreenPanel computer card · approvals/questions | Done |
| 6 | Search expand · message hover · context menu · support-lite | Done |
| 7 | Empty states · group picker cluster CTA · motion timing | Done |
| 8 | Visual QA · dark bubble parity · rough edges · CHANGELOG | Done |
| 11 | Chat GSAP polish · composer send/focus · rail select · thread switch | Done |
| 12 | Composer pill/control sizes · message blur enter · density sweep | Done |

`MOTION_ROUND = 12`. Prefer `prefers-reduced-motion` paths remain no-op for travel.

## Closed in polish (UI)

Composer **Files** + drag/paste attachments (artifacts.create + artifactIds) and group **@** member picker (operator cue only). Layout shell, motion (arc / typewriter / morph / scrim), editor personality (local), marketplace chrome, screen/approval cards, search/hover/context, empty states, group picker (groups.create), spacing/typography pass, dark charcoal bubbles, focus-visible, Esc on dialogs/settings/narrow editor, toast above composer.

## Remaining product gaps (need gateway / not more UI fakes)

| Gap | Why UI alone is not enough |
|-----|----------------------------|
| `POST` create-group (or equivalent) | Pica uses `local:group:…` stubs; sends stay offline |
| `PATCH /api/bots/:id` personality | Name/role/color/shape stay in local prefs only |
| Real plugin install / marketplace billing | Cards are local chrome; installs toast “later” |
| Cookie / session bridge for live Screen embed | Computer card shows status + actions list only |
| Voice input, teach-mode | Intentionally out of polish scope |
| Real file upload / multipart messages | Composer embeds images as `data:` markdown + notes other filenames in text — see `docs/composer-attach-mention.md` |
| Server-side @ routing in groups | Composer @ picker inserts plain `@Name`; gateway still runs full-group rounds |
| Server-side thumbs / message reactions | Thumbs are localChrome only |

## How to preview Round 8

1. `npm install && npm run tauri dev`
2. Settings → gateway base URL + token (printed at gateway startup `/auth?token=…`)
3. Toggle appearance dark/light — bubbles, composer, rail selection, dialogs should stay charcoal / near-black, not washed white borders
4. Tab through header/composer — focus rings; Esc closes marketplace / support / group picker / settings; narrow Esc closes editor
5. Empty DM / group / home + **+ → Chat with your agents** as in Round 7

## Desktop chrome (post Round 8)

- Left sidebar width is user-resizable (drag handle); not a BoardUI demo feature, HuLa-layout logic only.
