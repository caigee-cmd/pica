# 本地草稿与花名册缓存

断线或 Gateway 暂时不可达时，侧栏仍能显示上次成功拉取的 bot / group 列表，输入框保留未发送草稿。**不缓存完整消息历史**（避免伪造会话）。

## Storage keys

| Key | 内容 |
| --- | --- |
| `pica.roster.v1` | 花名册（按 gateway `baseUrl` 分区） |
| `pica.drafts.v1` | composer 草稿（按 `baseUrl` → `threadId`） |
| `pica.gateway` | Gateway **`baseUrl` only**（token 在 OS keyring，见钥匙串一节） |

实现：`src/lib/localCache.ts`，由 `src/stores/workspace.ts` 在启动 / 刷新 / 改草稿时读写。

## Schema

### Roster (`pica.roster.v1`)

```json
{
  "v": 1,
  "byBaseUrl": {
    "https://rakazo.caiaiu.com": {
      "savedAt": 1730000000000,
      "bots": [ /* Gateway Bot[] */ ],
      "groups": [ /* Rakazo Group[] */ ]
    }
  }
}
```

- 以**规范化 `baseUrl`** 分区；多 Gateway 互不覆盖。
- 成功 `refreshRoster` 后写入；群聊经 `groups.create` 后写入 `groups`。
- 拉取失败**不清除**已有条目，侧栏继续显示缓存。
- 兼容早期单快照 `{ v, baseUrl, bots, ... }`，读时升成 `byBaseUrl`。

### Drafts (`pica.drafts.v1`)

```json
{
  "v": 1,
  "byBaseUrl": {
    "https://rakazo.caiaiu.com": {
      "savedAt": 1730000000000,
      "drafts": { "<threadId>": "未发送正文" }
    }
  }
}
```

- Key 与现有选择模型一致：DM 用 bot 的 `thread_id`，群用 conversation / `local:` stub id。
- 输入约 250ms debounce；发送成功立即删该 thread；发送失败恢复正文并再持久化。
- 空字符串不落盘。

## 启动 / 离线 / 失效

1. **启动**：按 `pica.gateway.baseUrl` 立刻 hydrate → 侧栏有列表；打开线程可见草稿。
2. **连上**：`hello` → `refreshRoster` 用线上数据覆盖该 `baseUrl` 缓存。
3. **断开 / 错误**：名单与草稿仍在；不编造消息气泡。线程正文只保留本会话内存里已加载的部分。
4. **换 Gateway URL**：清空选中与内存消息，hydrate 新 URL 下的缓存（若有）。
5. **失效**：换 URL、清 localStorage、或调用 `clearLocalCache()`；单条草稿在发送成功后删除。

## 密钥 / 钥匙串（已落地）

- **Token**：桌面端存 OS keyring（macOS Keychain / Windows Credential Manager / Linux Secret Service），service `com.pica.desktop`，account `gateway-token`。实现：`secret_get` / `secret_set` / `secret_delete`（`keyring` crate）+ `src/lib/secrets.ts` / `hydrateSecrets`。
- **URL**：仍明文写在 `pica.gateway` localStorage（仅 `baseUrl`）；不再写 `token` 字段。
- **迁移**：首次 `hydrateConfig` 若 keyring 空且 localStorage 仍有明文 `token`，写入钥匙串后删除 localStorage 中的 `token`。
- **Settings**：仍可粘贴/更新 token；「Save and connect」走异步 `setConfig` → keyring。
- **浏览器 / `vite` 预览**：无 keyring 时 token 仍落 localStorage（开发便利）；正式桌面包不走这条路径。
- 未使用已弃用的 `tauri-plugin-stronghold`。

## 手动验证（离线）

1. 连上 Gateway，侧栏有 bot/group；某线程输入未发送草稿。
2. 停 Gateway 或断网 → 侧栏仍在；再开该线程草稿仍在。
3. 完全退出再开（Gateway 仍关）→ 名单与草稿从 localStorage 恢复；无虚假历史。
4. Gateway 恢复 → 列表刷新；发送成功后草稿从 UI 与 `pica.drafts.v1` 消失。
5. DevTools → Application → Local Storage 检查上述 key 的 `byBaseUrl`。

## 钥匙串验证

1. `npm run tauri dev`；Settings 填 Gateway URL + token → Save and connect。
2. DevTools → Application → Local Storage → `pica.gateway` 应只有 `baseUrl`，**无** `token`。
3. macOS「钥匙串访问」搜索 `com.pica.desktop` / `gateway-token` 可见条目。
4. 完全退出再开 → 应自动带 token 重连（无需再贴）。
5. 若升级前 localStorage 里已有明文 token：启动一次后明文消失，连接仍成功。
