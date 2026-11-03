# Pica 桌面壳 · 原生能力（Lulu/HuLa 对齐）

本页描述客户端壳侧能力（Tauri plugins），**不是**服务器 `updater.*` RPC。

## 已落地

| 能力 | 说明 | 设置入口 |
|------|------|----------|
| 全局快捷键 | `tauri-plugin-global-shortcut`；默认关闭 | 设置 → 快捷键 · 截图 |
| 开机自启 | `tauri-plugin-autostart`（macOS LaunchAgent） | 设置 → 通用 · 启动 |
| 自动登录 | 偏好位；关则启动有会话仍进登录窗 | 设置 → 通用 · 启动 |
| 客户端更新 | `tauri-plugin-updater` | 设置 → 客户端更新 |
| 系统截图 | macOS `screencapture -i`；可藏主窗；进剪贴板 | 设置 → 快捷键 · 截图 |
| 提示音 | Web Audio；随 OS 通知 | 设置 → 通知 · 提示音 |
| Dock/托盘角标 | `set_tray_attention` → tray title + `set_badge_count` | 随侧栏未读自动同步 |
| 媒体子窗 | `?window=media` + ChildDragChrome | 点击聊天气泡截图 |
| 发送键 | Enter vs ⌘/Ctrl+Enter | 设置 → 发送键 |

## 客户端更新 endpoint（待填）

`src-tauri/tauri.conf.json` → `plugins.updater`：

```json
"updater": {
  "pubkey": "<minisign public key>",
  "endpoints": [
    "https://releases.example.com/pica/{{target}}/{{arch}}/{{current_version}}"
  ]
}
```

发行构建还需在 `bundle` 中启用 updater artifacts（见 Tauri 2 Updater 文档）。未配置时设置页「检查更新」会提示端点待填，不会崩溃。

## 与服务器 updater 的区别

- **壳更新**：本机安装包差分/整包（本插件）。
- **服务器 updater.\***：网关侧运维 RPC（SettingsOpsSections），勿混用。
