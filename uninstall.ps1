<#
.SYNOPSIS
  dsh-workspace-pin 卸载脚本：删掉 patch 里的安装块、node_modules junction 和插件目录。

.DESCRIPTION
  先备份当前 cordis.patch.yml 到 %USERPROFILE%\.dsh-backup-<时间戳>\，再动三处：
    1. cordis.patch.yml 里 # >>> dsh-workspace-pin >>> 到 # <<< dsh-workspace-pin <<< 之间
    2. <profile>\node_modules\dsh-workspace-pin（junction）
    3. <profile>\plugins\dsh-workspace-pin（插件包目录）
  不改 dsh 自身文件，不重启服务；刷新页面即回到原生侧栏。

.PARAMETER ProfileDir
  DSH profile 目录，默认 %USERPROFILE%\.dsh\profiles\web。

.EXAMPLE
  pwsh -File .\uninstall.ps1
#>
[CmdletBinding()]
param(
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\web')
)

$ErrorActionPreference = 'Stop'

$PluginName = 'dsh-workspace-pin'
$PatchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$TargetDir = Join-Path (Join-Path $ProfileDir 'plugins') $PluginName
$LinkPath = Join-Path (Join-Path $ProfileDir 'node_modules') $PluginName

if (-not (Test-Path -LiteralPath $ProfileDir)) {
  throw "找不到 profile 目录：$ProfileDir"
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $env:USERPROFILE ".dsh-backup-$Stamp"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Write-Host '== 备份当前 patch =='
if (Test-Path -LiteralPath $PatchFile) {
  Copy-Item -LiteralPath $PatchFile -Destination (Join-Path $BackupDir 'cordis.patch.yml') -Force
  Write-Host "  $(Join-Path $BackupDir 'cordis.patch.yml')"
}

Write-Host '== 删除 patch 安装块 =='
$begin = '# >>> dsh-workspace-pin >>>'
$end = '# <<< dsh-workspace-pin <<<'
if ((Test-Path -LiteralPath $PatchFile) -and (([IO.File]::ReadAllText($PatchFile, [Text.UTF8Encoding]::new($false)).TrimStart([char]0xFEFF)) -match [regex]::Escape($begin))) {
  # 显式按 UTF-8 读写：Windows PowerShell 5.1 的 Get-Content 默认按 ANSI 解码，会损坏中文注释。
  $text = [IO.File]::ReadAllText($PatchFile, [Text.UTF8Encoding]::new($false)).TrimStart([char]0xFEFF)
  $pattern = '(?ms)^' + [regex]::Escape($begin) + '.*?^' + [regex]::Escape($end) + '\r?\n?'
  $text = [regex]::Replace($text, $pattern, '')
  [IO.File]::WriteAllText($PatchFile, $text.TrimEnd() + "`r`n", [Text.UTF8Encoding]::new($false))
  Write-Host '  已删除'
} else {
  Write-Host '  没有找到安装块，跳过'
}

Write-Host '== 删除 junction 与插件目录 =='
if (Test-Path -LiteralPath $LinkPath) {
  $existing = Get-Item -LiteralPath $LinkPath -Force
  if ($existing.LinkType) { cmd /c rmdir "$LinkPath" | Out-Null }
  else { Remove-Item -LiteralPath $LinkPath -Recurse -Force }
}
if (Test-Path -LiteralPath $TargetDir) {
  Remove-Item -LiteralPath $TargetDir -Recurse -Force
}
Write-Host '  已删除'

Write-Host ''
Write-Host '== 完成 =='
Write-Host "备份目录：$BackupDir"
Write-Host '刷新浏览器页面即回到原生侧栏（已写入宿主的工作区顺序会保留，拖回去即可）。'
Write-Host '置顶集合文件 <DSH_HOME>/storages/dsh-workspace-pin/state.json 不会被自动删除，需要时手动删。'
