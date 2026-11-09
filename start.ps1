#requires -Version 5.1
<#
    玄门诡事录 · Windows 启动器
    ------------------------------------------------------------
    双击 start.bat 即可；也可以直接跑这个脚本：

        .\start.ps1                 启动（默认 8888，自动开浏览器）
        .\start.ps1 -Port 9000      换端口
        .\start.ps1 -NoBrowser      不开浏览器
        .\start.ps1 -Rebuild        强制重新构建前端
        .\start.ps1 -SkipDb         跳过数据库检查

    脚本是幂等的：依赖装过就跳过，表已经是最新就不动，端口上已有服务就
    直接开浏览器。按 Ctrl+C 停止服务。
#>

[CmdletBinding()]
param(
    [int]$Port = 8888,
    [switch]$NoBrowser,
    [switch]$Rebuild,
    [switch]$SkipDb
)

# 注意：这里必须是 Continue，不能是 Stop。
# PowerShell 5.1 下原生命令（uv / npm / alembic）往 stderr 写 INFO 日志时，
# Stop 会把它当成异常抛出来。所有外部命令一律靠 $LASTEXITCODE 判断。
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$BaseUrl = "http://127.0.0.1:$Port"
$Total = 6

function Write-Step([int]$n, [string]$text) {
    Write-Host ''
    Write-Host ("  [{0}/{1}] {2}" -f $n, $Total, $text) -ForegroundColor Cyan
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

function Find-Psql {
    $direct = Find-Exe 'psql' @()
    if ($direct) { return $direct }
    $roots = @('C:\Program Files\PostgreSQL', 'D:\Postgres', 'D:\Program Files\PostgreSQL',
               'C:\PostgreSQL', 'D:\Program Files\POSQL', 'D:\PostgreSQL')
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $hit = Get-ChildItem -LiteralPath $root -Recurse -Filter 'psql.exe' -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

function Test-Up {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/api/dashboard" -UseBasicParsing -TimeoutSec 2
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Open-UI {
    if ($NoBrowser) { return }
    try { Start-Process $BaseUrl | Out-Null } catch { }
}

# ------------------------------------------------------------------ 抬头
Clear-Host
Write-Host ''
Write-Host '  玄门诡事录 · 本地跑团服务' -ForegroundColor White
Write-Host "  XUANWU OPS · $Root" -ForegroundColor DarkGray

if (-not (Test-Path $Backend)) {
    Fail '找不到 backend 目录' '请在项目根目录（含 backend/ 与 frontend/）运行本脚本'
}

# ------------------------------------------------------------------ 0. 已在运行？
if (Test-Up) {
    Write-Host ''
    Write-Host "  服务已经在 $BaseUrl 上跑着，直接打开。" -ForegroundColor Green
    Open-UI
    exit 0
}

# ------------------------------------------------------------------ 1. 工具链
Write-Step 1 '检查工具链'
$uv = Find-Exe 'uv' @(
    (Join-Path $env:USERPROFILE '.cargo\bin\uv.exe'),
    (Join-Path $env:USERPROFILE '.local\bin\uv.exe'),
    'D:\python\Scripts\uv.exe'
)
if (-not $uv) {
    Fail '没找到 uv（Python 包管理器）' '装上再跑：winget install --id=astral-sh.uv -e'
}
Write-Ok "uv  $uv"

$node = Find-Exe 'node' @('C:\Program Files\nodejs\node.exe', 'D:\NodeJs\node.exe')
$npm = Find-Exe 'npm' @('C:\Program Files\nodejs\npm.cmd', 'D:\NodeJs\npm.cmd')
if (-not $node -or -not $npm) {
    Write-Warn2 '没找到 node/npm —— 前端只能复用已有构建产物（frontend/dist）'
} else {
    Write-Ok "node $(& $node --version)"
}

# ------------------------------------------------------------------ 2. 数据库
Write-Step 2 '检查数据库'

# 先看配置里用的是哪种库：SQLite（默认）/ PostgreSQL / MySQL
$dbUrl = 'sqlite+aiosqlite:///./data/moyu.db'
$envFileProbe = Join-Path $Backend '.env'
if (Test-Path $envFileProbe) {
    $probe = Select-String -Path $envFileProbe -Pattern '^\s*MOYU_DATABASE_URL\s*=\s*(.+)$' -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($probe) { $dbUrl = $probe.Matches[0].Groups[1].Value.Trim() }
}

$sqliteMode = $dbUrl -like 'sqlite*'
if ($sqliteMode) {
    $dataDir = Join-Path $Backend 'data'
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
    $dbFile = ($dbUrl -replace '^sqlite[^:]*:///+', '') -replace '/', '\'
    if (-not [System.IO.Path]::IsPathRooted($dbFile)) { $dbFile = Join-Path $Backend $dbFile }
    if (Test-Path $dbFile) {
        $sizeKb = [math]::Round((Get-Item $dbFile).Length / 1KB, 1)
        Write-Ok ("SQLite  {0}  ({1} KB)" -f $dbFile, $sizeKb)
    } else {
        Write-Ok ("SQLite  首次运行，将新建 {0}" -f $dbFile)
    }
} else {
    Write-Ok ("方言 {0}" -f ($dbUrl -split ':')[0])
}

$dbHost = '127.0.0.1'
$dbPort = 5432
$dbUser = 'postgres'
$dbPass = '123456'
$dbName = 'moyu_trpg'

$envFile = Join-Path $Backend '.env'
if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^\s*MOYU_DATABASE_URL\s*=\s*(.+)$' -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($line) {
        $url = $line.Matches[0].Groups[1].Value.Trim()
        $m = [regex]::Match($url, '://(?<user>[^:]+):(?<pass>[^@]*)@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^?]+)')
        if ($m.Success) {
            $dbUser = $m.Groups['user'].Value
            $dbPass = $m.Groups['pass'].Value
            $dbHost = $m.Groups['host'].Value
            $dbPort = [int]$m.Groups['port'].Value
            $dbName = $m.Groups['db'].Value
        }
    }
}

if ($SkipDb) {
    Write-Warn2 '按参数跳过数据库检查'
} elseif ($sqliteMode) {
    # SQLite 不需要起服务、不需要建库，上面已经确认过目录和文件
} else {
    $listening = $false
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($dbHost, $dbPort, $null, $null)
        $listening = $async.AsyncWaitHandle.WaitOne(1500, $false) -and $client.Connected
        $client.Close()
    } catch { $listening = $false }

    if (-not $listening) {
        $svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($svc) {
            Fail "PostgreSQL 没在监听 ${dbHost}:${dbPort}（服务 $($svc.Name) 状态：$($svc.Status)）" `
                 "启动它：Start-Service $($svc.Name)（需要管理员）"
        }
        Fail "PostgreSQL 没在监听 ${dbHost}:${dbPort}" '先装好 PG 并启动服务'
    }
    Write-Ok "PostgreSQL ${dbHost}:${dbPort} 可连"

    $psql = Find-Psql
    if (-not $psql) {
        Write-Warn2 "没找到 psql，跳过建库检查（库名 $dbName 需已存在）"
    } else {
        $env:PGPASSWORD = $dbPass
        $exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "select 1 from pg_database where datname='$dbName'" 2>$null
        if ($exists -ne '1') {
            Write-Warn2 "库 $dbName 不存在，正在创建…"
            & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "create database $dbName encoding 'UTF8'" | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Fail "建库失败（口令或权限？）" "手动建库：psql -U $dbUser -c `"create database $dbName`""
            }
            Write-Ok "已创建数据库 $dbName"
        } else {
            Write-Ok "数据库 $dbName 已存在"
        }
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# ------------------------------------------------------------------ 3. 后端依赖
Write-Step 3 '同步后端依赖'
Push-Location $Backend
try {
    $venvPython = Join-Path $Backend '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        Write-Warn2 '首次运行，正在创建虚拟环境并安装依赖（可能要一两分钟）…'
    }
    & $uv sync --quiet
    if ($LASTEXITCODE -ne 0) {
        Fail 'uv sync 失败' '检查网络，或手动在 backend/ 下执行 uv sync'
    }
    Write-Ok '依赖就绪'
} finally {
    Pop-Location
}

# ------------------------------------------------------------------ 4. 数据库结构
Write-Step 4 '应用数据库迁移'
Push-Location $Backend
try {
    $migrate = & $uv run alembic upgrade head 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host $migrate -ForegroundColor DarkGray
        Fail '迁移失败' '手动排查：cd backend; uv run alembic upgrade head'
    }
    $current = (& $uv run alembic current 2>&1 | Select-Object -Last 1)
    Write-Ok "结构已是最新（$current）"
} finally {
    Pop-Location
}

# ------------------------------------------------------------------ 5. 前端产物
Write-Step 5 '检查前端构建'
$distIndex = Join-Path $Frontend 'dist\index.html'
$needBuild = $Rebuild -or (-not (Test-Path $distIndex))
if (-not $needBuild) {
    Write-Ok '已有 dist，跳过构建（要强制重建加 -Rebuild）'
} elseif (-not $node) {
    Fail '需要构建前端，但没找到 node' '装 Node.js 后重试：winget install OpenJS.NodeJS.LTS'
} else {
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
    } finally {
        Pop-Location
    }
}

# ------------------------------------------------------------------ 6. 启动
Write-Step 6 "启动服务 $BaseUrl"
$opener = $null
if (-not $NoBrowser) {
    $opener = Start-Job -ArgumentList $BaseUrl -ScriptBlock {
        param($url)
        for ($i = 0; $i -lt 80; $i++) {
            try {
                Invoke-WebRequest -Uri "$url/api/dashboard" -UseBasicParsing -TimeoutSec 2 | Out-Null
                break
            } catch { Start-Sleep -Milliseconds 500 }
        }
        try { Start-Process $url | Out-Null } catch { }
    }
}

Write-Host ''
Write-Host '  ┌────────────────────────────────────────────────┐' -ForegroundColor DarkGray
Write-Host ("  │  服务地址  {0,-34}│" -f $BaseUrl) -ForegroundColor White
Write-Host '  │  接口文档  /api/docs                            │' -ForegroundColor DarkGray
Write-Host '  │  停止服务  Ctrl+C                               │' -ForegroundColor DarkGray
Write-Host '  └────────────────────────────────────────────────┘' -ForegroundColor DarkGray
Write-Host ''

Push-Location $Backend
try {
    & $uv run uvicorn app.main:app --host 127.0.0.1 --port $Port --log-level info
} finally {
    Pop-Location
    if ($opener) {
        Stop-Job $opener -ErrorAction SilentlyContinue
        Remove-Job $opener -Force -ErrorAction SilentlyContinue
    }
    Write-Host ''
    Write-Host '  服务已停止。' -ForegroundColor DarkGray
}
