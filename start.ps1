#requires -Version 5.1
<#
    玄门诡事录 · Windows 启动器（Node/TS + cordis）
    ------------------------------------------------------------
    双击 start.bat 即可；也可以直接跑这个脚本：

        .\start.ps1                 启动（默认 8888，自动开浏览器）
        .\start.ps1 -Port 9000      换端口
        .\start.ps1 -NoBrowser      不开浏览器
        .\start.ps1 -Rebuild        强制重新构建前端

    要求 Node >= 24（原生 TS 与 node:sqlite）。数据库默认 SQLite；
    需要 PostgreSQL / MySQL 时改 MOYU_DATABASE_URL，代码不用动。
#>

[CmdletBinding()]
param(
    [int]$Port = 8888,
    [switch]$NoBrowser,
    [switch]$Rebuild
)

# PowerShell 5.1 下原生命令往 stderr 写日志时，Stop 会当成异常；
# 所有外部命令一律靠 $LASTEXITCODE 判断。
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = $PSScriptRoot
$Server = Join-Path $Root 'server'
$Frontend = Join-Path $Root 'frontend'
$BaseUrl = "http://127.0.0.1:$Port"

function Write-Step([int]$n, [string]$text) {
    Write-Host ''
    Write-Host ("  [{0}/3] {1}" -f $n, $text) -ForegroundColor Cyan
}

function Write-Ok([string]$text) { Write-Host ("        ✓ " + $text) -ForegroundColor Green }
function Write-Warn2([string]$text) { Write-Host ("        ! " + $text) -ForegroundColor Yellow }

function Fail([string]$text, [string]$hint) {
    Write-Host ''
    Write-Host ("  × " + $text) -ForegroundColor Red
    if ($hint) { Write-Host ("    → " + $hint) -ForegroundColor DarkGray }
    Write-Host ''
    exit 1
}

function Find-Exe([string]$name, [string[]]$extra) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($path in $extra) {
        if ($path -and (Test-Path $path)) { return $path }
    }
    return $null
}

function Test-Up {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 2
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Open-UI {
    if ($NoBrowser) { return }
    try { Start-Process $BaseUrl | Out-Null } catch { }
}

Clear-Host
Write-Host ''
Write-Host '  玄门诡事录 · 本地跑团服务' -ForegroundColor White
Write-Host "  XUANWU OPS · $Root" -ForegroundColor DarkGray

if (-not (Test-Path $Server)) {
    Fail '找不到 server 目录' '请在项目根目录（含 server/ 与 frontend/）运行本脚本'
}

if (Test-Up) {
    Write-Host ''
    Write-Host "  服务已经在 $BaseUrl 上跑着，直接打开。" -ForegroundColor Green
    Open-UI
    exit 0
}

Write-Step 1 '检查工具链'
$node = Find-Exe 'node' @('C:\Program Files\nodejs\node.exe', 'D:\NodeJs\node.exe')
$npm = Find-Exe 'npm' @('C:\Program Files\nodejs\npm.cmd', 'D:\NodeJs\npm.cmd')
if (-not $node -or -not $npm) {
    Fail '没找到 node/npm' '装 Node >= 24：winget install OpenJS.NodeJS.LTS'
}
$nodeVersion = (& $node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 24) {
    Fail "Node 版本太低（当前 $nodeVersion，要求 >= 24）" '升级 Node 后重试'
}
Write-Ok "node v$nodeVersion"

Write-Step 2 '准备后端依赖'
$serverModules = Join-Path $Server 'node_modules'
if (-not (Test-Path $serverModules)) {
    Push-Location $Server
    try {
        & $npm install --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { Fail 'npm install 失败' '检查网络或 npm 镜像' }
        Write-Ok '后端依赖已安装'
    } finally { Pop-Location }
} else {
    Write-Ok '后端依赖已存在（重装：删掉 server\node_modules 后重跑）'
}

Write-Step 3 '检查前端产物'
$distIndex = Join-Path $Frontend 'dist\index.html'
if ($Rebuild -or -not (Test-Path $distIndex)) {
    Push-Location $Frontend
    try {
        if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
            Write-Warn2 '安装前端依赖…'
            & $npm install --no-fund --no-audit
            if ($LASTEXITCODE -ne 0) { Fail 'npm install 失败' '检查网络或 npm 镜像' }
        }
        Write-Warn2 '构建中…'
        & $npm run build
        if ($LASTEXITCODE -ne 0) { Fail '前端构建失败' '手动：cd frontend; npm run build' }
        Write-Ok '构建完成'
    } finally { Pop-Location }
} else {
    Write-Ok '已有 dist（强制重建：.\start.ps1 -Rebuild）'
}

Write-Host ''
Write-Host "  服务地址  $BaseUrl" -ForegroundColor White
Write-Host '  停止服务  Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
    Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 2; Start-Process $u } -ArgumentList $BaseUrl | Out-Null
}

$env:MOYU_PORT = "$Port"
Push-Location $Server
& $node 'src/index.ts'
