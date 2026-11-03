# Composer：附件与群 @

对齐 Rakazo contracts：`artifacts.create` + `threads.send`（`text?` / `artifactIds?` / `mentions?` / `clientNonce?`）。

## 群 @ 提及

- **何时**：当前选中为 **group** 线程时，Composer 从 `groups.members` 解析成员。
- **触发**：行首或空白后输入 `@`，弹出成员列表；可过滤。
- **选择**：↑↓ + Enter / Tab / 点击 → 插入 `@DisplayName `，并收集 `mentions`（bot id / `{kind,id}`）。
- **Esc**：关闭 picker。
- **发送**：`workspace.send({ text, artifactIds?, mentions? })` → `threads.send`；服务端是否按 mention 路由取决于网关。
- **渲染**：群线程文本里 `@Word` 浅色高亮。

## 附件（artifacts）

| 规则 | 值 |
|------|----|
| 个数 | 最多 **4** |
| 大小 | 单文件 ≤ **10 MiB** |
| 上传 | `artifacts.create`：`contentBase64` + filename/mime → 拿 `id` |
| 发送 | `threads.send` 带 `artifactIds`（**不再**把图片塞进 markdown data URL） |

入口：Plus → Files、拖放、粘贴图片。芯片可移除；空草稿但有附件也可发。

## 模型

- 打开 Composer 时 `models.list` + `models.role({ role: "main" })` 设默认。
- 下拉切换仅本机提示（未持久化到 prefs / 服务端）。

## API

- `GatewayClient.createArtifact` / `sendMessage(target, SendMessageInput)` / `listModels` / `getModelRole`
- `workspace.send(string | SendMessageInput)`
