#!/usr/bin/env pwsh
<#
  TVio deploy helper.

  Usage:
    ./run.ps1                 # commit + push using the default upgrade notes below
    ./run.ps1 "my message"    # commit + push using "my message" as the upgrade notes

  Behaviour:
    - Requires GitHub CLI (gh) and git. Logs you in via `gh auth login` if needed.
    - If the "TVio" repo doesn't exist on your account, it is created and pushed.
    - If it already exists, your changes are committed and pushed.
    - The commit message is the override argument if you pass one, otherwise the
      $DefaultUpgradeNotes string below (bump it each release).
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$UpgradeNotes
)

$ErrorActionPreference = "Stop"
$RepoName = "TVio"

# ------------------------------------------------------------------------------
# Default "upgrade notes" — used as the commit message when no override is given.
# Update this each release.
# ------------------------------------------------------------------------------
$DefaultUpgradeNotes = "TVio update: Live TV performance, adaptive TV filters, addon streams & playback engines"

$Notes = if ([string]::IsNullOrWhiteSpace($UpgradeNotes)) { $DefaultUpgradeNotes } else { $UpgradeNotes }

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "==> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "==> $m" -ForegroundColor Yellow }

Info "TVio deploy"
Write-Host "    Upgrade notes: $Notes"

# --- Preconditions ------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found. Install Git first." }
if (-not (Get-Command gh  -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) not found. Install from https://cli.github.com/" }

# Ensure authenticated with GitHub
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Warn "Not logged in to GitHub — starting 'gh auth login'"
  gh auth login
}

$User = (gh api user --jq ".login").Trim()
if ([string]::IsNullOrWhiteSpace($User)) { throw "Could not determine your GitHub username." }
$Slug = "$User/$RepoName"

# --- Ensure a local git repo --------------------------------------------------
if (-not (Test-Path ".git")) {
  Info "Initializing local git repository"
  git init | Out-Null
  git branch -M main
}

# --- Commit any changes -------------------------------------------------------
git rev-parse --verify HEAD 2>$null | Out-Null
$hasHead = ($LASTEXITCODE -eq 0)

git add -A
$pending = git status --porcelain
if ($pending -or -not $hasHead) {
  if ($hasHead) { git commit -m $Notes | Out-Null }
  else          { git commit --allow-empty -m $Notes | Out-Null }
  Ok "Committed: $Notes"
} else {
  Info "No changes to commit"
}

# --- Ensure the remote repo exists --------------------------------------------
gh repo view $Slug 1>$null 2>$null
$repoExists = ($LASTEXITCODE -eq 0)

if (-not $repoExists) {
  Warn "Repo '$Slug' not found — creating it (public, for GitHub Pages)"
  # Creates the repo from the current directory, adds 'origin', and pushes.
  gh repo create $RepoName --public --source=. --remote=origin --push
  Ok "Created and pushed to https://github.com/$Slug"
}
else {
  if (-not ((git remote) -contains "origin")) {
    Info "Adding 'origin' remote"
    git remote add origin "https://github.com/$Slug.git"
  }
  Info "Pushing to $Slug"
  git push -u origin main
  Ok "Pushed to https://github.com/$Slug"
}

Info "Done. https://github.com/$Slug"
