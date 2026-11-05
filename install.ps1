<#
.SYNOPSIS
  dsh-workspace-pin 安装脚本（Windows / PowerShell，幂等，可重复执行）。

.DESCRIPTION
  只动三处，前两处先备份到 %USERPROFILE%\.dsh-backup-<时间戳>\：
    1. <profile>\plugins\dsh-workspace-pin          插件包
    2. <profile>\node_modules\dsh-workspace-pin     指向插件包的 junction
    3. <profile>\cordis.patch.yml                   末尾写带上下标记的 insert 条目
                                                    （已有安装块则先替换）

  不重启服务、不跑 pnpm install、不联网。本插件是纯浏览器半边：写完刷新一次
  浏览器页面即可生效（profile 配置由宿主的 HMR 自动重组）。

  注意：以后在 profile 里跑 pnpm install 会清掉第 2 步的 junction（DSH 已知坑），
  重跑一次本脚本即可；第 3 步是幂等的，不会重复写入。

.PARAMETER ProfileDir
  DSH profile 目录，默认 %USERPROFILE%\.dsh\profiles\web。

.PARAMETER NoBackup
  跳过备份（不建议）。

.EXAMPLE
  pwsh -File .\install.ps1

.EXAMPLE
  pwsh -File .\install.ps1 -ProfileDir 'D:\dsh\profiles\web'
#>
[CmdletBinding()]
param(
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\web'),
  [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'

$PluginName = 'dsh-workspace-pin'
$SourceDir = $PSScriptRoot
$PatchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$PluginsDir = Join-Path $ProfileDir 'plugins'
$TargetDir = Join-Path $PluginsDir $PluginName
$LinkPath = Join-Path (Join-Path $ProfileDir 'node_modules') $PluginName

if (-not (Test-Path -LiteralPath $ProfileDir)) {
  throw "找不到 profile 目录：$ProfileDir"
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $env:USERPROFILE ".dsh-backup-$Stamp"

Write-Host "== 备份 =="
if ($NoBackup) {
  Write-Host '  已跳过（-NoBackup）'
} else {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  foreach ($file in @('cordis.patch.yml', 'package.json')) {
    $source = Join-Path $ProfileDir $file
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $BackupDir $file) -Force
      Write-Host "  $source -> $(Join-Path $BackupDir $file)"
    }
  }
}

Write-Host '== 复制插件包 =='
New-Item -ItemType Directory -Force -Path $PluginsDir | Out-Null
if (Test-Path -LiteralPath $TargetDir) {
  Remove-Item -LiteralPath $TargetDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
foreach ($item in @('package.json', 'cordis.patch.yml', 'README.md', 'README.en.md', 'LICENSE', 'lib', 'test')) {
  $source = Join-Path $SourceDir $item
  if (-not (Test-Path -LiteralPath $source)) { continue }
  Copy-Item -LiteralPath $source -Destination $TargetDir -Recurse -Force
}
Write-Host "  $TargetDir"

Write-Host '== 链接到 profile 的 node_modules =='
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LinkPath) | Out-Null
if (Test-Path -LiteralPath $LinkPath) {
  $existing = Get-Item -LiteralPath $LinkPath -Force
  if ($existing.LinkType) {
    cmd /c rmdir "$LinkPath" | Out-Null
  } else {
    Remove-Item -LiteralPath $LinkPath -Recurse -Force
  }
}
New-Item -ItemType Junction -Path $LinkPath -Target $TargetDir | Out-Null
Write-Host "  $LinkPath -> $TargetDir"

Write-Host '== 写入 cordis.patch.yml =='
$begin = '# >>> dsh-workspace-pin >>>'
$end = '# <<< dsh-workspace-pin <<<'
$block = @(
  "$begin`（由插件自带 install.ps1 写入；卸载时连同上下标记一起删）"
  '# 浏览器半边由 package.json 的 dsh.client 声明自动挂载，无需在 patch 里声明入口。'
  '- insert:'
  '    - id: workspace-pin'
  "      name: 'dsh-workspace-pin'"
  '      config: {}'
  "$end"
) -join "`r`n"

$text = if (Test-Path -LiteralPath $PatchFile) { Get-Content -LiteralPath $PatchFile -Raw } else { '' }
if ($text -match [regex]::Escape($begin)) {
  $pattern = '(?ms)^' + [regex]::Escape($begin) + '.*?^' + [regex]::Escape($end) + '\r?\n?'
  $text = [regex]::Replace($text, $pattern, '')
  Write-Host '  已移除旧的安装块'
}
if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`r`n" }
$text = $text.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
[IO.File]::WriteAllText($PatchFile, $text, [Text.UTF8Encoding]::new($false))
Write-Host "  $PatchFile"

Write-Host ''
Write-Host '== 完成 =='
if (-not $NoBackup) { Write-Host "备份目录：$BackupDir" }
Write-Host ''
Write-Host '下一步：刷新浏览器里的 DSH Web GUI 页面（本插件纯浏览器半边，不需要重启 dsh web）。'
Write-Host '验证：工作区行 hover 出现图钉；F12 控制台执行 window.__dshWorkspacePinVersion，期望 "0.3.0"，'
Write-Host '      window.__dshWorkspacePinStorageMode 期望 "host"（置顶集合已由宿主持久化）。'
Write-Host '置顶数据：<DSH_HOME>/storages/dsh-workspace-pin/state.json（删掉即重置置顶）。'
Write-Host '回滚：pwsh -File .\uninstall.ps1'
