#!/usr/bin/env pwsh
<#
  TVio CI log grabber.

  After a release build (./run.ps1 "notes" -Bump) kicks off GitHub Actions, run
  this to capture the result — especially failures — into ci-logs/, which Claude
  can read directly. No more copy-pasting error logs by hand.

  Usage:
    ./logs.ps1          # grab the latest run's result right now
    ./logs.ps1 -Watch   # wait for the latest run to finish, then grab it
    ./logs.ps1 -Run 123 # a specific run id (from `gh run list`)

  Then tell Claude:  read ci-logs/build-error.log
#>
[CmdletBinding()]
param(
  [switch]$Watch,
  [string]$Run
)

$ErrorActionPreference = "Stop"
# Always operate on THIS repo, whatever directory it's invoked from.
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) not found. Install from https://cli.github.com/"
}

# Newest run for this repo (or the one you named).
$runId = if ($Run) {
  $Run
} else {
  $list = gh run list -L 1 --json databaseId | ConvertFrom-Json
  if (-not $list) { throw "No workflow runs found for this repo yet." }
  $list[0].databaseId
}

if ($Watch) {
  Write-Host "Watching run $runId until it finishes…" -ForegroundColor Cyan
  gh run watch $runId 2>$null
}

$j = gh run view $runId --json status,conclusion,displayTitle,headBranch | ConvertFrom-Json
$summary = "status=$($j.status)  conclusion=$($j.conclusion)  branch=$($j.headBranch)  title=$($j.displayTitle)"
Write-Host "Run $runId -> $summary"

$dir = Join-Path $PSScriptRoot "ci-logs"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$errFile  = Join-Path $dir "build-error.log"
$fullFile = Join-Path $dir "build-full.log"

# 1) The step tree (per-step ✓/✗) — almost always available, and usually enough
#    to name the step that failed even when raw logs can't be downloaded.
$tree = (gh run view $runId 2>&1 | Out-String)

# 2) Logs for each FAILED job (more reliable than run-level --log-failed).
$jobLogs = ""
try {
  $jobs = (gh run view $runId --json jobs | ConvertFrom-Json).jobs
  foreach ($job in $jobs) {
    if ($job.conclusion -eq "failure") {
      $jobLogs += "`r`n==== JOB: $($job.name) ====`r`n"
      $jobLogs += (gh run view $runId --job $job.databaseId --log 2>&1 | Out-String)
    }
  }
} catch {}
if ([string]::IsNullOrWhiteSpace($jobLogs)) { $jobLogs = (gh run view $runId --log-failed 2>&1 | Out-String) }
if ([string]::IsNullOrWhiteSpace($jobLogs)) { $jobLogs = "(no raw logs returned by gh — the step tree above should still name the failing step)" }

"Run $runId`r`n$summary`r`n`r`n==== STEP TREE ====`r`n$tree`r`n==== FAILED JOB LOGS ====`r`n$jobLogs" |
  Out-File -FilePath $errFile -Encoding utf8

# Complete log as a backup (can be large; sometimes empty for early failures).
gh run view $runId --log 2>&1 | Out-File -FilePath $fullFile -Encoding utf8

Write-Host ""
Write-Host "Wrote:" -ForegroundColor Green
Write-Host "  ci-logs/build-error.log  (failed steps — read this first)"
Write-Host "  ci-logs/build-full.log   (complete log)"
Write-Host "Now tell Claude:  read ci-logs/build-error.log"
