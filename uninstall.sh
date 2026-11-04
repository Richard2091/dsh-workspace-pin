#!/bin/sh
# dsh-workspace-pin 卸载脚本：删掉 patch 安装块、node_modules 软链和插件目录。
#
# 先备份当前 cordis.patch.yml 到 ~/.dsh-backup-<时间戳>/，再动三处：
#   1. cordis.patch.yml 里 # >>> dsh-workspace-pin >>> 到 # <<< dsh-workspace-pin <<< 之间
#   2. <profile>/node_modules/dsh-workspace-pin（软链）
#   3. <profile>/plugins/dsh-workspace-pin（插件包目录）
#
# 不改 dsh 自身文件，不重启服务；刷新页面即回到原生侧栏。
#
# 用法：sh uninstall.sh

set -eu

PROFILE_DIR="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
PLUGIN_NAME="dsh-workspace-pin"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/.dsh-backup-$STAMP"

if [ ! -d "$PROFILE_DIR" ]; then
	echo "找不到 profile 目录：$PROFILE_DIR" >&2
	exit 1
fi

echo "== 备份当前 patch =="
mkdir -p "$BACKUP_DIR"
if [ -f "$PATCH_FILE" ]; then
	cp -a "$PATCH_FILE" "$BACKUP_DIR/cordis.patch.yml"
	echo "  $BACKUP_DIR/cordis.patch.yml"
fi

echo "== 删除 patch 安装块 =="
if [ -f "$PATCH_FILE" ] && grep -q ">>> $PLUGIN_NAME >>>" "$PATCH_FILE" 2>/dev/null; then
	awk -v marker="$PLUGIN_NAME" '
		$0 ~ "^# >>> " marker " >>>" { skip = 1; next }
		$0 ~ "^# <<< " marker " <<<" { skip = 0; next }
		skip != 1 { print }
	' "$PATCH_FILE" >"$PATCH_FILE.tmp"
	mv "$PATCH_FILE.tmp" "$PATCH_FILE"
	echo "  已删除"
else
	echo "  没有找到安装块，跳过"
fi

echo "== 删除软链与插件目录 =="
rm -f "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
rm -rf "$PROFILE_DIR/plugins/$PLUGIN_NAME"
rmdir "$PROFILE_DIR/plugins" 2>/dev/null || true
echo "  已删除"

cat <<EOF

== 完成 ==
备份目录：$BACKUP_DIR
刷新浏览器页面即回到原生侧栏（已写入宿主的工作区顺序会保留，拖回去即可）。
EOF
