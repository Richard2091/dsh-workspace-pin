# dsh-workspace-pin

[中文](#中文) · [English](#english)

[![version](https://img.shields.io/badge/version-0.2.0-blue)](https://github.com/Richard2091/dsh-workspace-pin/releases)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-8b5cf6)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![platform](https://img.shields.io/badge/platform-Web-success)]()
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

给 **DeepSeek Harness（DSH）Web 侧栏的工作区（文件夹）行**补上一个**和会话置顶完全同款**的图钉：hover 出现 16×16 的官方同款按钮，置顶后无 hover 时留一枚灰色实心 pin，悬浮提示用官方 Tooltip；点一下把该工作区钉到列表最前，顺序写进宿主的持久 registry。

纯浏览器半边插件，**不改 dsh 自身任何文件**（dsh 升级不会覆盖），视觉与交互直接复用官方实现。

![侧栏预览](preview/01-sidebar.png)

## 中文

### 为什么做这个

dsh 的侧栏里，**会话行自带置顶按钮**：hover 出现，点一下把会话钉到最前；置顶后面板不再 hover 时，行尾留一枚灰色实心图钉作为状态提示。

**工作区（文件夹）行没有这个入口**——只能靠拖拽排序，而新建工作区又会被宿主前插到列表最前。本插件把「会话置顶」那套图钉原样补到工作区行上：

- 同一个官方按钮类名（`Rows.module.css` 的 `*_iconButton`）与同一套 `IconPinOutline/IconPinFill` 图形；
- 同样的 16×16 尺寸、`--dsw-radius-xs` 圆角、`label-tertiary` 静止色、hover 时只变 `label-primary`、**无 hover 背景**；
- 同样的官方 `Tooltip`（`side: bottom`、`align: end`、`delayMs: 500`、`portal: true`）；
- 置顶后无 hover 时，行尾出现与官方 `*_pinIndicator` 同度量、同配色的**灰色实心图钉**，行一 hover 就让位给悬浮按钮。

### 效果

| 置顶后（无 hover） | hover 未置顶的工作区 |
|---|---|
| ![置顶后静止态](preview/02-pinned-rest.png) | ![hover 显示置顶按钮](preview/03-hover-pin.png) |

| hover 已置顶的工作区（取消置顶） | 会话行与工作区行并排 |
|---|---|
| ![hover 已置顶](preview/04-hover-unpin.png) | ![侧栏](preview/01-sidebar.png) |

### 与会话置顶的一致性

| 项 | 官方「会话置顶」 | 本插件「工作区置顶」 |
|---|---|---|
| 按钮类名 | `Rows.module.css` 的 `*_iconButton` | 复用同行官方按钮的同一个类名 |
| 尺寸 / 圆角 | 16×16 / `--dsw-radius-xs` | 相同 |
| 静止色 / hover 色 | `label-tertiary` / `label-primary` | 相同 |
| hover 背景 | 透明（无） | 相同 |
| 图标 | 14px `IconPinOutline` / `IconPinFill` | 相同（官方组件） |
| 悬浮提示 | 官方 `Tooltip`（bottom / end / portal / 500ms） | 相同（官方组件） |
| 置顶静止标记 | `*_pinIndicator`：16×20、`label-caption`、14px 实心 | 同度量同配色 |
| 行 hover 时标记隐藏 | 是 | 是 |

> 唯一实现差异：官方静止标记是 `margin-left: 6px`（会话行 `gap: 0`），工作区行本身
> `gap: 6px`，所以插件把 `margin-left` 取 0，由行间距承担同样的 6px。实测两者
> 「标记到前一元素」的间距和「标记/按钮到行右内边距」的距离完全一致。

### 安装

#### Windows（PowerShell）

```powershell
git clone https://github.com/Richard2091/dsh-workspace-pin.git
cd dsh-workspace-pin
pwsh -File .\install.ps1
```

#### macOS / Linux

```sh
git clone https://github.com/Richard2091/dsh-workspace-pin.git
cd dsh-workspace-pin
sh install.sh
```

#### 手动安装

安装脚本只动三处（前两处会先备份到 `~/.dsh-backup-<时间戳>/`）：

1. 把插件包复制到 `<profile>/plugins/dsh-workspace-pin`（`<profile>` 一般是
   `~/.dsh/profiles/web`）；
2. 在 `<profile>/node_modules/dsh-workspace-pin` 建一个指向它的 junction / 软链；
3. 把本仓库 `cordis.patch.yml` 里的 `insert` 块追加进 `<profile>/cordis.patch.yml`。

刷新浏览器里的 DSH Web 页面即生效（profile 配置由宿主 HMR 自动重组，本插件纯浏览器
半边，不需要重启 `dsh web`）。控制台执行 `window.__dshWorkspacePinVersion`，期望
`"0.2.0"`。

**已知坑**：以后在 profile 里跑 `pnpm install` 会清掉第 2 步的软链，重跑一次安装脚本
即可（脚本幂等）。

### 使用

- hover 任一工作区行 → 行尾出现图钉按钮（在官方「…」和「+」旁边，最右）；
- 点一下 → 该工作区钉到列表最前；再点一下取消置顶（取消**不会**把工作区挪回原位）；
- 置顶集合保存在**当前浏览器**的 `localStorage`（键 `dsh.workspace-pin.v1`，最近的置顶在前）；
- 工作区顺序通过官方客户端服务 `ctx.workspaces.insertBefore()` 写入宿主 registry，刷新/重启后仍在；
- 页面加载、工作区列表变化时会把已置顶的工作区重新排到最前——新建工作区被宿主前插时，置顶项仍回到顶部。

### 实现原理

- 官方工作区行渲染在 `[data-row-key="workspace:<id>"]` 上，行尾 `actions` 容器只在 hover / 菜单打开时显示；
  插件用 `MutationObserver` 跟踪行渲染，把「静止态灰色标记」插到 `actions` 前面，把「悬浮按钮」挂到
  `actions` 最右（与会话行里置顶按钮的位置一致）；
- 悬浮按钮直接复用同行官方按钮的 className（即官方 `Rows.module.css` 的 `*_iconButton`），并通过平台模块表
  拿到官方 React / `Tooltip` / `IconPinFill` / `IconPinOutline` 渲染——尺寸、颜色、hover、tooltip 全部继承官方；
- 拿不到官方原语时自动降级：等价兜底类名 + 内置同款 SVG + 原生 `title` 提示；
- 宿主半边是空实现，只为 Loader 条目提供合法入口；浏览器半边由 `package.json` 的 `dsh.client` 声明自动挂载。

### 兼容性

- 在 DSH **0.2.1-rc.2**（Web GUI）上实测；依赖官方工作区行 DOM 结构、`ctx.workspaces.insertBefore`
  客户端服务，以及平台模块表里的 `react` / `react-dom/client` / `@deepseek-ai/dsh-client-ui-primitives`；
- dsh 大版本升级后如果官方行结构 / 类名 / 模块表变化，需要跟着适配；
- 不修改 dsh 源码，也不 fork dsh；卸载即恢复原生侧栏。

### 已知限制

- 置顶集合是**浏览器本地**的：换浏览器 / 无痕窗口看不到同一份置顶（但顺序本身已经写进宿主）；
- 页面加载时会把已置顶工作区排到最前，这是一次**真实的顺序写入**（不是纯视觉排序）；
- 依赖官方 DOM / 类名，官方若调整 `Rows.module.css` 的类名或度量需要同步更新插件。

### 卸载

```powershell
pwsh -File .\uninstall.ps1   # Windows
```

```sh
sh uninstall.sh             # macOS / Linux
```

或手动删掉三处：`cordis.patch.yml` 里的安装块、`node_modules` 里的软链、`plugins` 里的插件目录，
然后刷新页面。已写入宿主的工作区顺序会保留（拖回去即可）。

### License

[MIT](LICENSE)

---

## English

[![version](https://img.shields.io/badge/version-0.2.0-blue)](https://github.com/Richard2091/dsh-workspace-pin/releases)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-8b5cf6)](https://www.npmjs.com/package/@deepseek-ai/dsh)
[![platform](https://img.shields.io/badge/platform-Web-success)]()
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**A workspace pin for the DeepSeek Harness (DSH) Web sidebar — styled and behaving exactly like the official session pin.**

Session rows in the DSH sidebar already have a pin: hover reveals a button, click to keep the session on top, and a small gray filled pin marks the row at rest. **Workspace (folder) rows don't** — they can only be reordered by dragging, and newly created workspaces get inserted at the top.

This plugin adds the same pin to workspace rows, reusing the official implementation instead of inventing a second style:

- the same official button class (`*_iconButton` from `Rows.module.css`) and the same `IconPinOutline/IconPinFill` artwork;
- the same 16×16 box, `--dsw-radius-xs` radius, `label-tertiary` rest color, `label-primary` on hover, and **no hover background**;
- the same official `Tooltip` (`side: bottom`, `align: end`, `delayMs: 500`, `portal: true`);
- when pinned and not hovered, the row shows a **gray filled pin** with the same metrics/colors as the official `*_pinIndicator`, which hides on hover to make room for the button.

Browser-side only. **No dsh source is modified** (dsh upgrades won't overwrite it), and no fork is needed.

![Sidebar preview](preview/01-sidebar.png)

### Screenshots

| Pinned, no hover | Hover an unpinned workspace |
|---|---|
| ![pinned at rest](preview/02-pinned-rest.png) | ![hover pin](preview/03-hover-pin.png) |

| Hover a pinned workspace (unpin) | Sidebar overview |
|---|---|
| ![hover unpin](preview/04-hover-unpin.png) | ![sidebar](preview/01-sidebar.png) |

### Parity with the official session pin

| Item | Official session pin | This plugin (workspace pin) |
|---|---|---|
| Button class | `*_iconButton` from `Rows.module.css` | Reuses the exact class of the sibling official buttons |
| Size / radius | 16×16 / `--dsw-radius-xs` | Same |
| Rest / hover color | `label-tertiary` / `label-primary` | Same |
| Hover background | Transparent (none) | Same |
| Icon | 14px `IconPinOutline` / `IconPinFill` | Same (official components) |
| Tooltip | Official `Tooltip` (bottom / end / portal / 500ms) | Same (official component) |
| Pinned rest marker | `*_pinIndicator`: 16×20, `label-caption`, 14px filled | Same metrics and colors |
| Marker hidden on row hover | Yes | Yes |

> The only implementation difference: the official marker uses `margin-left: 6px` because
> session rows have `gap: 0`; workspace rows already have `gap: 6px`, so this plugin uses
> `margin-left: 0` and lets the row gap provide the same 6px. Measured spacing to the
> previous element and to the row's right padding matches exactly.

### Install

#### Windows (PowerShell)

```powershell
git clone https://github.com/Richard2091/dsh-workspace-pin.git
cd dsh-workspace-pin
pwsh -File .\install.ps1
```

#### macOS / Linux

```sh
git clone https://github.com/Richard2091/dsh-workspace-pin.git
cd dsh-workspace-pin
sh install.sh
```

#### Manual

The installer only touches three places (the first two are backed up to `~/.dsh-backup-<timestamp>/`):

1. copy this package to `<profile>/plugins/dsh-workspace-pin` (`<profile>` is usually `~/.dsh/profiles/web`);
2. create a junction / symlink at `<profile>/node_modules/dsh-workspace-pin` pointing to it;
3. append the `insert` block from this repo's `cordis.patch.yml` to `<profile>/cordis.patch.yml`.

Then refresh the DSH Web page — the profile config is hot-reloaded, and the plugin is browser-side only, so no `dsh web` restart is needed. Check `window.__dshWorkspacePinVersion` in DevTools; it should read `"0.2.0"`.

**Known pitfall**: running `pnpm install` inside the profile wipes the symlink from step 2 (a DSH quirk). Just re-run the installer (it is idempotent).

### Usage

- Hover any workspace row → a pin button appears at the row end (rightmost, next to the official "…" and "+");
- Click → pin the workspace to the top; click again to unpin (unpinning does **not** restore the old position);
- The pinned set is stored in the **current browser's** `localStorage` (`dsh.workspace-pin.v1`, most recent first);
- The workspace order itself is written to the host registry through the official `ctx.workspaces.insertBefore()` client service, so it survives reloads and restarts;
- On page load and whenever the workspace list changes, pinned workspaces are moved back to the top (a newly created workspace inserted by the host won't push them down).

### How it works

- Official workspace rows render on `[data-row-key="workspace:<id>"]`, with a trailing `actions` container that only shows on hover / menu open. A `MutationObserver` tracks row rendering; the plugin inserts the rest-state marker right before that container and mounts the hover button as its last child (the same placement as the session pin).
- The hover button reuses the sibling official button's className (`*_iconButton` from `Rows.module.css`) and renders through the platform module table's official React / `Tooltip` / `IconPinFill` / `IconPinOutline`, so size, colors, hover and tooltip are inherited from the official implementation.
- If the official primitives are unavailable, it falls back to an equivalent local class, built-in SVG, and a native `title` tooltip.
- The host half is an empty implementation that only gives the Loader entry a valid entry point; the browser half is mounted automatically through the `dsh.client` declaration in `package.json`.

### Compatibility

- Tested on DSH **0.2.1-rc.2** (Web GUI). Depends on the official workspace row DOM, the `ctx.workspaces.insertBefore` client service, and the `react` / `react-dom/client` / `@deepseek-ai/dsh-client-ui-primitives` platform modules;
- Major dsh upgrades that change the row markup, the CSS-module class names, or that module table will need a matching plugin update;
- No dsh source modification and no fork; uninstalling restores the native sidebar.

### Limitations

- The pinned set is **browser-local**: another browser / incognito window won't see the same pins (the order itself is already persisted host-side);
- Pinned workspaces are reordered on page load — that's a **real order write**, not a visual-only sort;
- Dependent on the official DOM / class names; if `Rows.module.css` changes, the plugin needs an update.

### Uninstall

```powershell
pwsh -File .\uninstall.ps1   # Windows
```

```sh
sh uninstall.sh             # macOS / Linux
```

Or remove the three pieces manually (the `cordis.patch.yml` block, the `node_modules` link, the plugin directory), then refresh the page. The workspace order already written to the host is kept (drag it back if you want).

### License

[MIT](LICENSE)
