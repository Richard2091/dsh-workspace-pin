# Changelog

## 0.3.0 — 2026-11-04

置顶集合改为**宿主持久化**，与会话置顶同一套模型：跨浏览器、清缓存/无痕/换设备都不丢。

- **宿主半边**（`lib/index.js`）：注册精确路由 `GET|POST /plugins/dsh-workspace-pin/state`；
  准入复用官方 `ctx.connection.requestRejection()`（Host/Origin 围栏 + 浏览器会话鉴权）；
  状态落盘 `<DSH_HOME>/storages/dsh-workspace-pin/state.json`，临时文件 + rename 原子写；
  `pin`/`unpin` 为增量操作并由宿主串行化，多浏览器并发不互相覆盖；支持条目 config
  `stateFile` 自定义位置。只用 Node 内置模块，无新增依赖。
- **浏览器半边**（`lib/client.js`）：宿主是数据源——首帧用 localStorage 缓存兜底，随后
  `GET` 对齐；点击乐观更新后 `POST {op:"pin"|"unpin"}` 并用权威集合校正；页面重新可见时
  再对齐一次；旧版本 localStorage 置顶集合会一次性迁移到宿主；新增诊断
  `window.__dshWorkspacePinStorageMode`（`host` / `cache`）。
- **文档**：README 拆成中文 `README.md` 与英文 `README.en.md`；删除「置顶集合是浏览器
  本地」的已知限制，补充数据位置、重置方式、`stateFile` 配置与宿主/缓存降级说明。
- 新增宿主半边单元测试 `test/host-state.test.mjs`（`node --test`，覆盖读写、增量语义、
  并发串行化、准入拒绝、边界错误、损坏文件）。

## 0.2.0 — 2026-11-04

图钉的显示逻辑与样式整体对齐官方「会话置顶」：

- **悬浮按钮**改用官方实现：复用 `Rows.module.css` 的 `*_iconButton` 类名，通过平台模块表里的官方
  React / `Tooltip` / `IconPinFill` / `IconPinOutline` 渲染。尺寸由 20×20 修正为 16×16，圆角改为
  `--dsw-radius-xs`，去掉自造的 hover 背景色，置顶态不再变蓝（保持官方灰色），悬浮提示从原生
  `title` 换成官方 Tooltip（bottom / end / portal / 500ms）。
- **新增静止态标记**：置顶后无 hover 时，行尾显示 16×20、`label-caption` 的灰色实心图钉（对齐官方
  `*_pinIndicator`）；行 hover 时隐藏，让位给悬浮按钮；未置顶的行静止态不显示图钉。
- 拿不到官方 UI 原语时自动降级为等价兜底类名 + 内置同款 SVG + 原生 `title`，功能不受影响。
- 补齐仓库化内容：双语 README、MIT LICENSE、`cordis.patch.yml`、`install.ps1` / `uninstall.ps1`、
  `install.sh` / `uninstall.sh`、脱敏效果图。

## 0.1.3

- 工作区行置顶（hover 图钉、点按钉到最前、置顶集合存 localStorage、顺序写宿主 registry）。

## 0.1.0

- 首个可用版本。
