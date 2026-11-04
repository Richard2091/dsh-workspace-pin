#!/bin/sh
# dsh-workspace-pin 安装脚本（macOS / Linux，幂等，可重复执行）。
#
# 只动三处，前两处先备份到 ~/.dsh-backup-<时间戳>/：
#   1. 把插件包复制到 <profile>/plugins/dsh-workspace-pin
#   2. 在 <profile>/node_modules 建同名软链
#   3. 在 <profile>/cordis.patch.yml 末尾写带上下标记的 insert 条目
#      （已有安装块则先删掉旧块再写）
#
# 不重启服务、不跑 pnpm install、不联网。本插件是纯浏览器半边：写完刷新一次
# 浏览器页面即生效（profile 配置由宿主 HMR 自动重组）。
#
# 注意：以后在 profile 里跑 pnpm install 会清掉第 2 步的软链（DSH 已知坑），
# 重跑一次本脚本即可；第 3 步是幂等的。
#
# 用法：sh install.sh

set -eu

PROFILE_DIR="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
PLUGIN_NAME="dsh-workspace-pin"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/.dsh-backup-$STAMP"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
TARGET_DIR="$PROFILE_DIR/plugins/$PLUGIN_NAME"

if [ ! -d "$PROFILE_DIR" ]; then
	echo "找不到 profile 目录：$PROFILE_DIR" >&2
	exit 1
fi

echo "== 备份 =="
mkdir -p "$BACKUP_DIR"
for file in cordis.patch.yml package.json; do
	if [ -f "$PROFILE_DIR/$file" ]; then
		cp -a "$PROFILE_DIR/$file" "$BACKUP_DIR/$file"
		echo "  $PROFILE_DIR/$file -> $BACKUP_DIR/$file"
	fi
done

echo "== 复制插件包 =="
mkdir -p "$PROFILE_DIR/plugins"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
for item in package.json cordis.patch.yml README.md LICENSE lib install.sh uninstall.sh install.ps1 uninstall.ps1; do
	if [ -e "$SRC_DIR/$item" ]; then
		cp -a "$SRC_DIR/$item" "$TARGET_DIR/"
	fi
done
echo "  $TARGET_DIR"

echo "== 链接到 profile 的 node_modules =="
ln -sfn "../plugins/$PLUGIN_NAME" "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
echo "  $PROFILE_DIR/node_modules/$PLUGIN_NAME -> ../plugins/$PLUGIN_NAME"

echo "== 写入 cordis.patch.yml =="
if [ -f "$PATCH_FILE" ] && grep -q ">>> $PLUGIN_NAME >>>" "$PATCH_FILE" 2>/dev/null; then
	awk -v marker="$PLUGIN_NAME" '
		$0 ~ "^# >>> " marker " >>>" { skip = 1; next }
		$0 ~ "^# <<< " marker " <<<" { skip = 0; next }
		skip != 1 { print }
	' "$PATCH_FILE" >"$PATCH_FILE.tmp"
	mv "$PATCH_FILE.tmp" "$PATCH_FILE"
	echo "  已移除旧的安装块"
fi

cat >>"$PATCH_FILE" <<'YAML'

# >>> dsh-workspace-pin >>>（由插件自带 install.sh 写入；卸载时连同上下标记一起删）
# 浏览器半边由 package.json 的 dsh.client 声明自动挂载，无需在 patch 里声明入口。
- insert:
    - id: workspace-pin
      name: 'dsh-workspace-pin'
      config: {}
# <<< dsh-workspace-pin <<<
YAML
echo "  已写入 $PATCH_FILE"

cat <<EOF

== 完成 ==
备份目录：$BACKUP_DIR

下一步：刷新浏览器里的 DSH Web GUI 页面（本插件纯浏览器半边，不需要重启 dsh web）。
验证：工作区行 hover 出现图钉；F12 控制台执行 window.__dshWorkspacePinVersion，期望 "0.2.0"。
回滚：sh uninstall.sh
EOF
