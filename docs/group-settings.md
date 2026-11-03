# Group settings

A **Group** in Pica is a multi-bot shared conversation (2–10 members), not an IM “people room.”
Aligned with Rakazo `GroupSettings` / `CreateGroupForm`.

## Open

- Group thread → click header title or avatar cluster → right rail **Group settings**
- Header kebab → **Group settings**
- Panel toggle (⌘\\) on a group thread opens the same rail (`panel === "none"`)

## Panel (`src/modules/group/GroupSettingsPanel.tsx`)

| Control | RPC |
| --- | --- |
| Name + Members checkboxes → **Save** | `groups.update` `{ groupId, name?, botIds? }` |
| **Delete group** (confirm) | `groups.remove` |
| Click a member row (avatar/name) | `openBot` → that bot’s DM |

Member picker: Show all / Show selected, filter, pick **2–10**.

## Create

`GroupPickerDialog` creates via `groups.create` (picker capped at 10). After create, use header → Group settings to rename or edit members.

## Sidebar

Existing Groups list still supports rename / archive / remove; the thread header is the primary path to the settings panel.
