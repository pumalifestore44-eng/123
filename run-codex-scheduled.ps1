
$ErrorActionPreference = "Continue"

# Thu muc du an
Set-Location -LiteralPath $PSScriptRoot

# Tao thu muc log
$logDir = Join-Path $PSScriptRoot "scheduler-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$logFile = Join-Path $logDir (
    "codex-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log"
)

$prompt = @"
Read README.md, AGENTS.md and
PROJECT_OPERATING_GUIDE.md if they exist.

Analyze this project and report:
1. Project functions.
2. Supabase integration.
3. How AI requests are processed.
4. Requirements for scheduled automation.

This is a read-only test.
Do not change files or database records.
Do not publish posts or send messages.
Do not disclose credentials or secrets.
"@

Write-Host "Starting Codex AI..."

& codex -c 'windows.sandbox="unelevated"' exec --skip-git-repo-check --sandbox read-only $prompt *> $logFile

$exitCode = $LASTEXITCODE

Write-Host "Codex exit code: $exitCode"
Write-Host "Log: $logFile"

Get-Content -LiteralPath $logFile -Tail 40

