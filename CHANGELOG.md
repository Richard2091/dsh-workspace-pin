# Changelog

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
